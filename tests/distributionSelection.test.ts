import { describe, expect, it } from "vitest";

import { defaultDistributionPlatforms } from "../src/client/distributionSelection.ts";

describe("defaultDistributionPlatforms", () => {
  it("只默认选择已启用且账号有效的平台", () => {
    expect(defaultDistributionPlatforms(
      ["bilibili", "douyin", "xiaohongshu", "channels"],
      [
        { platform: "bilibili", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "douyin", status: "unknown", supportsAutoDraft: true, draftCapability: "implemented-simulated" },
        { platform: "xiaohongshu", status: "expired", supportsAutoDraft: true, draftCapability: "implemented-simulated" },
      ],
    )).toEqual(["bilibili"]);
  });

  it("保持工作台平台顺序并忽略列表外账号", () => {
    expect(defaultDistributionPlatforms(
      ["douyin", "bilibili"],
      [
        { platform: "bilibili", status: "active", supportsAutoDraft: true, draftCapability: "remote-verified" },
        { platform: "wechat-mp", status: "active", supportsAutoDraft: true, draftCapability: "implemented-simulated" },
        { platform: "douyin", status: "active", supportsAutoDraft: true, draftCapability: "implemented-simulated" },
      ],
    )).toEqual(["douyin", "bilibili"]);
  });
});
