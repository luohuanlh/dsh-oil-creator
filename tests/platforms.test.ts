import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_PLATFORMS,
  draftCapability,
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
    expect(draftCapability("bilibili")).toBe("remote-verified");
    expect(draftCapability("wechat-mp")).toBe("implemented-simulated");
    expect(draftCapability("baijiahao")).toBe("implemented-simulated");
    expect(draftCapability("douyin")).toBe("remote-verified");
    expect(draftCapability("xiaohongshu")).toBe("remote-verified");
    expect(draftCapability("channels")).toBe("remote-verified");
    expect(draftCapability("kuaishou")).toBe("remote-verified");
    expect(draftCapability("zhihu")).toBe("unsupported");
  });

  it("迁移旧版 wechat id 并过滤无效值", () => {
    expect(normalizeEnabledPlatforms(["wechat", "douyin", "invalid"]))
      .toEqual(["douyin", "channels"]);
  });
});
