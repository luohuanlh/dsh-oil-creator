import { describe, expect, it } from "vitest";

import {
  ARTICLE_PLATFORMS,
  ARTICLE_DRAFT_PLATFORMS,
  AUTO_DRAFT_PLATFORMS,
  draftCapability,
  isArticleDraftPlatform,
  normalizeEnabledPlatforms,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
  platformGenerationRule,
  supportsAutoDraft,
  toVideoPublisherPlatform,
} from "../src/platforms.ts";

describe("platform catalog", () => {
  it("包含参考实现、独立小红书图文目标与两个音频入口共 25 个平台", () => {
    expect(PUBLISH_PLATFORMS).toHaveLength(25);
    expect(PUBLISH_PLATFORMS.at(-1)).toBe("ximalaya");
    expect(PUBLISH_PLATFORM_DEFINITIONS["wechat-mp"].name).toBe("微信公众号");
    expect(PUBLISH_PLATFORM_DEFINITIONS["netease-music"]).toMatchObject({
      name: "网易云音乐",
      kind: "audio",
      draftRunner: null,
    });
    expect(PUBLISH_PLATFORM_DEFINITIONS.ximalaya).toMatchObject({
      name: "喜马拉雅听",
      kind: "audio",
      draftRunner: null,
    });
    expect(PUBLISH_PLATFORM_DEFINITIONS.xueqiu.workspaceUrl)
      .toBe("https://mp.xueqiu.com/writeV2");
    expect(PUBLISH_PLATFORM_DEFINITIONS.eastmoney.workspaceUrl)
      .toContain("/collect/pc_article/index.html#/");
    expect(PUBLISH_PLATFORM_DEFINITIONS.weibo.workspaceUrl)
      .toBe("https://card.weibo.com/article/v5/editor");
    expect(PUBLISH_PLATFORM_DEFINITIONS.netease.workspaceUrl)
      .toBe("https://mp.163.com/index.html#/post/article");
    expect(PUBLISH_PLATFORM_DEFINITIONS.dingduan.workspaceUrl)
      .toBe("https://mp.topnews.cn/#/scriptWrite");
    expect(PUBLISH_PLATFORM_DEFINITIONS.ofweek.workspaceUrl)
      .toBe("https://mp.ofweek.com/article/publish.html");
    expect(PUBLISH_PLATFORM_DEFINITIONS["10jqka"].workspaceUrl)
      .toBe("https://mp.10jqka.com.cn/creation-editor/editor/");
  });

  it("只把十八个真实运行器平台标为自动草稿", () => {
    expect(AUTO_DRAFT_PLATFORMS).toEqual([
      "bilibili",
      "douyin",
      "xiaohongshu",
      "xiaohongshu-note",
      "channels",
      "kuaishou",
      "toutiao",
      "baijiahao",
      "penguin",
      "dingduan",
      "xueqiu",
      "eastmoney",
      "10jqka",
      "sohu",
      "weibo",
      "zhihu",
      "ofweek",
      "wechat-mp",
    ]);
    expect(AUTO_DRAFT_PLATFORMS.every(supportsAutoDraft)).toBe(true);
    expect(supportsAutoDraft("zhihu")).toBe(true);
    expect(supportsAutoDraft("netease-music")).toBe(false);
    expect(supportsAutoDraft("ximalaya")).toBe(false);
    expect(toVideoPublisherPlatform("channels")).toBe("wechat_channels");
    expect(toVideoPublisherPlatform("kuaishou")).toBe("kuaishou");
    expect(toVideoPublisherPlatform("wechat-mp")).toBeUndefined();
    expect(ARTICLE_DRAFT_PLATFORMS).toEqual([
      "xiaohongshu-note",
      "toutiao",
      "baijiahao",
      "penguin",
      "dingduan",
      "xueqiu",
      "eastmoney",
      "10jqka",
      "sohu",
      "weibo",
      "zhihu",
      "ofweek",
      "wechat-mp",
    ]);
    expect(isArticleDraftPlatform("wechat-mp")).toBe(true);
    expect(isArticleDraftPlatform("zhihu")).toBe(true);
    expect(isArticleDraftPlatform("toutiao")).toBe(true);
    expect(isArticleDraftPlatform("xiaohongshu-note")).toBe(true);
    expect(isArticleDraftPlatform("ofweek")).toBe(true);
    expect(isArticleDraftPlatform("sohu")).toBe(true);
    expect(isArticleDraftPlatform("10jqka")).toBe(true);
    expect(draftCapability("bilibili")).toBe("remote-verified");
    expect(draftCapability("wechat-mp")).toBe("remote-verified");
    expect(draftCapability("baijiahao")).toBe("remote-verified");
    expect(draftCapability("douyin")).toBe("remote-verified");
    expect(draftCapability("xiaohongshu")).toBe("page-ready");
    expect(draftCapability("xiaohongshu-note")).toBe("local-verified");
    expect(draftCapability("channels")).toBe("page-ready");
    expect(draftCapability("kuaishou")).toBe("remote-verified");
    expect(draftCapability("toutiao")).toBe("remote-verified");
    expect(draftCapability("zhihu")).toBe("remote-verified");
    expect(draftCapability("sohu")).toBe("remote-verified");
    expect(draftCapability("xueqiu")).toBe("remote-verified");
    expect(draftCapability("eastmoney")).toBe("remote-verified");
    expect(draftCapability("weibo")).toBe("remote-verified");
    expect(draftCapability("penguin")).toBe("remote-verified");
    expect(draftCapability("netease")).toBe("local-tested");
    expect(draftCapability("yidian")).toBe("local-tested");
    expect(draftCapability("dayu")).toBe("local-tested");
    expect(draftCapability("dingduan")).toBe("remote-verified");
    expect(draftCapability("10jqka")).toBe("remote-verified");
    expect(draftCapability("ofweek")).toBe("remote-verified");
    expect(draftCapability("laohu")).toBe("local-tested");
    expect(draftCapability("futu")).toBe("local-tested");
    const hiddenLocalAdapters = [
      "netease",
      "yidian",
      "dayu",
      "laohu",
      "futu",
    ] as const;
    expect(hiddenLocalAdapters.every((platform) => !supportsAutoDraft(platform))).toBe(true);
    expect(supportsAutoDraft("penguin")).toBe(true);
    expect(supportsAutoDraft("ofweek")).toBe(true);
    expect(supportsAutoDraft("sohu")).toBe(true);
    expect(supportsAutoDraft("10jqka")).toBe(true);
  });

  it("迁移旧版 wechat id 并过滤无效值", () => {
    expect(normalizeEnabledPlatforms(["wechat", "douyin", "invalid"]))
      .toEqual(["douyin", "channels"]);
  });

  it("为全部图文平台提供互相独立的内容 profile", () => {
    expect(ARTICLE_PLATFORMS).toEqual([
      "xiaohongshu-note",
      "toutiao",
      "baijiahao",
      "penguin",
      "netease",
      "yidian",
      "dayu",
      "dingduan",
      "xueqiu",
      "eastmoney",
      "10jqka",
      "sohu",
      "weibo",
      "zhihu",
      "ofweek",
      "laohu",
      "futu",
      "wechat-mp",
    ]);
    const rules = ARTICLE_PLATFORMS.map(platformGenerationRule);
    expect(rules.every((rule) => rule.contentProfile !== undefined)).toBe(true);
    expect(new Set(rules.map((rule) => rule.contentProfile?.objective)).size)
      .toBe(ARTICLE_PLATFORMS.length);
    expect(platformGenerationRule("wechat-mp").contentProfile).toMatchObject({
      audience: expect.stringContaining("订阅"),
      formatting: expect.stringContaining("Markdown"),
    });
    expect(platformGenerationRule("zhihu").contentProfile?.structure)
      .toContain("处理反例、限制和常见误解");
    expect(platformGenerationRule("xueqiu").contentProfile?.safeguards)
      .toContain("不得承诺收益或使用确定性买卖建议");
    expect(platformGenerationRule("xiaohongshu-note")).toMatchObject({
      titleMax: 20,
      tagsMax: 10,
      guidance: expect.stringContaining("1000 字以内"),
      contentProfile: { formatting: expect.stringContaining("一千字以内") },
    });
    expect(platformGenerationRule("ofweek")).toMatchObject({
      titleMax: 50,
      tagsMax: 5,
    });
  });
});
