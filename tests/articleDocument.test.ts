import { mkdir, mkdtemp, readFile, realpath, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  articleImageUploadTarget,
  readArticleDocument,
  saveArticleDocument,
} from "../src/articleDocument.ts";

describe("ArticleDocument", () => {
  it("读取 Markdown 并通过版本号原子保存到原文件", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-document-"));
    const article = join(folder, "article.md");
    await writeFile(article, "# 初稿\n", "utf8");

    const loaded = await readArticleDocument(folder, article);
    expect(loaded).toMatchObject({ text: "# 初稿\n", editable: true });
    expect(loaded.revision).toMatch(/^[a-f0-9]{64}$/);

    const saved = await saveArticleDocument(folder, {
      path: article,
      text: "# 定稿\n\n正文。\n",
      expectedRevision: loaded.revision,
    });

    expect(await readFile(article, "utf8")).toBe("# 定稿\n\n正文。\n");
    expect(saved.revision).not.toBe(loaded.revision);
    expect(saved.savedAt).toBeGreaterThan(0);
  });

  it("磁盘内容已被外部修改时拒绝覆盖", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-conflict-"));
    const article = join(folder, "article.md");
    await writeFile(article, "旧内容", "utf8");
    const loaded = await readArticleDocument(folder, article);
    await writeFile(article, "外部编辑器的新内容", "utf8");

    await expect(saveArticleDocument(folder, {
      path: article,
      text: "工作台里的修改",
      expectedRevision: loaded.revision,
    })).rejects.toThrow("外部修改");
    expect(await readFile(article, "utf8")).toBe("外部编辑器的新内容");
  });

  it("HTML 只读，且拒绝内容目录之外的文章", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-readonly-"));
    const html = join(folder, "article.html");
    const outside = join(await mkdtemp(join(tmpdir(), "oil-article-outside-")), "outside.md");
    await Promise.all([
      writeFile(html, "<h1>HTML</h1>", "utf8"),
      writeFile(outside, "# 外部文章", "utf8"),
    ]);

    const loaded = await readArticleDocument(folder, html);
    expect(loaded.editable).toBe(false);
    await expect(saveArticleDocument(folder, {
      path: html,
      text: "# 不应写入",
      expectedRevision: loaded.revision,
    })).rejects.toThrow("只支持保存 Markdown");
    await expect(readArticleDocument(folder, outside)).rejects.toThrow("不属于当前内容文件夹");
  });

  it("Markdown 冲突副本自动关联同名微信公众号富文本预览", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-rich-preview-"));
    const richArticle = join(folder, "pre-market-wechat-body.md");
    const markdownArticle = join(folder, "pre-market-wechat-body-2.md");
    const richHtml = '<section data-wechat-draft="pre-market" style="color:#172033">陪你看盘 · 盘前观察 · 正文内容</section>';
    await Promise.all([
      writeFile(richArticle, richHtml, "utf8"),
      writeFile(markdownArticle, "# 陪你看盘 · 盘前观察\n\n正文内容\n", "utf8"),
    ]);

    const loaded = await readArticleDocument(folder, markdownArticle);

    expect(loaded.text).toBe("# 陪你看盘 · 盘前观察\n\n正文内容\n");
    expect(loaded.previewHtml).toBe(richHtml);
  });

  it("不把同名但正文不同的富文本误认为预览副本", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-rich-mismatch-"));
    const richArticle = join(folder, "article.md");
    const markdownArticle = join(folder, "article-2.md");
    await Promise.all([
      writeFile(
        richArticle,
        '<section data-wechat-draft="pre-market">另一篇完全不同的公众号正文内容</section>',
        "utf8",
      ),
      writeFile(markdownArticle, "# 当前文章\n\n这是正确选择的 Markdown 正文。\n", "utf8"),
    ]);

    const loaded = await readArticleDocument(folder, markdownArticle);

    expect(loaded.previewHtml).toBeUndefined();
  });

  it("为正文插图创建文章同级 images 目录和安全文件名", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-image-"));
    const article = join(folder, "公众号文章", "article.md");
    await mkdir(dirname(article), { recursive: true });
    await writeFile(article, "# 正文", "utf8");

    const target = await articleImageUploadTarget(folder, article, "盘面 图(1).PNG");

    expect(target.folderPath).toBe(join(await realpath(dirname(article)), "images"));
    expect(target.name).toMatch(/^盘面-图-1-[a-f0-9]{8}\.png$/);
    expect(target.markdownPrefix).toBe("images/");
  });

  it("同一版本的并发保存只允许一个成功，其余明确报冲突", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-concurrent-"));
    const article = join(folder, "article.md");
    await writeFile(article, "共同初稿");
    const loaded = await readArticleDocument(folder, article);
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      saveArticleDocument(folder, {
        path: article, text: `编辑窗口 ${index}`, expectedRevision: loaded.revision,
      }),
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const winner = results.findIndex((result) => result.status === "fulfilled");
    expect(await readFile(article, "utf8")).toBe(`编辑窗口 ${winner}`);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason.message).toContain("外部修改");
    }
    const latest = await readArticleDocument(folder, article);
    await saveArticleDocument(folder, { path: article, text: "再次保存", expectedRevision: latest.revision });
    expect(await readFile(article, "utf8")).toBe("再次保存");
    expect(await readdir(folder)).toEqual(["article.md"]);
  });

  it("同一文章的软链接入口共享保存锁", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-alias-"));
    const article = join(folder, "article.md");
    const alias = join(folder, "alias.md");
    await writeFile(article, "初稿");
    await symlink(article, alias);
    const loaded = await readArticleDocument(folder, article);
    const results = await Promise.allSettled([article, alias].map((path, index) =>
      saveArticleDocument(folder, { path, text: `版本 ${index}`, expectedRevision: loaded.revision }),
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await readFile(alias, "utf8")).toBe(await readFile(article, "utf8"));
  });

});
