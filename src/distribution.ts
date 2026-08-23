import { createHash } from "node:crypto";
import { readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { ARTICLE_DIR, SCRIPT_NAME, TOPIC_NAME } from "./artifacts.ts";
import {
  isPublishPlatform,
  platformGenerationRule,
  PUBLISH_PLATFORM_DEFINITIONS,
  type PublishPlatform,
} from "./platforms.ts";

export const DISTRIBUTION_PACKAGE_NAME = ".oil-distribution.json";

export interface LocalContentAsset {
  name: string;
  path: string;
}

export interface ContentAssets {
  videos: LocalContentAsset[];
  subtitles: LocalContentAsset[];
  articles: LocalContentAsset[];
  covers: LocalContentAsset[];
}

export type AssetSelection =
  | { mode: "video"; videoPath: string; subtitlePath?: string; coverPath?: string }
  | {
      mode: "article";
      articlePath: string;
      coverPath: string;
      articleTitle?: string;
      articleSummary?: string;
    };

export interface DistributionSource {
  mode: AssetSelection["mode"];
  sourceText: string;
  videoPath?: string;
  subtitlePath?: string;
  articlePath?: string;
  coverPath?: string;
}

export interface PlatformVariant {
  platform: PublishPlatform;
  title: string;
  summary: string;
  body: string;
  tags: string[];
}

export interface FrozenDistributionPackage {
  schemaVersion: 2;
  id: string;
  mode: AssetSelection["mode"];
  createdAt: string;
  sourceDigest: string;
  selection: AssetSelection;
  variants: Partial<Record<PublishPlatform, Omit<PlatformVariant, "platform">>>;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".ass", ".vtt", ".txt"]);
const ARTICLE_EXTENSIONS = new Set([".md", ".markdown", ".html", ".htm"]);
const COVER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type DistributionAssetKind = "video" | "subtitle" | "article" | "cover";

export function distributionSourceDigest(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

const ASSET_RULES: Record<DistributionAssetKind, {
  extensions: ReadonlySet<string>;
  label: string;
}> = {
  video: { extensions: VIDEO_EXTENSIONS, label: "所选视频" },
  subtitle: { extensions: SUBTITLE_EXTENSIONS, label: "所选字幕" },
  article: { extensions: ARTICLE_EXTENSIONS, label: "所选文章" },
  cover: { extensions: COVER_EXTENSIONS, label: "所选封面" },
};

function extension(path: string): string {
  return extname(path).toLowerCase();
}

async function assetsIn(
  folderPath: string,
  extensions: ReadonlySet<string>,
): Promise<LocalContentAsset[]> {
  const names = await readdir(folderPath).catch(() => []);
  return names
    .filter((name) => extensions.has(extension(name)))
    .sort((left, right) => left.localeCompare(right, "zh"))
    .map((name) => ({ name, path: join(folderPath, name) }));
}

export async function discoverContentAssets(folderPath: string): Promise<ContentAssets> {
  const [videos, subtitles, topArticles, nestedArticles, topCovers, nestedCovers] = await Promise.all([
    assetsIn(folderPath, VIDEO_EXTENSIONS),
    assetsIn(folderPath, SUBTITLE_EXTENSIONS),
    assetsIn(folderPath, ARTICLE_EXTENSIONS),
    assetsIn(join(folderPath, ARTICLE_DIR), ARTICLE_EXTENSIONS),
    assetsIn(folderPath, COVER_EXTENSIONS),
    assetsIn(join(folderPath, ARTICLE_DIR), COVER_EXTENSIONS),
  ]);
  return {
    videos,
    subtitles,
    articles: [...topArticles, ...nestedArticles],
    covers: [...topCovers, ...nestedCovers],
  };
}

export async function validateLocalContentAsset(
  folderPath: string,
  candidatePath: string,
  kind: DistributionAssetKind,
): Promise<string> {
  const { extensions: allowedExtensions, label } = ASSET_RULES[kind];
  if (!isAbsolute(candidatePath)) throw new Error(`${label}必须使用绝对路径`);
  const resolvedCandidate = resolve(candidatePath);
  const folder = await realpath(folderPath).catch(() => resolve(folderPath));
  const candidate = await realpath(resolvedCandidate).catch(() => resolvedCandidate);
  const inside = relative(folder, candidate);
  if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`${label}不属于当前内容文件夹`);
  }
  const info = await stat(candidate).catch(() => undefined);
  if (info === undefined || !info.isFile()) throw new Error(`${label}不存在或不是文件`);
  if (!allowedExtensions.has(extension(candidate))) throw new Error(`${label}文件类型不受支持`);
  return candidate;
}

