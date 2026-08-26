import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SETTINGS_PLATFORMS,
  AUTO_DRAFT_PLATFORMS,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
} from "../src/platforms.ts";
import { ACCOUNT_PLATFORM_MARKS } from "../src/client/accountPlatformMarks.ts";
import {
  CREBEE_PLATFORM_ICONS,
  CREBEE_PLATFORM_ICON_SOURCES,
} from "../src/client/assets/platforms/crebeePlatformIcons.ts";
import { OFFICIAL_PLATFORM_ICON_SOURCES } from "../src/client/assets/platforms/officialPlatformIcons.ts";

describe("creator settings platform rows", () => {
  it("账号设置隐藏音频入口和境内 Web 不可用平台", () => {
    expect(PUBLISH_PLATFORMS.map((platform) => PUBLISH_PLATFORM_DEFINITIONS[platform].name))
      .toHaveLength(25);
    expect(ACCOUNT_SETTINGS_PLATFORMS).toHaveLength(21);
    expect(ACCOUNT_SETTINGS_PLATFORMS).toContain("kuaishou");
    expect(ACCOUNT_SETTINGS_PLATFORMS).not.toContain("netease-music");
    expect(ACCOUNT_SETTINGS_PLATFORMS).not.toContain("ximalaya");
    expect(ACCOUNT_SETTINGS_PLATFORMS).not.toContain("laohu");
    expect(ACCOUNT_SETTINGS_PLATFORMS).not.toContain("futu");
    expect(AUTO_DRAFT_PLATFORMS).toHaveLength(17);
  });

  it("按视频与图文分组账号工作台，暂不展示音频平台", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/CreatorSettingsCard.tsx"),
      "utf8",
    );
    const stylesheet = readFileSync(
      resolve(process.cwd(), "src/client/CreatorSettingsCard.css"),
      "utf8",
    );

    expect(implementation).toContain('className="settingsIcon"');
    expect(implementation).toContain("CONTENT_WORKBENCH_ICON_SRC");
    expect(implementation).toContain('className="accountGroups"');
    expect(implementation).toContain("<AccountPlatformMark platform={platform} />");
    expect(implementation).toContain('className={`accountGroup ${kind}Group`}');
    expect(implementation).toContain('leadingPlatforms: ["wechat-mp"]');
    expect(implementation).toContain("!leadingPlatforms.includes(platform)");
    expect(implementation).not.toContain('{ kind: "audio", label: "settings.account.audio" }');
    expect(implementation).toContain("function accountAction(");
    expect(implementation).toContain("settings.account.action.finish");
    expect(implementation).toContain("void runAccountAction(platform, action)");
    expect(implementation).not.toContain('void runAccountAction(platform, "open")');
    expect(implementation).not.toContain('void runAccountAction(platform, "check")');
    expect(stylesheet).toContain("container-type: inline-size");
    expect(stylesheet).toContain("@container oil-settings (max-width: 760px)");
    expect(stylesheet).toMatch(
      /\.body \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(stylesheet).toContain(
      "grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.35fr);",
    );
    expect(stylesheet).toContain("overflow: visible;");
    expect(stylesheet).not.toContain("max-height: 460px;");
  });

  it("为每个账号设置平台提供离线可用的小图标", () => {
    for (const platform of ACCOUNT_SETTINGS_PLATFORMS) {
      expect(ACCOUNT_PLATFORM_MARKS[platform]).toMatchObject({
        color: expect.stringMatching(/^#[0-9A-F]{6}$/),
        glyph: expect.any(String),
      });
    }

    expect(ACCOUNT_PLATFORM_MARKS.bilibili.src).toBe(CREBEE_PLATFORM_ICONS.bilibili);
    expect(ACCOUNT_PLATFORM_MARKS.douyin.src).toBe(CREBEE_PLATFORM_ICONS.douyin);
    expect(ACCOUNT_PLATFORM_MARKS.xiaohongshu.src).toBe(CREBEE_PLATFORM_ICONS.xiaohongshu);
    expect(ACCOUNT_PLATFORM_MARKS["xiaohongshu-note"].src)
      .toBe(CREBEE_PLATFORM_ICONS.xiaohongshu);
    expect(ACCOUNT_PLATFORM_MARKS.channels.src).toBe(CREBEE_PLATFORM_ICONS.channels);
  });

  it("优先使用 CreBee 同名 SVG，其余平台保留官网核对后的内嵌图标", () => {
    const crebeePlatforms = new Set([
      "bilibili",
      "douyin",
      "xiaohongshu",
      "xiaohongshu-note",
      "channels",
      "kuaishou",
      "toutiao",
      "baijiahao",
      "penguin",
      "netease",
      "dayu",
      "sohu",
      "weibo",
      "zhihu",
      "wechat-mp",
    ]);
    const visiblePlatforms = ACCOUNT_SETTINGS_PLATFORMS;

    for (const platform of visiblePlatforms) {
      const mark = ACCOUNT_PLATFORM_MARKS[platform];
      if (crebeePlatforms.has(platform)) {
        const crebeeId = (
          platform === "xiaohongshu-note" ? "xiaohongshu" : platform
        ) as keyof typeof CREBEE_PLATFORM_ICONS;
        expect(mark.src).toBe(CREBEE_PLATFORM_ICONS[crebeeId]);
        expect(mark.src).toMatch(/^data:image\/svg\+xml,/);
        expect(CREBEE_PLATFORM_ICON_SOURCES).toHaveProperty(crebeeId);
      } else {
        expect(mark.src).toMatch(/^data:image\/png;base64,/);
        expect(OFFICIAL_PLATFORM_ICON_SOURCES).toHaveProperty(platform);
      }
    }
  });
});
