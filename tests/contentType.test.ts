import { describe, expect, it } from "vitest";

import { resolveContentType } from "../src/contentType.ts";

describe("resolveContentType", () => {
  it("优先使用内容目录中的显式类型", () => {
    expect(resolveContentType({ contentType: "audio", hasArticle: true })).toBe("audio");
    expect(resolveContentType({ contentType: "article", hasArticle: false })).toBe("article");
  });

  it("兼容没有元数据的旧内容", () => {
    expect(resolveContentType({ hasArticle: true })).toBe("article");
    expect(resolveContentType({ hasArticle: false })).toBe("video");
  });
});
