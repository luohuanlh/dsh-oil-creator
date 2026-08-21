import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_PLATFORMS,
  PUBLISH_PLATFORM_DEFINITIONS,
  supportsAutoDraft,
} from "../src/platforms.ts";

describe("content inspector distribution workbench", () => {
  it("只展示真实自动草稿平台", () => {
    expect(AUTO_DRAFT_PLATFORMS.filter((platform) =>
      supportsAutoDraft(platform) && PUBLISH_PLATFORM_DEFINITIONS[platform].kind === "video"
    )).toHaveLength(4);
    expect(AUTO_DRAFT_PLATFORMS).toContain("wechat-mp");
  });

  it("移除概览和单项标签栏，按内容类型直接展示工作流", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );

    expect(implementation).toContain('className="workflowRail"');
    expect(implementation).not.toContain('className="flowNumber"');
    expect(implementation).toContain('marker="01"');
    expect(implementation).toContain('marker="02"');
    expect(implementation).not.toContain('marker="03"');
    expect(implementation).not.toContain('className="modePicker"');
    expect(implementation).toContain('renderWorkflow("video")');
    expect(implementation).toContain('renderWorkflow("article")');
    expect(implementation).toContain('contentType === "audio" && renderAudio()');
    expect(implementation).not.toContain('"overview"');
    expect(implementation).not.toContain('className="tabs"');
    expect(implementation).not.toContain('role="tablist"');
    expect(implementation).not.toContain('className="editorialHero"');
    expect(implementation).not.toContain("InspectorTab");
    expect(implementation).not.toContain("inspectorTabs");
    expect(implementation.match(/void openPath\(detail\.folderPath\)/g)).toHaveLength(1);

    expect(implementation).toContain("detail.assets.videos");
    expect(implementation).toContain("detail.assets.subtitles");
    expect(implementation).toContain("detail.assets.articles");
    expect(implementation).toContain("detail.assets.covers");
    expect(implementation).toContain("queueDistribution");
    expect(implementation).toContain("selectedPlatforms.some((platform) => detail.publish[platform].draftState === \"running\")");
    expect(implementation).toContain("&& !queued");
    expect(implementation).toContain("getVideoPlayback(selectedId, videoPath)");
    expect(implementation).toContain("getArticleMedia(selectedId, articlePath)");
    expect(implementation).not.toContain("enabledPlatforms.some((platform) => detail.publish[platform].draftState === \"running\")");
    expect(implementation).not.toContain("publish-package.json");
  });

  it("顶部流程使用极简单行短字", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.css"),
      "utf8",
    );
    const locales = readFileSync(
      resolve(process.cwd(), "src/client/locales.ts"),
      "utf8",
    );

    expect(styles).toContain('content: "→"');
    expect(styles).toContain("width: max-content");
    expect(locales).toContain('"inspector.flow.content": "内容"');
    expect(locales).toContain('"inspector.flow.distribute": "草稿"');
  });

  it("Client 工作台只排队到当前 Harness 会话，不暴露直接启动草稿旁路", () => {
    const face = readFileSync(resolve(process.cwd(), "src/client/face.ts"), "utf8");

    expect(face).toContain("queueDistribution");
    expect(face).not.toContain("startDrafts");
    expect(face).not.toContain("StartDraftsResult");
  });

  it("宽屏平台卡片一行两列，并隐藏单次发布权确认", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const styles = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.css"),
      "utf8",
    );

    expect(implementation).toContain('className="draftStatusRow"');
    expect(implementation).not.toContain('className="draftStatusLabel"');
    expect(implementation).not.toContain('className="rightsConfirm"');
    expect(implementation).not.toContain("rightsConfirmed");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).toContain(".draftStatusRow");
    expect(styles).not.toContain(".rightsConfirm");
  });

  it("图文素材支持导入本地文件，并移除空文章提示", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const locales = readFileSync(
      resolve(process.cwd(), "src/client/locales.ts"),
      "utf8",
    );

    expect(implementation.match(/type="file"/g)).toHaveLength(2);
    expect(implementation).toContain('onImportAsset("article", file)');
    expect(implementation).toContain('onImportAsset("cover", file)');
    expect(implementation).toContain("importAsset({");
    expect(implementation).toContain(".html,.htm");
    expect(implementation.match(/maxLength=\{ARTICLE_META_MAX\}/g)).toHaveLength(2);
    expect(implementation).toContain("articleTitle.length}/{ARTICLE_META_MAX}");
    expect(implementation).toContain("articleSummary.length}/{ARTICLE_META_MAX}");
    expect(implementation).toContain("articleTitle: articleTitle.trim()");
    expect(implementation).toContain("articleSummary: articleSummary.trim()");
    expect(implementation).not.toContain('t("inspector.article.empty")');
    expect(locales).not.toContain("公众号文章/ 里还没有 Markdown 成稿。");
    expect(locales).not.toContain("平台文案已冻结");
    expect(locales).toContain("平台文案已生成");
    expect(implementation).toContain("titleAside={(");
    expect(implementation).toContain('className="packageHint"');
    expect(implementation).not.toContain('className="packageState"');
  });
});
