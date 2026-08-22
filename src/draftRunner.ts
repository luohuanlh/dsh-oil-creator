import { spawn } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultFindSkillDir } from "./capabilities.ts";
import { prepareCoverVariant } from "./coverVariants.ts";
import { readFrozenDistributionPackage } from "./distribution.ts";
import {
  PUBLISH_PLATFORM_DEFINITIONS,
  supportsAutoDraft,
  toVideoPublisherPlatform,
} from "./platforms.ts";
import type { ContentSummary, PublishPlatform } from "./types.ts";

export interface PreparedDraftRun {
  packagePath: string;
  platforms: PublishPlatform[];
  runnerPlatforms: string[];
}

export interface DraftRunHandle {
  pid: number;
  completion: Promise<VideoDraftBatchResult | VideoDraftOutcome>;
}

export type VideoDraftOutcome =
  | { ok: true; url: string; remoteId?: string; draftReceipt?: string; taskSpace: string }
  | { ok: true; staged: true; taskSpace: string }
  | { ok: false; error: string };

export interface VideoDraftBatchResult {
  ok: true;
  results: Partial<Record<PublishPlatform, VideoDraftOutcome>>;
}

export interface VideoDraftResult {
  ok: true;
  platform: "bilibili" | "douyin" | "xiaohongshu" | "channels" | "kuaishou";
  verified: true;
  remoteId?: string;
  draftReceipt?: string;
  draftUrl: string;
  taskSpace: string;
}

interface VideoStagedResult {
  ok: true;
  staged: true;
  taskSpace: string;
}

interface VideoDraftPlatformInput {
  platform: PublishPlatform;
  runnerPlatform: string;
  expectedTitle?: string;
  expectedDescription?: string;
  expectedCaption?: string;
  expectedFileName?: string;
}

function safePackageName(id: string, maxLength = 120): string {
  return id.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, maxLength) || "content";
}

