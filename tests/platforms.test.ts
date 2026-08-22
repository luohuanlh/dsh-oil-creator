import { describe, expect, it } from "vitest";

import {
  ARTICLE_DRAFT_PLATFORMS,
  AUTO_DRAFT_PLATFORMS,
  draftCapability,
  isArticleDraftPlatform,
  normalizeEnabledPlatforms,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
  supportsAutoDraft,
  toVideoPublisherPlatform,
} from "../src/platforms.ts";

describe("platform catalog", () => {
  it("包含参考实现与两个音频入口共 24 个平台", () => {
    expect(PUBLISH_PLATFORMS).toHaveLength(24);
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
  });

  it("只把七个真实运行器平台标为自动草稿", () => {
    expect(AUTO_DRAFT_PLATFORMS).toEqual([
      "bilibili",
      "douyin",
      "xiaohongshu",
      "channels",
      "kuaishou",
      "baijiahao",
      "wechat-mp",
    ]);
    expect(AUTO_DRAFT_PLATFORMS.every(supportsAutoDraft)).toBe(true);
    expect(supportsAutoDraft("zhihu")).toBe(false);
    expect(supportsAutoDraft("netease-music")).toBe(false);
    expect(supportsAutoDraft("ximalaya")).toBe(false);
    expect(toVideoPublisherPlatform("channels")).toBe("wechat_channels");
    expect(toVideoPublisherPlatform("kuaishou")).toBe("kuaishou");
    expect(toVideoPublisherPlatform("wechat-mp")).toBeUndefined();
    expect(ARTICLE_DRAFT_PLATFORMS).toEqual(["baijiahao", "wechat-mp"]);
    expect(isArticleDraftPlatform("wechat-mp")).toBe(true);
    expect(isArticleDraftPlatform("zhihu")).toBe(false);
    expect(draftCapability("bilibili")).toBe("remote-verified");
    expect(draftCapability("wechat-mp")).toBe("local-tested");
    expect(draftCapability("baijiahao")).toBe("local-tested");
    expect(draftCapability("douyin")).toBe("remote-verified");
    expect(draftCapability("xiaohongshu")).toBe("page-ready");
    expect(draftCapability("channels")).toBe("page-ready");
    expect(draftCapability("kuaishou")).toBe("remote-verified");
    expect(draftCapability("toutiao")).toBe("manual-handoff");
    expect(draftCapability("zhihu")).toBe("local-tested");
    expect(draftCapability("sohu")).toBe("local-tested");
    expect(draftCapability("xueqiu")).toBe("local-tested");
    expect(draftCapability("eastmoney")).toBe("local-tested");
    expect(draftCapability("weibo")).toBe("local-tested");
    const hiddenLocalAdapters = ["zhihu", "sohu", "xueqiu", "eastmoney", "weibo"] as const;
    expect(hiddenLocalAdapters.every((platform) => !supportsAutoDraft(platform))).toBe(true);
  });

  it("迁移旧版 wechat id 并过滤无效值", () => {
    expect(normalizeEnabledPlatforms(["wechat", "douyin", "invalid"]))
      .toEqual(["douyin", "channels"]);
  });
});
