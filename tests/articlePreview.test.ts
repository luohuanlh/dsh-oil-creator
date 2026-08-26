import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  articlePreviewFormat,
  buildMarkdownRichArticlePreviewDocument,
  buildRichArticlePreviewDocument,
} from "../src/articlePreview.ts";

describe("article preview", () => {
  it("识别 Markdown 文件中的微信公众号富文本", () => {
    expect(articlePreviewFormat(
      "/content/article.md",
      '<section data-wechat-draft="pre-market" style="color:#172033">正文</section>',
    )).toBe("rich-html");
    expect(articlePreviewFormat("/content/article.html", "<article>正文</article>"))
      .toBe("rich-html");
    expect(articlePreviewFormat("/content/article.md", "# 标题\n\n普通正文"))
      .toBe("markdown");
  });

  it("生成隔离的微信富文本预览文档并保留内联样式", () => {
    const document = buildRichArticlePreviewDocument(
      [
        '<section data-wechat-draft="pre-market" style="color:#172033">',
        '<img src="images/chart.png" onerror="alert(1)">',
        '<script>alert(1)</script>',
        "</section>",
      ].join(""),
      "http://127.0.0.1:9000",
    );

    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain('<base href="http://127.0.0.1:9000/">');
    expect(document).toContain('data-wechat-draft="pre-market"');
    expect(document).toContain('style="color:#172033"');
    expect(document).toContain("@media (max-width: 480px)");
    expect(document).not.toContain("<script");
    expect(document).not.toContain("onerror=");
  });

  it("普通 Markdown 套用内置公众号 HTML 富文本框架", () => {
    const document = buildMarkdownRichArticlePreviewDocument(
      [
        "**陪你看盘 · 盘前观察 · 8月24日**",
        "",
        "周末产业消息集中在 AI、存储与光模块。",
        "",
        "**免责声明**",
        "",
        "仅供研究参考，不构成投资建议。",
        "",
        "| **AI算力投入** | **11 条** |",
        "| --- | --- |",
        "",
        "|  |  |",
        "| --- | --- |",
        "",
        "| **01** |",
        "| --- |",
        "",
        "## 盘前摘要",
        "",
        "- **观察：**保持跟踪",
        "",
        "<script>alert(1)</script>",
      ].join("\n"),
      "http://127.0.0.1:9000",
    );

    expect(document).toContain('data-wechat-draft="markdown-frame"');
    expect(document).toContain('class="article-lead"');
    expect(document).toContain('class="article-disclaimer"');
    expect(document).toContain('class="signal-row"');
    expect(document).toContain('class="section-index"');
    expect(document).toContain(">盘前摘要</h2>");
    expect(document).toContain("<strong>观察：</strong>保持跟踪</li>");
    expect(document).not.toContain('<div class="table-scroll">');
    expect(document).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(document).not.toContain("<script>alert(1)</script>");
  });

  it("盘前稿使用与公众号成稿一致的 677px 富文本模板和文章页头", () => {
    const document = buildMarkdownRichArticlePreviewDocument(
      [
        "**陪你看盘 · 盘前观察 · 8月24日**",
        "",
        "盘前焦点摘要。",
        "",
        "**市场关注方向线索分布**",
        "",
        "条目多寡不等于上涨概率。",
        "",
        "|  |",
        "| --- |",
        "",
        "| **AI算力投入** | **11 条** |",
        "| --- | --- |",
        "",
        "|  |  |",
        "| --- | --- |",
        "",
        "逻辑 3 · 个股 4 · 催化 4",
        "",
        "| **01** |",
        "| --- |",
        "",
        "## 盘前摘要",
        "",
        "正文。",
      ].join("\n"),
      "",
      { title: "8月24日盘前", author: "短线观市", date: "2026年8月24日" },
    );

    expect(document).toContain('data-wechat-draft="pre-market"');
    expect(document).toContain("max-width:677px");
    expect(document).toContain('class="wechat-preview-header"');
    expect(document).toContain("8月24日盘前");
    expect(document).toContain("短线观市");
    expect(document).toContain('class="signal-overview"');
    expect(document).toContain('width="85%"');
    expect(document).toContain('class="article-section-heading"');
    expect(document).toContain('class="section-index"');
  });

  it("解码数字实体并把关键时点渲染为整块提示卡", () => {
    const document = buildMarkdownRichArticlePreviewDocument(
      [
        "## 市场节奏",
        "",
        "- **情绪判断：**市场情绪活跃。",
        "- **关键时点：**按时间顺序整理如下",
        "",
        "    **9月9日：**预计苹果发布会",
        "",
        "    **9月9-11日：**&#x4E2D;国国际光电博览会",
        "",
        "    **9月10日：**&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;",
      ].join("\n"),
      "",
    );

    expect(document).toContain('class="key-moments"');
    expect(document).toContain("<strong>关键时点：</strong>按时间顺序整理如下");
    expect(document).toContain("<strong>9月9-11日：</strong>中国国际光电博览会");
    expect(document).toContain("<strong>9月10日：</strong>&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(document).not.toContain("&amp;#x4E2D;");
    expect(document).not.toContain("<script>alert(1)</script>");
  });

  it("把 Markdown 转义星号还原为股票名称中的单个字面量星号", () => {
    const document = buildMarkdownRichArticlePreviewDocument(
      "## 风险提示\n\n- \\*ST康佳A停牌筹划重大事项。\n\n\\*不是斜体\\*",
      "",
    );

    expect(document).toContain("*ST康佳A停牌筹划重大事项。");
    expect(document).not.toContain("\\*ST康佳A停牌筹划重大事项。");
    expect(document).not.toContain("**ST康佳A停牌筹划重大事项。");
    expect(document).toContain("*不是斜体*");
    expect(document).not.toContain("<em>不是斜体</em>");
  });

  it("React 预览通过无脚本 sandbox iframe 呈现富文本和 Markdown 框架", () => {
    const preview = readFileSync(
      resolve(process.cwd(), "src/client/ArticlePreview.tsx"),
      "utf8",
    );
    const workbench = readFileSync(
      resolve(process.cwd(), "src/client/ArticleWorkbench.tsx"),
      "utf8",
    );

    expect(preview).toContain("buildRichArticlePreviewDocument");
    expect(preview).toContain("buildMarkdownRichArticlePreviewDocument");
    expect(preview).toContain('sandbox=""');
    expect(preview).toContain("srcDoc={richDocument}");
    expect(preview).toContain('referrerPolicy="no-referrer"');
    expect(workbench).toContain("<ArticlePreview");
  });
});
