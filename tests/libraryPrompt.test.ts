import { describe, expect, it } from "vitest";

import {
  libraryConventionText,
  resolvePromptLibraryRoot,
} from "../src/libraryPrompt.ts";

describe("library prompt", () => {
  it("以正在扫描的目录为准", () => {
    expect(resolvePromptLibraryRoot({
      libraryRoot: "/configured",
      dataDir: "/data",
      cache: { libraryRoot: "/active" },
    })).toBe("/active");
  });

  it("只提示文件真相、账号和草稿边界", () => {
    const text = libraryConventionText(
      "/library",
      "/data",
      ["xiaohongshu", "channels"],
    );
    expect(text).toContain("磁盘文件为准");
    expect(text).toContain("oil_platform_accounts");
    expect(text).toContain("oil_distribution_source");
    expect(text).toContain("oil_create_platform_drafts");
    expect(text).toContain("冻结分发包");
    expect(text).toContain("小红书、视频号");
  });
});
