import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readFrozenDistributionPackage } from "./distribution.ts";
import {
  isArticleDraftPlatform,
  PUBLISH_PLATFORM_DEFINITIONS,
  type ArticleDraftPlatform,
  type PublishPlatform,
} from "./platforms.ts";
import type { ContentSummary } from "./types.ts";

export type { ArticleDraftPlatform } from "./platforms.ts";

function articlePlatformName(platform: ArticleDraftPlatform): string {
  return PUBLISH_PLATFORM_DEFINITIONS[platform].name;
}

export interface ArticleDraftInput {
  platform: ArticleDraftPlatform;
  id: string;
  title: string;
  summary: string;
  html: string;
  tags: string[];
  coverMime: string;
  coverBase64: string;
  taskName: string;
}

export interface PreparedArticleDraftRun {
  input: ArticleDraftInput;
}

interface RemoteArticleDraftResult {
  ok: true;
  platform: ArticleDraftPlatform;
  status: "REMOTE_VERIFIED";
  verified: true;
  remoteId: string;
  draftStorage: "remote";
  draftUrl: string;
  taskSpace: string;
}

interface BrowserLocalArticleDraftResult {
  ok: true;
  platform: ArticleDraftPlatform;
  status: "LOCAL_VERIFIED";
  verified: true;
  draftReceipt: string;
  draftStorage: "browser-local";
  draftUrl: string;
  taskSpace: string;
}

export type ArticleDraftResult = RemoteArticleDraftResult | BrowserLocalArticleDraftResult;

export interface ArticleDraftRunHandle {
  pid: number;
  completion: Promise<
    | {
        ok: true;
        url: string;
        remoteId?: string;
        draftReceipt?: string;
        draftStorage?: "remote" | "browser-local";
        taskSpace: string;
      }
    | { ok: false; error: string }
  >;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function markdownToWechatHtml(markdown: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push(`<ul>${list.map((line) => `<li>${inlineMarkdown(line)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === undefined) code = [];
      else {
        blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = undefined;
      }
      continue;
    }
    if (code !== undefined) {
      code.push(rawLine);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet?.[1] !== undefined) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  if (code !== undefined) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return `<section style="margin:0 6px;line-height:1.75;font-size:15px;color:#333">${blocks.join("")}</section>`;
}

function imageMime(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function prepareArticleDraftRun(
  item: ContentSummary,
  platform: PublishPlatform,
): Promise<PreparedArticleDraftRun> {
  if (!isArticleDraftPlatform(platform)) {
    throw new Error(`尚未接入图文草稿：${platform}`);
  }
  const articlePlatform = platform;
  const platformName = articlePlatformName(articlePlatform);
  const frozen = await readFrozenDistributionPackage(item.folderPath);
  if (frozen === undefined) throw new Error("缺少 Harness 冻结分发包");
  if (frozen.id !== item.id) throw new Error("冻结分发包与当前内容不匹配");
  if (frozen.mode !== "article" || frozen.selection.mode !== "article") {
    throw new Error(`${platformName}草稿需要文章 + 封面冻结分发包`);
  }
  const variant = frozen.variants[articlePlatform];
  if (variant === undefined) throw new Error(`冻结分发包缺少${platformName}平台变体`);
  const cover = await readFile(frozen.selection.coverPath);
  if (cover.length === 0) throw new Error("所选文章封面为空");
  return {
    input: {
      platform: articlePlatform,
      id: item.id,
      title: variant.title,
      summary: variant.summary,
      html: markdownToWechatHtml(variant.body),
      tags: variant.tags,
      coverMime: imageMime(frozen.selection.coverPath),
      coverBase64: cover.toString("base64"),
      taskName: `oil-${articlePlatform}-draft-${item.id}-${Date.now()}`.slice(0, 120),
    },
  };
}

export async function resolveArticleDraftScript(preferred?: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [
    preferred,
    join(here, "article-draft.mjs"),
    join(here, "..", "scripts", "article-draft.mjs"),
  ]) {
    if (path === undefined) continue;
    if (await access(path).then(() => true, () => false)) return path;
  }
  throw new Error("article-draft.mjs is missing; rebuild dsh-oil-creator");
}

function articleDraftFailure(
  raw: string,
  code: number | null,
  platform: ArticleDraftPlatform,
): string {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as { error?: string };
      if (typeof parsed.error === "string" && parsed.error.trim() !== "") return parsed.error;
    } catch {
      continue;
    }
  }
  const detail = raw.trim();
  return detail === ""
    ? `${articlePlatformName(platform)}草稿运行器退出：${code}`
    : detail.slice(-2000);
}