export async function prepareDraftRun(
  item: ContentSummary,
  dataDir: string,
  platforms: readonly PublishPlatform[],
): Promise<PreparedDraftRun> {
  const unique = [...new Set(platforms)];
  if (unique.length === 0) throw new Error("至少选择一个自动草稿平台");
  const unsupported = unique.filter((platform) => !supportsAutoDraft(platform));
  if (unsupported.length > 0) {
    throw new Error(`尚未接入自动草稿：${unsupported.join("、")}`);
  }
  const source = await readFrozenDistributionPackage(item.folderPath);
  if (source === undefined) {
    throw new Error("缺少 Harness 冻结分发包；请先在工作台选择素材并生成平台变体");
  }
  if (source.id !== item.id) throw new Error("冻结分发包与当前内容不匹配");
  if (source.mode !== "video" || source.selection.mode !== "video") {
    throw new Error("当前草稿运行器只接受视频冻结分发包");
  }
  const videoPath = source.selection.videoPath;
  if (videoPath === undefined || !(await stat(videoPath).then((info) => info.isFile(), () => false))) {
    throw new Error("内容文件夹里没有可用的 MP4/MOV 成片");
  }
  for (const platform of unique) {
    if (source.variants[platform] === undefined) {
      throw new Error(`冻结分发包缺少${PUBLISH_PLATFORM_DEFINITIONS[platform].name}平台变体`);
    }
  }
  const first = source.variants[unique[0]!]!;
  const bilibiliOnly = unique.length === 1 && unique[0] === "bilibili";
  const kuaishouOnly = unique.length === 1 && unique[0] === "kuaishou";
  const selectedCoverPath = source.selection.coverPath;
  const needsVerticalCover = selectedCoverPath !== undefined
    && unique.some((platform) => platform === "xiaohongshu"
      || platform === "douyin"
      || platform === "channels");
  const needsHorizontalCover = selectedCoverPath !== undefined
    && unique.some((platform) => platform === "douyin"
      || platform === "bilibili"
      || platform === "channels"
      || platform === "kuaishou");
  const [verticalCover, horizontalCover] = await Promise.all([
    needsVerticalCover
      ? prepareCoverVariant(dataDir, selectedCoverPath, "3:4")
      : undefined,
    needsHorizontalCover
      ? prepareCoverVariant(dataDir, selectedCoverPath, "4:3")
      : undefined,
  ]);
  const customCover = selectedCoverPath === undefined
    ? {}
    : {
        cover: {
          uploadCustomCover: true,
          ...(verticalCover === undefined ? {} : { vertical3x4Path: verticalCover.path }),
          ...(horizontalCover === undefined ? {} : { horizontal4x3Path: horizontalCover.path }),
        },
      };
  const bilibiliCoverStrategy = bilibiliOnly
    ? selectedCoverPath === undefined
      ? {
          bilibiliCoverStrategy: "platform-ai" as const,
          cover: { uploadCustomCover: false },
        }
      : { bilibiliCoverStrategy: "custom" as const }
    : {};
  const kuaishouCoverDefault = kuaishouOnly && selectedCoverPath === undefined
    ? { cover: { uploadCustomCover: false } }
    : {};
  const derived = {
    title: first.title,
    description: first.body,
    tags: first.tags,
    videoPath,
    ...(source.selection.subtitlePath === undefined
      ? {}
      : { subtitlePath: source.selection.subtitlePath }),
    ...customCover,
    ...bilibiliCoverStrategy,
    ...kuaishouCoverDefault,
    ...(source.variants.xiaohongshu === undefined ? {} : {
      xhsTitle: source.variants.xiaohongshu.title,
      description: source.variants.xiaohongshu.body,
      xhsTopics: source.variants.xiaohongshu.tags,
    }),
    ...(source.variants.douyin === undefined ? {} : {
      douyinTitle: source.variants.douyin.title,
      douyinDescription: source.variants.douyin.body,
      douyinTopics: source.variants.douyin.tags,
    }),
    ...(source.variants.bilibili === undefined ? {} : {
      bilibiliTitle: source.variants.bilibili.title,
      bilibiliDescription: source.variants.bilibili.body,
      bilibiliTags: source.variants.bilibili.tags,
    }),
    ...(source.variants.channels === undefined ? {} : {
      wechatTitle: source.variants.channels.title,
      wechatDescription: source.variants.channels.body,
      wechatTags: source.variants.channels.tags,
    }),
    ...(source.variants.kuaishou === undefined ? {} : {
      kuaishouTitle: source.variants.kuaishou.title,
      kuaishouDescription: source.variants.kuaishou.body,
      kuaishouTopics: source.variants.kuaishou.tags,
    }),
  };
  const packageRoot = join(dataDir, "draft-packages");
  await mkdir(packageRoot, { recursive: true });
  const packagePath = join(
    packageRoot,
    `${safePackageName(item.id, 80)}--${unique.join("-")}.json`,
  );
  await writeFile(packagePath, `${JSON.stringify(derived, null, 2)}\n`, "utf8");
  return {
    packagePath,
    platforms: unique,
    runnerPlatforms: unique.flatMap((platform) => {
      const mapped = toVideoPublisherPlatform(platform);
      return mapped === undefined ? [] : [mapped];
    }),
  };
}

function resolveVideoPublisherRoot(): string {
  const found = defaultFindSkillDir("video-publisher");
  if (found === undefined) {
    throw new Error("未发现 video-publisher Skill，请先安装自动发布工作流");
  }
  return found;
}

async function resolveRuntimeScript(name: string, preferred?: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [
    preferred,
    join(here, name),
    join(here, "..", "scripts", name),
  ]) {
    if (path === undefined) continue;
    if (await access(path).then(() => true, () => false)) return path;
  }
  throw new Error(`${name} is missing; rebuild dsh-oil-creator`);
}

