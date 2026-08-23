import { describe, expect, it, vi } from "vitest";

import {
  buildDistributionPrompt,
  queueDistributionPrompt,
} from "../src/client/distributionPrompt.ts";

describe("distribution Harness prompt", () => {
  const request = {
    id: "2026-08-21_demo",
    selection: {
      mode: "video" as const,
      videoPath: "/content/demo.mp4",
      subtitlePath: "/content/demo.srt",
      coverPath: "/content/cover-4x3.png",
    },
    platforms: ["bilibili", "douyin"] as const,
    confirmOriginalRights: true,
  };

  it("把一次点击编排成读素材、生成变体、冻结并建草稿", () => {
    const prompt = buildDistributionPrompt(request);

    expect(prompt).toContain("oil_distribution_source");
    expect(prompt).toContain("oil_create_platform_drafts");
    expect(prompt).toContain("/content/demo.mp4");
    expect(prompt).toContain("/content/demo.srt");
    expect(prompt).toContain('"coverPath": "/content/cover-4x3.png"');
    expect(prompt).toContain('"bilibili"');
    expect(prompt).toContain("contentProfile");
    expect(prompt).toContain("默认复用可用的正文");
    expect(prompt).toContain("用户明确要求深度适配");
    expect(prompt).toContain("不得点击最终发表");
  });

  it("排入当前 Harness 会话，复用当前会话模型而不是插件自配模型", async () => {
    const prompt = vi.fn(async () => ({ ok: true, value: { accepted: true } }));
    const sessions = {
      list: { getSnapshot: () => ({ current: "session-1" }) },
      binding: () => ({ session: { prompt } }),
    };

    await queueDistributionPrompt(sessions as never, request);

    expect(prompt).toHaveBeenCalledWith([
      { type: "text", text: buildDistributionPrompt(request) },
    ], "queue");
  });

  it("把可选文章标题和摘要作为固定参考传给 Harness AI", () => {
    const prompt = buildDistributionPrompt({
      id: "article-demo",
      selection: {
        mode: "article",
        articlePath: "/content/article.html",
        coverPath: "/content/cover.png",
        articleTitle: "用户填写的标题",
        articleSummary: "用户填写的摘要",
      },
      platforms: ["wechat-mp"],
    });

    expect(prompt).toContain('"articleTitle": "用户填写的标题"');
    expect(prompt).toContain('"articleSummary": "用户填写的摘要"');
    expect(prompt).toContain("不得改变原意");
  });

  it("没有当前会话时给出明确错误", async () => {
    const sessions = {
      list: { getSnapshot: () => ({ current: undefined }) },
      binding: vi.fn(),
    };

    await expect(queueDistributionPrompt(sessions as never, request))
      .rejects.toThrow("请先打开一个 Harness 会话");
  });
});
