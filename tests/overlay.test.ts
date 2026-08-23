import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountsFromOverlay,
  decodeOverlay,
  decodeProfile,
  emptyOverlay,
  emptyProfile,
  loadOverlay,
  normalizeEnabledPlatforms,
  overlayPath,
  profileIsEmpty,
  saveOverlay,
  withOverlayLock,
} from "../src/overlay.ts";
import { creatorProfileSchema } from "../src/schemas.ts";

describe("creator profile", () => {
  it("默认启用五个视频草稿平台和八个图文草稿平台", () => {
    expect(emptyProfile()).toEqual({
      enabledPlatforms: [
        "bilibili",
        "douyin",
        "xiaohongshu",
        "channels",
        "kuaishou",
        "baijiahao",
        "penguin",
        "dingduan",
        "xueqiu",
        "eastmoney",
        "weibo",
        "zhihu",
        "wechat-mp",
      ],
    });
    expect(decodeProfile(undefined)).toEqual(emptyProfile());
  });

  it("迁移旧视频号 id 并过滤无效值", () => {
    expect(normalizeEnabledPlatforms(["wechat", "invalid", "douyin", "douyin"]))
      .toEqual(["douyin", "channels"]);
  });

  it("保留显式空列表", () => {
    const overlay = decodeOverlay({ profile: { enabledPlatforms: [] }, items: {} });
    expect(overlay.profile).toEqual({ enabledPlatforms: [] });
    expect(profileIsEmpty(overlay.profile!)).toBe(true);
  });

  it("校验新的 24 平台 profile", () => {
    expect(creatorProfileSchema.parse({
      enabledPlatforms: ["xiaohongshu", "wechat-mp"],
    })).toEqual({ enabledPlatforms: ["xiaohongshu", "wechat-mp"] });
  });
});

describe("platform accounts", () => {
  it("解码账号状态并迁移旧视频号 id", () => {
    const overlay = decodeOverlay({
      accounts: {
        wechat: { status: "active", checkedAt: 10, taskSpace: "42" },
        zhihu: { status: "expired" },
      },
      items: {},
    });
    expect(accountsFromOverlay(overlay)).toEqual([
      {
        platform: "channels",
        status: "active",
        checkedAt: 10,
        taskSpace: "42",
        supportsAutoDraft: true,
        draftCapability: "page-ready",
      },
      {
        platform: "zhihu",
        status: "expired",
        supportsAutoDraft: true,
        draftCapability: "remote-verified",
      },
    ]);
  });
});

describe("overlay lock", () => {
  it("串行保存重叠写入", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oil-overlay-"));
    await mkdir(dir, { recursive: true });
    await Promise.all([0, 1, 2].map((index) => withOverlayLock(dir, async () => {
      const store = await loadOverlay(dir);
      store.items[String(index)] = { title: String(index) };
      await saveOverlay(dir, store);
    })));
    const raw = JSON.parse(await readFile(overlayPath(dir), "utf8")) as {
      items: Record<string, { title: string }>;
    };
    expect(Object.keys(raw.items).sort()).toEqual(["0", "1", "2"]);
    expect(emptyOverlay().schemaVersion).toBe(1);
  });
});
