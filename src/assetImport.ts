import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { AssetImportKind, ImportAssetRequest } from "./types.ts";

const MEBIBYTE = 1024 * 1024;

const IMPORT_RULES: Record<AssetImportKind, {
  extensions: ReadonlySet<string>;
  maxBytes: number;
  label: string;
}> = {
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

function candidateName(name: string, index: number): string {
  if (index === 1) return name;
  const extension = extname(name);
  return `${basename(name, extension)}-${index}${extension}`;
}

export async function importContentAsset(
  folderPath: string,
  request: Pick<ImportAssetRequest, "kind" | "name" | "base64">,
): Promise<{ name: string; path: string }> {
  const rule = IMPORT_RULES[request.kind];
  const name = safeAssetName(request.name);
  if (!rule.extensions.has(extname(name).toLowerCase())) {
    throw new Error(`${rule.label}文件类型不受支持`);
  }
  const bytes = decodeBase64(request.base64);
  if (bytes.byteLength > rule.maxBytes) {
    throw new Error(`${rule.label}不能超过 ${rule.maxBytes / MEBIBYTE} MB`);
  }

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
  throw new Error(`无法为 ${rule.label}生成不冲突的文件名`);
}
