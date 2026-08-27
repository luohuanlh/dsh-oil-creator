import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isFrozenDistributionPackageFresh,
  readFrozenDistributionPackage,
} from "./distribution.ts";
import { renderMarkdownWechatHtml } from "./articlePreview.ts";
import {
  isArticleDraftPlatform,
  PUBLISH_PLATFORM_DEFINITIONS,
  type ArticleDraftPlatform,
  type PublishPlatform,
} from "./platforms.ts";
import type { ContentSummary } from "./types.ts";

export type { ArticleDraftPlatform } from "./platforms.ts";

export const ARTICLE_DRAFT_TIMEOUT_MS = 10 * 60 * 1000;
export const ARTICLE_DRAFT_OUTPUT_LIMIT_BYTES = 512 * 1024;
const ARTICLE_DRAFT_CLEANUP_TIMEOUT_MS = 30 * 1000;
const ARTICLE_DRAFT_KILL_GRACE_MS = 5 * 1000;

type SpawnProcess = typeof spawn;

export interface StartArticleDraftRunOptions {
  spawnProcess?: SpawnProcess;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
  outputLimitBytes?: number;
}

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

export function markdownToWechatHtml(markdown: string): string {
  return renderMarkdownWechatHtml(markdown);
}

function escapeBasicHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function basicInlineMarkdown(value: string): string {
  return escapeBasicHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToBasicArticleHtml(markdown: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map(basicInlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push(`<ul>${list.map((line) => `<li>${basicInlineMarkdown(line)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === undefined) code = [];
      else {
        blocks.push(`<pre><code>${escapeBasicHtml(code.join("\n"))}</code></pre>`);
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
      blocks.push(`<h${level}>${basicInlineMarkdown(heading[2])}</h${level}>`);
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
  if (code !== undefined) blocks.push(`<pre><code>${escapeBasicHtml(code.join("\n"))}</code></pre>`);
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
  if (!await isFrozenDistributionPackageFresh(item.folderPath, frozen)) {
    throw new Error("文章已修改，请重新生成平台文案");
  }
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
      html: articlePlatform === "wechat-mp"
        ? markdownToWechatHtml(variant.body)
        : markdownToBasicArticleHtml(variant.body),
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

interface ArticleDraftFailureDetail {
  error: string;
  status?: string;
  taskSpace?: string;
  handedOff: boolean;
}

function articleDraftFailure(
  raw: string,
  code: number | null,
  platform: ArticleDraftPlatform,
): ArticleDraftFailureDetail {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as {
        error?: string;
        status?: string;
        taskSpace?: string;
        handedOff?: boolean;
      };
      if (typeof parsed.error === "string" && parsed.error.trim() !== "") {
        return {
          error: parsed.error,
          ...(typeof parsed.status === "string" ? { status: parsed.status } : {}),
          ...(typeof parsed.taskSpace === "string" ? { taskSpace: parsed.taskSpace } : {}),
          handedOff: parsed.handedOff === true,
        };
      }
    } catch {
      continue;
    }
  }
  const detail = raw.trim();
  return {
    error: detail === ""
      ? `${articlePlatformName(platform)}草稿运行器退出：${code}`
      : detail.slice(-2000),
    handedOff: false,
  };
}

interface EgoNodeProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
  error?: Error;
}

function appendCappedOutput(
  current: Buffer,
  chunk: Buffer | string,
  limitBytes: number,
): { buffer: Buffer; truncated: boolean } {
  const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  if (next.length >= limitBytes) {
    return { buffer: next.subarray(next.length - limitBytes), truncated: true };
  }
  if (current.length + next.length <= limitBytes) {
    return { buffer: Buffer.concat([current, next]), truncated: false };
  }
  const retained = limitBytes - next.length;
  return {
    buffer: Buffer.concat([current.subarray(current.length - retained), next]),
    truncated: true,
  };
}

function startEgoNodeProcess(
  source: string,
  options: {
    spawnProcess: SpawnProcess;
    timeoutMs: number;
    outputLimitBytes: number;
  },
): { pid: number; completion: Promise<EgoNodeProcessResult> } {
  const child = options.spawnProcess("ego-browser", ["nodejs"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  if (child.pid === undefined) throw new Error("Ego Browser 图文草稿运行器启动失败");

  let stdout: Buffer = Buffer.alloc(0);
  let stderr: Buffer = Buffer.alloc(0);
  let outputTruncated = false;
  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const completion = new Promise<EgoNodeProcessResult>((resolve) => {
    let settled = false;
    const finish = (result: EgoNodeProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      resolve(result);
    };
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const appended = appendCappedOutput(stdout, chunk, options.outputLimitBytes);
      stdout = appended.buffer;
      outputTruncated ||= appended.truncated;
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const appended = appendCappedOutput(stderr, chunk, options.outputLimitBytes);
      stderr = appended.buffer;
      outputTruncated ||= appended.truncated;
    });
    child.once("error", (cause) => {
      finish({
        code: null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        outputTruncated,
        error: cause,
      });
    });
    child.once("exit", (code) => {
      finish({
        code,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        outputTruncated,
      });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => { child.kill("SIGKILL"); }, ARTICLE_DRAFT_KILL_GRACE_MS);
      killTimer.unref?.();
    }, options.timeoutMs);
    timeout.unref?.();
  });
  child.stdin?.on("error", () => undefined);
  child.stdin?.end(source);
  child.unref();
  return { pid: child.pid, completion };
}

async function completeArticleTaskSpace(
  taskSpace: string,
  options: {
    spawnProcess: SpawnProcess;
    timeoutMs: number;
    outputLimitBytes: number;
  },
): Promise<void> {
  const source = [
    `const result = await completeTaskSpace(${JSON.stringify(taskSpace)}, { keep: false });`,
    "cliLog(JSON.stringify(result));",
  ].join("\n");
  const cleanup = startEgoNodeProcess(source, options);
  const result = await cleanup.completion;
  if (result.error !== undefined || result.timedOut || result.code !== 0) {
    throw result.error ?? new Error(
      result.timedOut
        ? "Ego Browser task space 清理超时"
        : `Ego Browser task space 清理失败：${result.code}`,
    );
  }
  const lines = result.stdout.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const completed = lines.some((line) => {
    try {
      return (JSON.parse(line) as { done?: boolean }).done === true;
    } catch {
      return false;
    }
  });
  if (!completed) throw new Error("Ego Browser 未确认 task space 已关闭");
}

async function cleanupArticleTaskSpace(
  taskSpace: string,
  options: {
    spawnProcess: SpawnProcess;
    timeoutMs: number;
    outputLimitBytes: number;
  },
): Promise<void> {
  await completeArticleTaskSpace(taskSpace, options).catch((cause) => {
    process.emitWarning(
      `Ego Browser task space 清理失败（${taskSpace}）：${cause instanceof Error ? cause.message : String(cause)}`,
      { code: "OIL_ARTICLE_TASK_SPACE_CLEANUP_FAILED" },
    );
  });
}

export async function startArticleDraftRun(
  prepared: PreparedArticleDraftRun,
  options: StartArticleDraftRunOptions = {},
): Promise<ArticleDraftRunHandle> {
  const source = await readFile(await resolveArticleDraftScript(), "utf8");
  const prelude = `var OIL_ARTICLE_INPUT = ${JSON.stringify(prepared.input)};\n`;
  const spawnProcess = options.spawnProcess ?? spawn;
  const outputLimitBytes = options.outputLimitBytes ?? ARTICLE_DRAFT_OUTPUT_LIMIT_BYTES;
  const run = startEgoNodeProcess(`${prelude}${source}`, {
    spawnProcess,
    timeoutMs: options.timeoutMs ?? ARTICLE_DRAFT_TIMEOUT_MS,
    outputLimitBytes,
  });
  const cleanupOptions = {
    spawnProcess,
    timeoutMs: options.cleanupTimeoutMs ?? ARTICLE_DRAFT_CLEANUP_TIMEOUT_MS,
    outputLimitBytes,
  };
  const completion = run.completion.then(async (processResult) => {
    const raw = `${processResult.stdout}\n${processResult.stderr}`;
    if (processResult.error !== undefined) {
      const code = (processResult.error as NodeJS.ErrnoException).code;
      return {
        ok: false as const,
        error: code === "ENOENT"
          ? "未找到 ego-browser，请先安装 Ego Lite"
          : processResult.error.message,
      };
    }
    if (processResult.timedOut) {
      await cleanupArticleTaskSpace(prepared.input.taskName, cleanupOptions);
      return {
        ok: false as const,
        error: `${articlePlatformName(prepared.input.platform)}草稿运行超过 ${Math.round((options.timeoutMs ?? ARTICLE_DRAFT_TIMEOUT_MS) / 60_000)} 分钟，已终止`,
      };
    }
    if (processResult.code !== 0) {
      const failure = articleDraftFailure(raw, processResult.code, prepared.input.platform);
      if (!failure.handedOff) {
        await cleanupArticleTaskSpace(failure.taskSpace ?? prepared.input.taskName, cleanupOptions);
      }
      return { ok: false as const, error: failure.error };
    }
    try {
      const result = parseArticleDraftOutput(raw, prepared.input.platform);
      if (result.status === "REMOTE_VERIFIED") {
        await cleanupArticleTaskSpace(result.taskSpace, cleanupOptions);
      }
      return {
        ok: true as const,
        url: result.draftUrl,
        ...(result.status === "REMOTE_VERIFIED"
          ? { remoteId: result.remoteId }
          : { draftReceipt: result.draftReceipt }),
        draftStorage: result.draftStorage,
        taskSpace: result.taskSpace,
      };
    } catch (cause) {
      await cleanupArticleTaskSpace(prepared.input.taskName, cleanupOptions);
      return {
        ok: false as const,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  return { pid: run.pid, completion };
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