export async function startArticleDraftRun(
  prepared: PreparedArticleDraftRun,
): Promise<ArticleDraftRunHandle> {
  const source = await readFile(await resolveArticleDraftScript(), "utf8");
  const prelude = `var OIL_ARTICLE_INPUT = ${JSON.stringify(prepared.input)};\n`;
  const child = spawn("ego-browser", ["nodejs"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  if (child.pid === undefined) throw new Error("Ego Browser 图文草稿运行器启动失败");
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer | string) => { stdout += String(chunk); });
  child.stderr?.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
  child.stdin?.on("error", () => undefined);
  child.stdin?.end(`${prelude}${source}`);
  const completion = new Promise<Awaited<ArticleDraftRunHandle["completion"]>>((resolve) => {
    child.once("error", (cause) => {
      const code = (cause as NodeJS.ErrnoException).code;
      resolve({
        ok: false,
        error: code === "ENOENT" ? "未找到 ego-browser，请先安装 Ego Lite" : cause.message,
      });
    });
    child.once("exit", (code) => {
      const raw = `${stdout}\n${stderr}`;
      if (code !== 0) {
        resolve({
          ok: false,
          error: articleDraftFailure(raw, code, prepared.input.platform),
        });
        return;
      }
      try {
        const result = parseArticleDraftOutput(raw, prepared.input.platform);
        resolve({
          ok: true,
          url: result.draftUrl,
          ...(result.status === "REMOTE_VERIFIED"
            ? { remoteId: result.remoteId }
            : { draftReceipt: result.draftReceipt }),
          draftStorage: result.draftStorage,
          taskSpace: result.taskSpace,
        });
      } catch (cause) {
        resolve({
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    });
  });
  child.unref();
  return { pid: child.pid, completion };
}

export function parseArticleDraftOutput(
  raw: string,
  expectedPlatform: ArticleDraftPlatform,
): ArticleDraftResult {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as Partial<ArticleDraftResult> & { error?: string };
      if (parsed.ok !== true) {
        if (parsed.error !== undefined) throw new Error(parsed.error);
        continue;
      }
      if (parsed.verified !== true) {
        throw new Error(`${articlePlatformName(expectedPlatform)}未通过草稿页面验证`);
      }
      const hasRemoteEvidence = parsed.status === "REMOTE_VERIFIED"
        && typeof parsed.remoteId === "string"
        && parsed.remoteId.trim() !== ""
        && parsed.draftStorage === "remote";
      const hasLocalEvidence = parsed.status === "LOCAL_VERIFIED"
        && typeof parsed.draftReceipt === "string"
        && parsed.draftReceipt.trim() !== ""
        && parsed.draftStorage === "browser-local";
      if ((!hasRemoteEvidence && !hasLocalEvidence)
        || parsed.platform !== expectedPlatform
        || typeof parsed.draftUrl !== "string"
        || parsed.draftUrl.trim() === ""
        || typeof parsed.taskSpace !== "string"
        || parsed.taskSpace.trim() === "") {
        throw new Error("Ego Browser 返回的图文草稿结果不完整");
      }
      return parsed as ArticleDraftResult;
    } catch (cause) {
      if (cause instanceof SyntaxError) continue;
      throw cause;
    }
  }
  throw new Error("Ego Browser 未返回图文草稿结果");
}
