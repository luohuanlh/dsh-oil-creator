import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { validateLocalContentAsset } from "./distribution.ts";

const ARTICLE_MAX_BYTES = 2 * 1024 * 1024;
const EDITABLE_ARTICLE_EXTENSIONS = new Set([".md", ".markdown"]);
const ARTICLE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

export interface ArticleDocumentSnapshot {
  path: string;
  root: string;
  text: string;
  revision: string;
  editable: boolean;
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

export async function readArticleDocument(
  folderPath: string,
  candidatePath: string,
): Promise<ArticleDocumentSnapshot> {
  const path = await validateLocalContentAsset(folderPath, candidatePath, "article");
  const text = await readFile(path, "utf8");
  return {
    path,
    root: dirname(path),
    text,
    revision: articleRevision(text),
    editable: editableArticle(path),
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
