import { describe, expect, it } from "vitest";

import { creatorGuideText } from "../src/guide.ts";
import type { CreatorSetupStatus } from "../src/types.ts";

function status(): CreatorSetupStatus {
  const ready = { state: "ready" as const, required: false, detail: "可用" };
  return {
    platform: "darwin",
    dataDir: "/tmp/oil",
    settings: {
      libraryRoot: "/tmp/library",
      profile: { enabledPlatforms: ["xiaohongshu", "douyin", "bilibili", "channels"] },
    },
    capabilities: {
      library: { ...ready, required: true },
      autoPublish: ready,
      article: ready,
      egoBrowser: { ...ready, required: true },
    },
    recommendations: [],
  };
}

describe("creatorGuideText", () => {
  it("描述概览只读和视频图文两步流程", () => {
    const guide = creatorGuideText(status());
    expect(guide).toContain("概览只展示预览信息");
    expect(guide).toContain("## 1. 选择内容文件");
    expect(guide).toContain("## 2. 选择平台并创建草稿");
    expect(guide).not.toContain("## 3.");
    expect(guide).toContain("最终发表");
    expect(guide).toContain("图文草稿");
    expect(guide).toContain("不需要手写 publish-package.json");
    expect(guide).toContain("默认复用可用的正文");
    expect(guide).toContain("微信公众号");
  });

  it("只列出四项环境状态", () => {
    const guide = creatorGuideText(status());
    expect(guide.match(/^\- .*：可用/gm)).toHaveLength(4);
  });
});