async function readVideoContext(folderPath: string): Promise<string> {
  const entries = await Promise.all(
    [SCRIPT_NAME, TOPIC_NAME].map(async (name) => ({
      name,
      text: (await readFile(join(folderPath, name), "utf8").catch(() => "")).trim(),
    })),
  );
  return entries
    .filter((entry) => entry.text !== "")
    .map((entry) => `## ${entry.name}\n\n${entry.text}`)
    .join("\n\n");
}

export async function readDistributionSource(
  folderPath: string,
  selection: AssetSelection,
): Promise<DistributionSource> {
  if (selection.mode === "article") {
    const articlePath = await validateLocalContentAsset(folderPath, selection.articlePath, "article");
    const coverPath = await validateLocalContentAsset(folderPath, selection.coverPath, "cover");
    return {
      mode: "article",
      articlePath,
      coverPath,
      sourceText: (await readFile(articlePath, "utf8")).trim(),
    };
  }

  const videoPath = await validateLocalContentAsset(folderPath, selection.videoPath, "video");
  const coverPath = selection.coverPath === undefined
    ? undefined
    : await validateLocalContentAsset(folderPath, selection.coverPath, "cover");
  if (selection.subtitlePath === undefined) {
    return {
      mode: "video",
      videoPath,
      ...(coverPath === undefined ? {} : { coverPath }),
      sourceText: await readVideoContext(folderPath),
    };
  }
  const subtitlePath = await validateLocalContentAsset(folderPath, selection.subtitlePath, "subtitle");
  return {
    mode: "video",
    videoPath,
    subtitlePath,
    ...(coverPath === undefined ? {} : { coverPath }),
    sourceText: (await readFile(subtitlePath, "utf8")).trim(),
  };
}

function normalizedVariant(variant: PlatformVariant): Omit<PlatformVariant, "platform"> {
  const title = variant.title.trim();
  const summary = variant.summary.trim();
  const body = variant.body.trim();
  const tags = variant.tags
    .map((tag) => tag.replace(/^#+\s*/, "").trim())
    .filter((tag, index, all) => tag !== "" && all.indexOf(tag) === index);
  if (title === "") throw new Error(`${variant.platform} 缺少标题`);
  if (body === "") throw new Error(`${variant.platform} 缺少正文或视频说明`);
  if (tags.length === 0) throw new Error(`${variant.platform} 至少需要一个标签`);
  const rule = platformGenerationRule(variant.platform);
  if (title.length > rule.titleMax) {
    throw new Error(`${rule.name}标题超过 ${rule.titleMax} 字：${title.length}`);
  }
  if (summary.length > rule.summaryMax) {
    throw new Error(`${rule.name}摘要超过 ${rule.summaryMax} 字：${summary.length}`);
  }
  if (tags.length > rule.tagsMax) {
    throw new Error(`${rule.name}标签超过 ${rule.tagsMax} 个：${tags.length}`);
  }
  return { title, summary, body, tags };
}

function sameSelection(left: AssetSelection, right: AssetSelection): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "video" && right.mode === "video") {
    return left.videoPath === right.videoPath
      && left.subtitlePath === right.subtitlePath
      && left.coverPath === right.coverPath;
  }
  if (left.mode === "article" && right.mode === "article") {
    return left.articlePath === right.articlePath
      && left.coverPath === right.coverPath
      && left.articleTitle === right.articleTitle
      && left.articleSummary === right.articleSummary;
  }
  return false;
}

