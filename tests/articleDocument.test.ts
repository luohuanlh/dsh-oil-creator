import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
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
});
