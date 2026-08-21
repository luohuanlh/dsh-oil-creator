import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("create content dialog", () => {
  it("默认选中视频，并以原生单选语义提供三种内容类型", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/sidebar/ContentSidebarPanel.tsx"),
      "utf8",
    );

    expect(implementation).toContain('useState<ContentType>("video")');
    expect(implementation).toContain('role="radiogroup"');
    expect(implementation).toContain('type="radio"');
    expect(implementation).toContain('{ id: "video", label: "create.type.video"');
    expect(implementation).toContain('{ id: "audio", label: "create.type.audio"');
    expect(implementation).toContain('{ id: "article", label: "create.type.article"');
    expect(implementation).toContain('<ContentTypeGlyph type={id} className="createTypeIcon" />');
    expect(implementation).not.toContain("createTypeIndex");
    expect(implementation).toContain("createContent(title, createType)");
  });

  it("在目录条目中以小图标标识视频、音频和图文", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/sidebar/ContentSidebarPanel.tsx"),
      "utf8",
    );

    expect(implementation).toContain("function ContentTypeMark(");
    expect(implementation).toContain("function ContentTypeGlyph(");
    expect(implementation).toContain('data-content-type={contentType}');
    expect(implementation).toContain('type === "video"');
    expect(implementation).toContain('type === "audio"');
    expect(implementation).toContain('type === "article"');
  });
});
