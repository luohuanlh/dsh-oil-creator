import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultFindSkillDir, inspectCreatorSetup } from "../src/capabilities.ts";
import type { LibrarySettings } from "../src/types.ts";

const settings = (libraryRoot: string): LibrarySettings => ({
  libraryRoot,
  profile: { enabledPlatforms: ["bilibili", "douyin", "xiaohongshu", "channels"] },
});
describe("inspectCreatorSetup", () => {
  it("只返回四个环境状态", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-capabilities-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    const ego = join(bin, "ego-browser");
    await writeFile(ego, "#!/bin/sh\nexit 0\n");
    await chmod(ego, 0o755);

    const result = await inspectCreatorSetup({
      libraryRoot: root,
      dataDir: join(root, "data"),
      settings: settings(root),
      platform: "linux",
      home: root,
      env: { PATH: bin },
      findSkillDir: (name) => name === "video-publisher"
        ? join(root, name)
        : undefined,
    });

    expect(Object.keys(result.capabilities)).toEqual([
      "library",
      "autoPublish",
      "article",
      "egoBrowser",
    ]);
    expect(Object.values(result.capabilities).every((item) => item.state === "ready")).toBe(true);
  });

  it("缺失能力只降级对应环节", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-capabilities-"));
    const result = await inspectCreatorSetup({
      libraryRoot: join(root, "missing"),
      dataDir: join(root, "data"),
      settings: settings(join(root, "missing")),
      platform: "linux",
      home: root,
      env: { PATH: "" },
      findSkillDir: () => undefined,
    });

    expect(result.capabilities.library.state).toBe("missing");
    expect(result.capabilities.autoPublish.state).toBe("missing");
    expect(result.capabilities.article).toMatchObject({
      state: "ready",
      detail: expect.stringContaining("微信公众号、百家号、知乎"),
    });
    expect(result.capabilities.egoBrowser.state).toBe("missing");
  });
});

describe("defaultFindSkillDir", () => {
  it("能发现插件式双层 skill 目录", async () => {
    const home = await mkdtemp(join(tmpdir(), "oil-skill-home-"));
    const nested = join(home, ".agents", "skills", "video-publisher", "video-publisher");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "SKILL.md"), "# skill\n");
    expect(defaultFindSkillDir("video-publisher", home, {})).toBe(nested);
  });

  it("优先使用显式的本地 video-publisher fork", async () => {
    const home = await mkdtemp(join(tmpdir(), "oil-skill-home-"));
    const fork = join(home, "video-publisher-fork", "video-publisher");
    await mkdir(fork, { recursive: true });
    await writeFile(join(fork, "SKILL.md"), "---\nname: video-publisher\ndescription: test\n---\n");
    expect(defaultFindSkillDir("video-publisher", home, {
      VIDEO_PUBLISHER_SKILL_DIR: fork,
    })).toBe(fork);
  });
});
