import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { validateLocalContentAsset } from "./distribution.ts";
import { articlePreviewFormat } from "./articlePreview.ts";

const ARTICLE_MAX_BYTES = 2 * 1024 * 1024;
const EDITABLE_ARTICLE_EXTENSIONS = new Set([".md", ".markdown"]);
const ARTICLE_TEXT_EXTENSIONS = new Set([".md", ".markdown", ".html", ".htm"]);
const ARTICLE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

export interface ArticleDocumentSnapshot {
  path: string;
  root: string;
  text: string;
  revision: string;
  editable: boolean;
  previewHtml?: string;
}

export interface SaveArticleDocumentInput {
  path: string;
  text: string;
  expectedRevision: string;
}

export interface SaveArticleDocumentResult {
  revision: string;
  savedAt: number;
}

export function articleRevision(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function editableArticle(path: string): boolean {
  return EDITABLE_ARTICLE_EXTENSIONS.has(extname(path).toLowerCase());
}

function relatedArticleStem(path: string): string {
  const extension = extname(path);
  return basename(path, extension).replace(/[-_]\d+$/, "");
}

function previewIdentity(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|ensp|emsp);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/gm, " ")
    .replace(/[*_#`>|\[\]()~-]/g, " ")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function samePreviewArticle(source: string, candidate: string): boolean {
  const sourceIdentity = previewIdentity(source);
  const candidateIdentity = previewIdentity(candidate);
  const windowSize = 32;
  if (Math.min(sourceIdentity.length, candidateIdentity.length) < windowSize) {
    return sourceIdentity !== "" && sourceIdentity === candidateIdentity;
  }
  const sampleCount = Math.min(32, Math.floor(sourceIdentity.length / windowSize));
  const lastStart = sourceIdentity.length - windowSize;
  let matches = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const start = sampleCount === 1
      ? 0
      : Math.round((lastStart * index) / (sampleCount - 1));
    if (candidateIdentity.includes(sourceIdentity.slice(start, start + windowSize))) matches += 1;
  }
  return matches / sampleCount >= 0.75;
}

async function relatedRichPreview(path: string, text: string): Promise<string | undefined> {
  if (articlePreviewFormat(path, text) === "rich-html") return undefined;
  const root = dirname(path);
  const selectedName = basename(path);
  const selectedStem = relatedArticleStem(path);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isFile()
      && entry.name !== selectedName
      && ARTICLE_TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())
      && relatedArticleStem(entry.name) === selectedStem)
    .map((entry) => join(root, entry.name))
    .sort((left, right) => basename(left).localeCompare(basename(right), "zh"));

  for (const candidate of candidates) {
    const candidateText = await readFile(candidate, "utf8").catch(() => undefined);
    if (candidateText === undefined || Buffer.byteLength(candidateText, "utf8") > ARTICLE_MAX_BYTES) {
      continue;
    }
    if (articlePreviewFormat(candidate, candidateText) === "rich-html"
      && samePreviewArticle(text, candidateText)) return candidateText;
  }
  return undefined;
}

export async function readArticleDocument(
  folderPath: string,
  candidatePath: string,
): Promise<ArticleDocumentSnapshot> {
  const path = await validateLocalContentAsset(folderPath, candidatePath, "article");
  const text = await readFile(path, "utf8");
  const previewHtml = await relatedRichPreview(path, text);
  return {
    path,
    root: dirname(path),
    text,
    revision: articleRevision(text),
    editable: editableArticle(path),
    ...(previewHtml === undefined ? {} : { previewHtml }),
  };
}

export async function saveArticleDocument(
  folderPath: string,
  input: SaveArticleDocumentInput,
): Promise<SaveArticleDocumentResult> {
  const current = await readArticleDocument(folderPath, input.path);
  if (!current.editable) throw new Error("只支持保存 Markdown 文章，HTML 文章保持只读");
  if (current.revision !== input.expectedRevision) {
    throw new Error("文章已被外部修改，请重新载入磁盘版本后再编辑");
  }
  if (Buffer.byteLength(input.text, "utf8") > ARTICLE_MAX_BYTES) {
    throw new Error("Markdown 文章不能超过 2 MB");
  }

  const revision = articleRevision(input.text);
  if (revision === input.expectedRevision) return { revision, savedAt: Date.now() };

  const temporaryPath = join(
    current.root,
    `.${basename(current.path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, input.text, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, current.path);
  } catch (cause) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw cause;
  }
  return { revision, savedAt: Date.now() };
}

function safeImageBase(name: string): string {
  const extension = extname(name);
  const base = name.slice(0, Math.max(0, name.length - extension.length))
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return base === "" ? "image" : base;
}

export async function articleImageUploadTarget(
  folderPath: string,
  articlePath: string,
  rawName: string,
): Promise<{ folderPath: string; name: string; markdownPrefix: string }> {
  const article = await readArticleDocument(folderPath, articlePath);
  if (!article.editable) throw new Error("HTML 文章不支持插入本地图片");
  const extension = extname(rawName).toLowerCase();
  if (!ARTICLE_IMAGE_EXTENSIONS.has(extension)) throw new Error("正文插图文件类型不受支持");
  const imageFolder = join(article.root, "images");
  await mkdir(imageFolder, { recursive: true });
  return {
    folderPath: imageFolder,
    name: `${safeImageBase(rawName)}-${randomUUID().slice(0, 8)}${extension}`,
    markdownPrefix: "images/",
  };
}
