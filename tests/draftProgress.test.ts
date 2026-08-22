import { describe, expect, it } from "vitest";

import { remoteDraftProgress } from "../src/client/draftProgress.ts";

describe("remoteDraftProgress", () => {
  it("任一平台远端草稿保存成功即完成，并显示成功数与总数", () => {
    expect(remoteDraftProgress(
      ["bilibili", "channels", "xiaohongshu", "douyin"],
      {
        bilibili: { status: "draft" },
        channels: { status: "unpublished" },
        xiaohongshu: { status: "unpublished" },
        douyin: { status: "unpublished" },
      },
    )).toEqual({ saved: 1, total: 4, label: "1/4", hasSaved: true });
  });

  it("已发布状态也计入远端成功数", () => {
    expect(remoteDraftProgress(
      ["bilibili", "douyin"],
      {
        bilibili: { status: "published" },
        douyin: { status: "unpublished" },
      },
    )).toEqual({ saved: 1, total: 2, label: "1/2", hasSaved: true });
  });
});
