import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  Config,
  defaultDataDir,
  defaultLibraryRoot,
  expandHomePath,
  skillDirCandidates,
} from "../src/config.ts";

describe("config", () => {
  it("只保留内容目录和状态目录", () => {
    expect(Config({} as Config)).toEqual({
      libraryRoot: defaultLibraryRoot(),
      dataDir: defaultDataDir(),
    });
  });

  it("展开用户目录并保留通用 skill 搜索顺序", () => {
    expect(expandHomePath("~/Movies/demo")).toBe(join(homedir(), "Movies", "demo"));
    expect(skillDirCandidates("video-publisher")).toEqual([
      join(homedir(), ".claude", "skills", "video-publisher"),
      join(homedir(), ".codex", "skills", "video-publisher"),
      join(homedir(), ".agents", "skills", "video-publisher"),
      join(homedir(), ".grok", "skills", "video-publisher"),
    ]);
  });
});
