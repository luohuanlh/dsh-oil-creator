import { describe, expect, it } from "vitest";

import {
  defaultDistributionPlatforms,
  orderDistributionPlatforms,
  visibleDistributionPlatforms,
} from "../src/client/distributionSelection.ts";

describe("defaultDistributionPlatforms", () => {
  it("只默认选择已启用且账号有效的平台", () => {
    expect(defaultDistributionPlatforms(
      ["bilibili", "douyin", "xiaohongshu", "channels"],
      [
        { platform: "bilibili", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "douyin", status: "unknown", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "xiaohongshu", status: "expired", supportsAutoDraft: true, draftCapability: "page-ready" },
      ],
    )).toEqual(["bilibili"]);
  });

  it("保持工作台平台顺序并忽略列表外账号", () => {
    expect(defaultDistributionPlatforms(
      ["douyin", "bilibili"],
      [
        { platform: "bilibili", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "wechat-mp", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "douyin", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
      ],
    )).toEqual(["douyin", "bilibili"]);
  });
});

describe("orderDistributionPlatforms", () => {
  it("在草稿卡片中交换视频号与抖音的位置", () => {
    expect(orderDistributionPlatforms([
      "bilibili",
      "douyin",
      "xiaohongshu",
      "channels",
      "kuaishou",
    ])).toEqual([
      "bilibili",
      "channels",
      "xiaohongshu",
      "douyin",
      "kuaishou",
    ]);
  });

  it("不改变其他平台的相对顺序", () => {
    expect(orderDistributionPlatforms(["wechat-mp", "zhihu"]))
      .toEqual(["wechat-mp", "zhihu"]);
  });
});

describe("visibleDistributionPlatforms", () => {
  it("视频工作台始终展示快手，但不改变自动草稿启用列表", () => {
    const enabled = ["bilibili", "channels", "xiaohongshu", "douyin"] as const;
    expect(visibleDistributionPlatforms("video", enabled)).toEqual([
      "bilibili",
      "channels",
      "xiaohongshu",
      "douyin",
      "kuaishou",
    ]);
    expect(enabled).not.toContain("kuaishou");
  });

  it("图文工作台不追加快手", () => {
    expect(visibleDistributionPlatforms("article", ["wechat-mp"]))
      .toEqual(["wechat-mp"]);
  });
});