export function parseVideoDraftOutput(
  raw: string,
  expectedPlatform: "bilibili" | "douyin" | "xiaohongshu" | "channels" | "kuaishou" = "bilibili",
): VideoDraftResult {
  const platformName = PUBLISH_PLATFORM_DEFINITIONS[expectedPlatform].name;
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as Partial<VideoDraftResult> & { error?: string };
      if (parsed.ok !== true) {
        if (typeof parsed.error === "string" && parsed.error.trim() !== "") {
          throw new Error(parsed.error);
        }
        continue;
      }
      if (parsed.verified !== true) throw new Error(`${platformName}未通过远端草稿验证`);
      if (parsed.platform !== expectedPlatform
        || typeof parsed.draftUrl !== "string"
        || parsed.draftUrl.trim() === ""
        || typeof parsed.taskSpace !== "string"
        || !((typeof parsed.remoteId === "string" && parsed.remoteId.trim() !== "")
          || (typeof parsed.draftReceipt === "string" && parsed.draftReceipt.trim() !== ""))) {
        throw new Error(`Ego Browser 返回的${platformName}草稿结果不完整`);
      }
      return parsed as VideoDraftResult;
    } catch (cause) {
      if (cause instanceof SyntaxError) continue;
      throw cause;
    }
  }
  throw new Error(`Ego Browser 未返回${platformName}远端草稿结果`);
}

function parseVideoStagedOutput(raw: string): VideoStagedResult {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as Partial<VideoStagedResult> & { error?: string };
      if (parsed.ok !== true) {
        if (typeof parsed.error === "string" && parsed.error.trim() !== "") throw new Error(parsed.error);
        continue;
      }
      if (parsed.staged !== true || typeof parsed.taskSpace !== "string") {
        throw new Error("video-publisher 页面 READY 结果不完整");
      }
      return parsed as VideoStagedResult;
    } catch (cause) {
      if (cause instanceof SyntaxError) continue;
      throw cause;
    }
  }
  throw new Error("video-publisher 未返回页面 READY 结果");
}

function isVideoDraftOutcome(value: unknown): value is VideoDraftOutcome {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok === false) {
    return typeof candidate.error === "string" && candidate.error.trim() !== "";
  }
  if (candidate.ok !== true || typeof candidate.taskSpace !== "string") return false;
  if (candidate.staged === true) return true;
  return typeof candidate.url === "string" && candidate.url.trim() !== ""
    && ((typeof candidate.remoteId === "string" && candidate.remoteId.trim() !== "")
      || (typeof candidate.draftReceipt === "string" && candidate.draftReceipt.trim() !== ""));
}

function parseVideoDraftBatchOutput(
  raw: string,
  expectedPlatforms: readonly PublishPlatform[],
): VideoDraftBatchResult {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as {
        ok?: unknown;
        error?: unknown;
        results?: unknown;
      };
      if (parsed.ok !== true) {
        if (typeof parsed.error === "string" && parsed.error.trim() !== "") {
          throw new Error(parsed.error);
        }
        continue;
      }
      if (typeof parsed.results !== "object" || parsed.results === null) {
        throw new Error("video-publisher 多平台结果不完整");
      }
      const results = parsed.results as Partial<Record<PublishPlatform, unknown>>;
      for (const platform of expectedPlatforms) {
        if (!isVideoDraftOutcome(results[platform])) {
          throw new Error(`${PUBLISH_PLATFORM_DEFINITIONS[platform].name}草稿结果不完整`);
        }
      }
      return parsed as VideoDraftBatchResult;
    } catch (cause) {
      if (cause instanceof SyntaxError) continue;
      throw cause;
    }
  }
  throw new Error("video-publisher 未返回多平台草稿结果");
}