function sameVariantPlatforms(
  left: FrozenDistributionPackage["variants"],
  right: FrozenDistributionPackage["variants"],
): boolean {
  return Object.keys(left).sort().join("|") === Object.keys(right).sort().join("|");
}

export async function freezeDistributionPackage(input: {
  id: string;
  folderPath: string;
  selection: AssetSelection;
  variants: PlatformVariant[];
  createdAt?: string;
}): Promise<{ packagePath: string; package: FrozenDistributionPackage }> {
  if (input.id.trim() === "") throw new Error("内容 id 不能为空");
  const source = await readDistributionSource(input.folderPath, input.selection);
  if (source.sourceText === "" && source.mode === "article") throw new Error("所选文章为空");
  if (input.variants.length === 0) throw new Error("至少需要一个平台变体");

  const variants: FrozenDistributionPackage["variants"] = {};
  for (const variant of input.variants) {
    if (!isPublishPlatform(variant.platform)) throw new Error(`未知平台：${String(variant.platform)}`);
    if (PUBLISH_PLATFORM_DEFINITIONS[variant.platform].kind !== source.mode) {
      throw new Error(`素材类型与平台不匹配：${PUBLISH_PLATFORM_DEFINITIONS[variant.platform].name}`);
    }
    if (variants[variant.platform] !== undefined) throw new Error(`平台变体重复：${variant.platform}`);
    variants[variant.platform] = normalizedVariant(variant);
  }

  const selection: AssetSelection = source.mode === "video"
    ? {
        mode: "video",
        videoPath: source.videoPath!,
        ...(source.subtitlePath === undefined ? {} : { subtitlePath: source.subtitlePath }),
        ...(source.coverPath === undefined ? {} : { coverPath: source.coverPath }),
      }
    : {
        mode: "article",
        articlePath: source.articlePath!,
        coverPath: source.coverPath!,
        ...(input.selection.mode === "article" && input.selection.articleTitle !== undefined
          ? { articleTitle: input.selection.articleTitle }
          : {}),
        ...(input.selection.mode === "article" && input.selection.articleSummary !== undefined
          ? { articleSummary: input.selection.articleSummary }
          : {}),
      };
  const frozen: FrozenDistributionPackage = {
    schemaVersion: 2,
    id: input.id,
    mode: selection.mode,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sourceDigest: distributionSourceDigest(source.sourceText),
    selection,
    variants,
  };

  const packagePath = join(input.folderPath, DISTRIBUTION_PACKAGE_NAME);
  const existing = await readFrozenDistributionPackage(input.folderPath);
  if (existing !== undefined
    && existing.id === frozen.id
    && existing.sourceDigest === frozen.sourceDigest
    && sameSelection(existing.selection, frozen.selection)
    && sameVariantPlatforms(existing.variants, frozen.variants)) {
    // 同一固定输入和平台集合视为重试：保留最初冻结的文案与时间戳。
    return { packagePath, package: existing };
  }
  const temporaryPath = join(
    input.folderPath,
    `.${basename(DISTRIBUTION_PACKAGE_NAME)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(frozen, null, 2)}\n`, "utf8");
  await rename(temporaryPath, packagePath);
  return { packagePath, package: frozen };
}

