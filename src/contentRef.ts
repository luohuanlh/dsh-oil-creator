import type { ContentDetail } from "./types.ts";

export function formatContentRef(detail: ContentDetail): string {
  return [
    `内容文件夹（目录）：${detail.folderPath}`,
    "请先列出目录内容，再按需读取其中的文件；若要打开内容文件夹，请调用系统目录打开能力，不要把目录当作文件读取。",
  ].join("\n");
}