export async function startVideoDraftRun(
  prepared: PreparedDraftRun,
  options: { confirmOriginalRights?: boolean } = {},
): Promise<DraftRunHandle> {
  const root = resolveVideoPublisherRoot();
  const runner = join(root, "scripts", "run-safe-platforms.sh");
  if (!(await stat(runner).then((info) => info.isFile(), () => false))) {
    throw new Error(`video-publisher 运行器不存在：${runner}`);
  }
  const wrapper = await resolveRuntimeScript("video-draft-runner.mjs");
  const saverScript = await resolveRuntimeScript("video-draft.mjs");
  const suffix = `oil-${basename(prepared.packagePath, ".json")}`;
  const derived = JSON.parse(await readFile(prepared.packagePath, "utf8")) as {
    bilibiliTitle?: unknown;
    douyinTitle?: unknown;
    xhsTitle?: unknown;
    wechatDescription?: unknown;
    kuaishouTitle?: unknown;
    kuaishouDescription?: unknown;
    kuaishouTopics?: unknown;
    videoPath?: unknown;
  };
  const platformInputs = prepared.platforms.map((platform): VideoDraftPlatformInput => {
    const runnerPlatform = toVideoPublisherPlatform(platform);
    if (runnerPlatform === undefined) {
      throw new Error(`${PUBLISH_PLATFORM_DEFINITIONS[platform].name}缺少 video-publisher 平台映射`);
    }
    const expectedTitleValue = platform === "bilibili"
      ? derived.bilibiliTitle
      : platform === "douyin"
        ? derived.douyinTitle
        : platform === "xiaohongshu"
          ? derived.xhsTitle
          : platform === "kuaishou"
            ? derived.kuaishouTitle
            : undefined;
    const requiresTitle = platform === "bilibili"
      || platform === "douyin"
      || platform === "xiaohongshu"
      || platform === "kuaishou";
    if (requiresTitle
      && (typeof expectedTitleValue !== "string" || expectedTitleValue.trim() === "")) {
      throw new Error(`${PUBLISH_PLATFORM_DEFINITIONS[platform].name}冻结标题缺失`);
    }
    const expectedCaption = platform === "kuaishou"
      ? [
          String(derived.kuaishouTitle || "").trim(),
          String(derived.kuaishouDescription || "").trim(),
          Array.isArray(derived.kuaishouTopics)
            ? derived.kuaishouTopics.map((topic) => `#${String(topic).replace(/^#+/, "").trim()}`).filter((topic) => topic !== "#").join(" ")
            : "",
        ].filter(Boolean).join("\n")
      : undefined;
    const expectedDescription = platform === "channels"
      && typeof derived.wechatDescription === "string"
      ? derived.wechatDescription
      : undefined;
    if (platform === "channels" && (!expectedDescription || expectedDescription.trim() === "")) {
      throw new Error("视频号冻结描述缺失");
    }
    const expectedFileName = platform === "kuaishou" && typeof derived.videoPath === "string"
      ? basename(derived.videoPath)
      : undefined;
    return {
      platform,
      runnerPlatform,
      ...(typeof expectedTitleValue === "string" ? { expectedTitle: expectedTitleValue } : {}),
      ...(expectedDescription === undefined ? {} : { expectedDescription }),
      ...(expectedCaption === undefined ? {} : { expectedCaption }),
      ...(expectedFileName === undefined ? {} : { expectedFileName }),
    };
  });
  const child = spawn(process.execPath, [wrapper], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OIL_VIDEO_DRAFT_RUN: JSON.stringify({
        publisherRunner: runner,
        publisherCwd: dirname(runner),
        packagePath: prepared.packagePath,
        suffix,
        runnerPlatforms: prepared.runnerPlatforms,
        platforms: platformInputs,
        saverScript,
        confirmOriginalRights: options.confirmOriginalRights === true,
      }),
    },
  });
  if (child.pid === undefined) throw new Error("自动草稿运行器启动失败");
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer | string) => { stdout = `${stdout}${String(chunk)}`.slice(-24_000); });
  child.stderr?.on("data", (chunk: Buffer | string) => { stderr = `${stderr}${String(chunk)}`.slice(-12_000); });
  const completion = new Promise<VideoDraftBatchResult | { ok: false; error: string }>((resolve) => {
    child.once("error", (cause) => {
      resolve({ ok: false, error: cause.message });
    });
    child.once("exit", (code) => {
      if (code === 0) {
        try {
          resolve(parseVideoDraftBatchOutput(`${stdout}\n${stderr}`, prepared.platforms));
        } catch (cause) {
          resolve({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
        }
        return;
      }
      const detail = `${stdout}\n${stderr}`.trim();
      resolve({
        ok: false,
        error: detail === "" ? `自动草稿运行器退出：${code}` : detail.slice(-2000),
      });
    });
  });
  child.unref();
  return { pid: child.pid, completion };
}
