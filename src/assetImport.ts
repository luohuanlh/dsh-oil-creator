import { link, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { AssetImportKind, ImportAssetRequest } from "./types.ts";

const MEBIBYTE = 1024 * 1024;

const IMPORT_RULES: Record<AssetImportKind, {
  extensions: ReadonlySet<string>;
  maxBytes: number;
  label: string;
}> = {
  video: {
    extensions: new Set([".mp4", ".mov"]),
    maxBytes: 16 * 1024 * MEBIBYTE,
    label: "视频",
  },
  subtitle: {
    extensions: new Set([".srt", ".ass", ".vtt", ".txt"]),
    maxBytes: 20 * MEBIBYTE,
    label: "字幕",
  },
  article: {
    extensions: new Set([".md", ".markdown", ".html", ".htm"]),
    maxBytes: 2 * MEBIBYTE,
    label: "Markdown / HTML 文章",
  },
  cover: {
    extensions: new Set([".png", ".jpg", ".jpeg", ".webp"]),
    maxBytes: 20 * MEBIBYTE,
    label: "文章封面",
  },
};

function decodeBase64(value: string): Buffer {
  if (value === "" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("本地文件内容无效");
  }
  return Buffer.from(value, "base64");
}

function safeAssetName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed !== basename(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error("本地文件名无效");
  }
  return trimmed;
}

export function validateAssetImport(
  kind: AssetImportKind,
  rawName: string,
  size: number,
): { name: string; maxBytes: number; label: string } {
  const rule = IMPORT_RULES[kind];
  const name = safeAssetName(rawName);
  if (!rule.extensions.has(extname(name).toLowerCase())) {
    throw new Error(`${rule.label}文件类型不受支持`);
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error(`${rule.label}文件不能为空`);
  }
  if (size > rule.maxBytes) {
    const max = rule.maxBytes / MEBIBYTE;
    throw new Error(`${rule.label}不能超过 ${max >= 1024 ? `${max / 1024} GB` : `${max} MB`}`);
  }
  return { name, maxBytes: rule.maxBytes, label: rule.label };
}

function candidateName(name: string, index: number): string {
  if (index === 1) return name;
  const extension = extname(name);
  return `${basename(name, extension)}-${index}${extension}`;
}

export async function commitTemporaryContentAsset(
  folderPath: string,
  name: string,
  temporaryPath: string,
): Promise<{ name: string; path: string }> {
  for (let index = 1; index <= 999; index += 1) {
    const nextName = candidateName(name, index);
    const path = join(folderPath, nextName);
    try {
      // 临时文件与内容目录位于同一文件系统；硬链接能原子地声明目标名，且不会覆盖已有素材。
      await link(temporaryPath, path);
      await unlink(temporaryPath);
      return { name: nextName, path };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw cause;
    }
  }
  throw new Error("无法为导入素材生成不冲突的文件名");
}

export async function importContentAsset(
  folderPath: string,
  request: Pick<ImportAssetRequest, "kind" | "name" | "base64">,
): Promise<{ name: string; path: string }> {
  const bytes = decodeBase64(request.base64);
  const { name, label } = validateAssetImport(request.kind, request.name, bytes.byteLength);

  for (let index = 1; index <= 999; index += 1) {
    const nextName = candidateName(name, index);
    const path = join(folderPath, nextName);
    try {
      await writeFile(path, bytes, { flag: "wx" });
      return { name: nextName, path };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw cause;
    }
  }
  throw new Error(`无法为 ${label}生成不冲突的文件名`);
}