async function selectionFromUnknown(
  folderPath: string,
  value: unknown,
): Promise<AssetSelection | undefined> {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  try {
    if (record.mode === "video" && typeof record.videoPath === "string") {
      const videoPath = await validateLocalContentAsset(folderPath, record.videoPath, "video");
      const subtitlePath = typeof record.subtitlePath === "string"
        ? await validateLocalContentAsset(folderPath, record.subtitlePath, "subtitle")
        : undefined;
      const coverPath = typeof record.coverPath === "string"
        ? await validateLocalContentAsset(folderPath, record.coverPath, "cover")
        : undefined;
      return {
        mode: "video",
        videoPath,
        ...(subtitlePath === undefined ? {} : { subtitlePath }),
        ...(coverPath === undefined ? {} : { coverPath }),
      };
    }
    if (record.mode === "article"
      && typeof record.articlePath === "string"
      && typeof record.coverPath === "string") {
      const articleTitle = typeof record.articleTitle === "string"
        ? record.articleTitle.trim()
        : undefined;
      const articleSummary = typeof record.articleSummary === "string"
        ? record.articleSummary.trim()
        : undefined;
      if ((articleTitle?.length ?? 0) > 120 || (articleSummary?.length ?? 0) > 120) return undefined;
      return {
        mode: "article",
        articlePath: await validateLocalContentAsset(folderPath, record.articlePath, "article"),
        coverPath: await validateLocalContentAsset(folderPath, record.coverPath, "cover"),
        ...(articleTitle === undefined || articleTitle === "" ? {} : { articleTitle }),
        ...(articleSummary === undefined || articleSummary === "" ? {} : { articleSummary }),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function variantsFromUnknown(
  value: unknown,
  mode: AssetSelection["mode"],
): FrozenDistributionPackage["variants"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const variants: FrozenDistributionPackage["variants"] = {};
  for (const [rawPlatform, rawVariant] of Object.entries(value as Record<string, unknown>)) {
    if (!isPublishPlatform(rawPlatform)
      || PUBLISH_PLATFORM_DEFINITIONS[rawPlatform].kind !== mode
      || typeof rawVariant !== "object"
      || rawVariant === null) return undefined;
    const record = rawVariant as Record<string, unknown>;
    if (typeof record.title !== "string"
      || typeof record.summary !== "string"
      || typeof record.body !== "string"
      || !Array.isArray(record.tags)
      || record.tags.some((tag) => typeof tag !== "string")) return undefined;
    try {
      variants[rawPlatform] = normalizedVariant({
        platform: rawPlatform,
        title: record.title,
        summary: record.summary,
        body: record.body,
        tags: record.tags as string[],
      });
    } catch {
      return undefined;
    }
  }
  return Object.keys(variants).length === 0 ? undefined : variants;
}

export async function readFrozenDistributionPackage(
  folderPath: string,
): Promise<FrozenDistributionPackage | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(join(folderPath, DISTRIBUTION_PACKAGE_NAME), "utf8"),
    ) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 2
      || typeof record.id !== "string"
      || record.id.trim() === ""
      || typeof record.createdAt !== "string"
      || record.createdAt.trim() === ""
      || typeof record.sourceDigest !== "string"
      || !/^[a-f0-9]{64}$/.test(record.sourceDigest)) return undefined;
    const selection = await selectionFromUnknown(folderPath, record.selection);
    if (selection === undefined || record.mode !== selection.mode) return undefined;
    const variants = variantsFromUnknown(record.variants, selection.mode);
    if (variants === undefined) return undefined;
    return {
      schemaVersion: 2,
      id: record.id.trim(),
      mode: selection.mode,
      createdAt: record.createdAt,
      sourceDigest: record.sourceDigest,
      selection,
      variants,
    };
  } catch {
    return undefined;
  }
}

export async function isFrozenDistributionPackageFresh(
  folderPath: string,
  frozen?: FrozenDistributionPackage,
): Promise<boolean> {
  const current = frozen ?? await readFrozenDistributionPackage(folderPath);
  if (current === undefined) return false;
  try {
    const source = await readDistributionSource(folderPath, current.selection);
    return distributionSourceDigest(source.sourceText) === current.sourceDigest;
  } catch {
    return false;
  }
}
