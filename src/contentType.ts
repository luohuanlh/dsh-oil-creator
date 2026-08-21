import type { ContentSummary, ContentType } from "./types.ts";

/**
 * 新内容以隐藏元数据为准；旧内容则从已有素材做一次兼容推断。
 */
export function resolveContentType(
  item: Pick<ContentSummary, "contentType" | "hasArticle">,
): ContentType {
  if (item.contentType !== undefined) return item.contentType;
  return item.hasArticle ? "article" : "video";
}
