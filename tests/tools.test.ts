import { describe, expect, it, vi } from "vitest";

import { registerCreatorTools } from "../src/tools.ts";

function registeredTools(service: Record<string, unknown>) {
  const tools: Array<{
    name: string;
    output: { render: (args: unknown, value: unknown) => Array<{ type: string; text?: string }> };
    execute: (args: any, exec: any) => Promise<unknown>;
  }> = [];
  registerCreatorTools({
    tools: { register: (tool) => { tools.push(tool as never); } },
  }, service as never);
  return tools;
}

describe("Harness distribution tools", () => {
  it("把 canonical 结果完整回传给 Harness AI，而不是只给 UI 摘要", () => {
    const tools = registeredTools({});
    const source = tools.find((entry) => entry.name === "oil_distribution_source");
    const rendered = source?.output.render({}, {
      sourceText: "这是固定素材原文",
      platforms: [{ platform: "bilibili", titleMaxLength: 80 }],
    });

    expect(rendered?.[0]?.text).toContain("这是固定素材原文");
    expect(rendered?.[0]?.text).toContain('"titleMaxLength": 80');
  });

  it("读取用户选择的本地素材与平台约束", async () => {
    const getDistributionSource = vi.fn(async () => ({ sourceText: "字幕", platforms: [] }));
    const tools = registeredTools({ getDistributionSource });
    const tool = tools.find((entry) => entry.name === "oil_distribution_source");
    const signal = new AbortController().signal;

    await tool?.execute({
      id: "demo",
      mode: "video",
      videoPath: "/content/demo.mp4",
      subtitlePath: "/content/demo.srt",
      platforms: ["bilibili"],
    }, { signal });

    expect(getDistributionSource).toHaveBeenCalledWith({
      id: "demo",
      selection: {
        mode: "video",
        videoPath: "/content/demo.mp4",
        subtitlePath: "/content/demo.srt",
      },
      platforms: ["bilibili"],
    }, signal);
  });

  it("最终工具先冻结 AI 变体，再把同一包交给 Ego 建草稿", async () => {
    const commitDistribution = vi.fn(async () => ({
      id: "demo",
      mode: "video",
      platforms: ["bilibili"],
      packagePath: "/content/.oil-distribution.json",
    }));
    const startDrafts = vi.fn(async () => ({ id: "demo", platforms: ["bilibili"], started: true }));
    const tools = registeredTools({ commitDistribution, startDrafts });
    const tool = tools.find((entry) => entry.name === "oil_create_platform_drafts");
    const signal = new AbortController().signal;
    const variants = [{
      platform: "bilibili",
      title: "标题",
      summary: "摘要",
      body: "简介",
      tags: ["AI"],
    }];

    await tool?.execute({
      id: "demo",
      mode: "video",
      videoPath: "/content/demo.mp4",
      platforms: ["bilibili"],
      variants,
      confirmOriginalRights: true,
    }, { signal });

    expect(commitDistribution).toHaveBeenCalledWith({
      id: "demo",
      selection: { mode: "video", videoPath: "/content/demo.mp4" },
      variants,
    }, signal);
    expect(startDrafts).toHaveBeenCalledWith({
      id: "demo",
      platforms: ["bilibili"],
      confirmOriginalRights: true,
    }, signal);
    expect(commitDistribution.mock.invocationCallOrder[0])
      .toBeLessThan(startDrafts.mock.invocationCallOrder[0]!);
  });

  it("保留图文工作台填写的可选标题和摘要", async () => {
    const getDistributionSource = vi.fn(async () => ({ sourceText: "正文", platforms: [] }));
    const tools = registeredTools({ getDistributionSource });
    const tool = tools.find((entry) => entry.name === "oil_distribution_source");
    const signal = new AbortController().signal;

    await tool?.execute({
      id: "article-demo",
      mode: "article",
      articlePath: "/content/article.md",
      coverPath: "/content/cover.png",
      articleTitle: "  标题参考  ",
      articleSummary: "  摘要参考  ",
      platforms: ["wechat-mp"],
    }, { signal });

    expect(getDistributionSource).toHaveBeenCalledWith({
      id: "article-demo",
      selection: {
        mode: "article",
        articlePath: "/content/article.md",
        coverPath: "/content/cover.png",
        articleTitle: "标题参考",
        articleSummary: "摘要参考",
      },
      platforms: ["wechat-mp"],
    }, signal);
  });
});
