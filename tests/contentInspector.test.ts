import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_PLATFORMS,
  PUBLISH_PLATFORM_DEFINITIONS,
  supportsAutoDraft,
} from "../src/platforms.ts";

describe("content inspector distribution workbench", () => {
  it("保留五个真实视频自动草稿平台", () => {
    expect(AUTO_DRAFT_PLATFORMS.filter((platform) =>
      supportsAutoDraft(platform) && PUBLISH_PLATFORM_DEFINITIONS[platform].kind === "video"
    )).toHaveLength(5);
    expect(AUTO_DRAFT_PLATFORMS).toContain("wechat-mp");
    expect(AUTO_DRAFT_PLATFORMS).toContain("baijiahao");
  });

  it("移除概览和单项标签栏，按内容类型直接展示工作流", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );

    expect(implementation).toContain('className="workflowRail"');
    expect(implementation).toContain('className="flowCount"');
    expect(implementation).toContain("remoteDraftProgress(selectedPlatforms, detail?.publish ?? {})");
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
    expect(implementation).toContain("visibleDistributionPlatforms(workflowMode, enabledPlatforms)");
    expect(implementation).toContain('disabled={!supportsDraft}');
    expect(implementation).toContain('t("inspector.draft.unsupported")');
    expect(implementation).toContain("selectedPlatforms.some((platform) => detail.publish[platform].draftState === \"running\")");
    expect(implementation).toContain("&& !queued");
    expect(implementation).not.toContain("queueTimeout");
    expect(implementation).not.toContain("120_000");
    expect(implementation).toContain("getVideoPlayback(selectedId, videoPath)");
    expect(implementation).toContain("<ArticleWorkbench");
    expect(implementation).toContain("getArticleMedia={getArticleMedia}");
    expect(implementation).toContain("saveArticle={saveArticle}");
    expect(implementation).toContain("prepareArticleImageUpload={prepareArticleImageUpload}");
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
    expect(locales).toContain('"inspector.publish.draft": "远端草稿已保存"');
    expect(locales).toContain('"inspector.draft.staged": "页面已备，尚未远端保存"');
  });

  it("把流程状态放进页头，两个工作章节保持展开", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const styles = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.css"),
      "utf8",
    );

    expect(implementation).toContain('className="titleMetaRow"');
    expect(implementation).toContain("renderWorkflowRail");
    expect(implementation).not.toContain("WorkflowDrawer");
    expect(implementation).not.toContain("openWorkflowDrawer");
    expect(implementation).not.toContain("contentId=");
    expect(styles).toContain(".titleMetaRow");
    expect(styles).not.toContain(".workflowSurface.drawerClosed");
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

    expect(implementation.match(/type="file"/g)).toHaveLength(5);
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
    expect(implementation).not.toContain('className="packageHint"');
    expect(locales).not.toContain("选了 .srt/.ass/.vtt/.txt");
    expect(implementation).not.toContain('className="packageState"');
  });

  it("Markdown 工作台支持源码编辑、显式保存和本地插图", () => {
    const workbench = readFileSync(
      resolve(process.cwd(), "src/client/ArticleWorkbench.tsx"),
      "utf8",
    );
    const editor = readFileSync(
      resolve(process.cwd(), "src/client/ArticleEditor.tsx"),
      "utf8",
    );
    const preview = readFileSync(
      resolve(process.cwd(), "src/client/ArticlePreview.tsx"),
      "utf8",
    );

    expect(editor).toContain("basicSetup");
    expect(editor).toContain("markdown()");
    expect(editor).toContain("insertMarkdown");
    expect(editor).toContain('event.key.toLowerCase() === "s"');
    expect(workbench).toContain("saveArticle({");
    expect(workbench).toContain("expectedRevision: document.revision");
    expect(workbench).toContain("prepareArticleImageUpload({");
    expect(workbench).toContain('method: "PUT"');
    expect(workbench).toContain("<ArticlePreview");
    expect(preview).toContain("rewriteArticleImages(source, origin)");
    expect(preview).toContain("buildMarkdownRichArticlePreviewDocument(markdown, origin)");
    expect(workbench).toContain('window.addEventListener("beforeunload"');
  });

  it("视频和字幕支持选择本地文件，导入后立即成为当前素材", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );

    expect(implementation.match(/type="file"/g)).toHaveLength(5);
    expect(implementation).toContain('onImportAsset("video", file)');
    expect(implementation).toContain('onImportAsset("subtitle", file)');
    expect(implementation).toContain('accept=".mp4,.mov,video/mp4,video/quicktime"');
    expect(implementation).toContain('accept=".srt,.ass,.vtt,.txt"');
    expect(implementation).toContain("prepareAssetUpload({");
    expect(implementation).toContain("setVideoPath(imported.asset.path)");
    expect(implementation).toContain("setSubtitlePath(imported.asset.path)");
  });

  it("视频素材区删除冗余说明，并在视频下方提供封面图导入", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const locales = readFileSync(
      resolve(process.cwd(), "src/client/locales.ts"),
      "utf8",
    );

    expect(implementation).not.toContain('hint={t("inspector.content.hint")}');
    expect(locales).not.toContain("可选择内容文件夹里的素材，也可从本机导入");
    expect(implementation).toContain('className="assetField videoCoverField"');
    expect(implementation).toContain('t("inspector.asset.videoCover")');
    expect(implementation.match(/onImportAsset\("cover", file\)/g)).toHaveLength(2);
    expect(locales).toContain('"inspector.asset.videoCover": "封面图"');
  });

  it("视频、字幕和封面标签收进各自的空选项", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const locales = readFileSync(
      resolve(process.cwd(), "src/client/locales.ts"),
      "utf8",
    );

    expect(implementation).not.toContain('<span>{t("inspector.asset.video")}</span>');
    expect(implementation).not.toContain('<span>{t("inspector.asset.subtitle")}</span>');
    expect(implementation).not.toContain('<span>{t("inspector.asset.videoCover")}</span>');
    expect(implementation).toContain('<option value="">{t("inspector.asset.video")}</option>');
    expect(implementation).toContain('<option value="">{t("inspector.asset.subtitle")}</option>');
    expect(implementation).toContain('<option value="">{t("inspector.asset.videoCover")}</option>');
    expect(implementation).not.toContain('t("inspector.asset.none")');
    expect(locales).not.toContain('"inspector.asset.none"');
  });

  it("把已选视频封面纳入提交给 Harness 的固定素材选择", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );

    expect(implementation).toContain('...(coverPath === "" ? {} : { coverPath })');
  });

  it("压缩工作台页头，并把草稿主操作移到章节标题右侧", () => {
    const implementation = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.tsx"),
      "utf8",
    );
    const locales = readFileSync(
      resolve(process.cwd(), "src/client/locales.ts"),
      "utf8",
    );
    const styles = readFileSync(
      resolve(process.cwd(), "src/client/ContentInspector.css"),
      "utf8",
    );

    expect(implementation).not.toContain('className="title"');
    expect(implementation).toContain('className="workflowSurface draftSurface"');
    expect(implementation).toContain('titleAside={(\n              <ActionButton');
    expect(implementation.match(/<ActionBar>/g)).toHaveLength(1);
    expect(implementation).not.toContain('t("inspector.distribution.ready")');
    expect(implementation).not.toContain('t("inspector.distribution.hint")');
    expect(locales).not.toContain("所选平台均已登录，可以创建草稿。");
    expect(styles).toContain(".draftSurface .oilSurfaceHeadingAside");
  });
});
