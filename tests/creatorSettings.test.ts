import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_PLATFORMS,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
} from "../src/platforms.ts";

describe("creator settings platform rows", () => {
  it("展示 24 个账号入口和五个可选草稿平台", () => {
    expect(PUBLISH_PLATFORMS.map((platform) => PUBLISH_PLATFORM_DEFINITIONS[platform].name))
      .toHaveLength(24);
    expect(AUTO_DRAFT_PLATFORMS).toHaveLength(5);
  });

  it("按视频、图文与音频分组账号工作台", () => {
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
    expect(implementation).toContain('className={`accountGroup ${kind}Group`}');
    expect(implementation).toContain('{ kind: "audio", label: "settings.account.audio" }');
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
});
