import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DISTRIBUTION_PACKAGE_NAME,
  discoverContentAssets,
  freezeDistributionPackage,
  isFrozenDistributionPackageFresh,
  readFrozenDistributionPackage,
  readDistributionSource,
} from "../src/distribution.ts";

describe("discoverContentAssets", () => {
  it("列出工作台可选的全部视频、字幕、文章和封面", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-assets-"));
    await mkdir(join(folder, "公众号文章"));
    await writeFile(join(folder, "take-a.mp4"), "a");
    await writeFile(join(folder, "take-b.mov"), "b");
    await writeFile(join(folder, "voice.srt"), "字幕");
    await writeFile(join(folder, "cover.png"), "cover");
    await writeFile(join(folder, "公众号文章", "article.md"), "# 正文");
    await writeFile(join(folder, "article.html"), "<h1>HTML 正文</h1>");

    const assets = await discoverContentAssets(folder);

    expect(assets.videos.map((asset) => asset.name)).toEqual(["take-a.mp4", "take-b.mov"]);
    expect(assets.subtitles.map((asset) => asset.name)).toEqual(["voice.srt"]);
    expect(assets.articles.map((asset) => asset.name)).toEqual(["article.html", "article.md"]);
    expect(assets.covers.map((asset) => asset.name)).toEqual(["cover.png"]);
  });
});

describe("distribution package", () => {
  it("视频未选字幕时读取同目录脚本与选题，避免把空来源交给 Harness AI", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-source-"));
    const video = join(folder, "final.mp4");
    await writeFile(video, "video");
    await writeFile(join(folder, "script.md"), "# 口播脚本\n\n三步安装 Harness。\n");
    await writeFile(join(folder, "topic.md"), "# 选题\n\n面向第一次安装的新手。\n");

    const source = await readDistributionSource(folder, {
      mode: "video",
      videoPath: video,
    });

    expect(source).toMatchObject({ mode: "video", videoPath: await realpath(video) });
    expect(source.subtitlePath).toBeUndefined();
    expect(source.sourceText).toContain("三步安装 Harness");
    expect(source.sourceText).toContain("面向第一次安装的新手");
  });

  it("读取并冻结可选视频封面，确保草稿运行器拿到同一份素材", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-video-cover-"));
    const video = join(folder, "final.mp4");
    const cover = join(folder, "cover.png");
    await writeFile(video, "video");
    await writeFile(cover, "cover");

    const source = await readDistributionSource(folder, {
      mode: "video",
      videoPath: video,
      coverPath: cover,
    });
    expect(source.coverPath).toBe(await realpath(cover));

    const frozen = await freezeDistributionPackage({
      id: "video-cover-demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video, coverPath: cover },
      variants: [{
        platform: "bilibili",
        title: "带封面的视频",
        summary: "摘要",
        body: "简介",
        tags: ["封面"],
      }],
    });
    expect(frozen.package.selection).toMatchObject({
      mode: "video",
      videoPath: await realpath(video),
      coverPath: await realpath(cover),
    });
    expect((await readFrozenDistributionPackage(folder))?.selection).toMatchObject({
      coverPath: await realpath(cover),
    });
  });

  it("读取已选文章与封面作为 Harness AI 输入", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-source-"));
    const article = join(folder, "article.md");
    const cover = join(folder, "cover.jpg");
    await writeFile(article, "# 原文\n\n这里是正文。\n");
    await writeFile(cover, "cover");

    const source = await readDistributionSource(folder, {
      mode: "article",
      articlePath: await realpath(article),
      coverPath: await realpath(cover),
    });

    expect(source).toMatchObject({
      mode: "article",
      sourceText: "# 原文\n\n这里是正文。",
      articlePath: await realpath(article),
      coverPath: await realpath(cover),
    });
  });

  it("读取 HTML 文章作为 Harness AI 输入", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-source-"));
    const article = join(folder, "article.html");
    const cover = join(folder, "cover.webp");
    await writeFile(article, "<article><h1>原文</h1><p>这里是正文。</p></article>\n");
    await writeFile(cover, "cover");

    const source = await readDistributionSource(folder, {
      mode: "article",
      articlePath: article,
      coverPath: cover,
    });

    expect(source.sourceText).toBe("<article><h1>原文</h1><p>这里是正文。</p></article>");
  });

  it("冻结图文包时保留用户填写的可选标题和摘要", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-article-"));
    const article = join(folder, "article.md");
    const cover = join(folder, "cover.png");
    await writeFile(article, "# 正文\n");
    await writeFile(cover, "cover");

    const frozen = await freezeDistributionPackage({
      id: "article-demo",
      folderPath: folder,
      selection: {
        mode: "article",
        articlePath: article,
        coverPath: cover,
        articleTitle: "标题参考",
        articleSummary: "摘要参考",
      },
      variants: [{
        platform: "wechat-mp",
        title: "公众号标题",
        summary: "公众号摘要",
        body: "公众号正文",
        tags: ["AI"],
      }],
    });

    expect(frozen.package.selection).toMatchObject({
      articleTitle: "标题参考",
      articleSummary: "摘要参考",
    });
  });

  it("拒绝选择内容文件夹之外的路径", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-source-"));
    const outside = join(await mkdtemp(join(tmpdir(), "oil-outside-")), "outside.mp4");
    await writeFile(outside, "video");

    await expect(readDistributionSource(folder, {
      mode: "video",
      videoPath: outside,
    })).rejects.toThrow("不属于当前内容文件夹");
  });

  it("原子冻结平台变体，后续 Ego 重试复用同一份内容", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-"));
    const video = join(folder, "final.mp4");
    const subtitle = join(folder, "final.srt");
    await writeFile(video, "video");
    await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:01,000\n你好\n");

    const frozen = await freezeDistributionPackage({
      id: "2026-08-21_demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video, subtitlePath: subtitle },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "B站摘要", body: "B站简介", tags: ["AI", "效率"] },
        { platform: "douyin", title: "抖音标题", summary: "抖音摘要", body: "抖音文案", tags: ["AI"] },
      ],
      createdAt: "2026-08-21T12:00:00.000Z",
    });

    expect(frozen.packagePath).toBe(join(folder, DISTRIBUTION_PACKAGE_NAME));
    expect(JSON.parse(await readFile(frozen.packagePath, "utf8"))).toEqual(frozen.package);
    expect(frozen.package).toMatchObject({
      schemaVersion: 2,
      id: "2026-08-21_demo",
      mode: "video",
      selection: { videoPath: await realpath(video), subtitlePath: await realpath(subtitle) },
      variants: {
        bilibili: { title: "B站标题", body: "B站简介", tags: ["AI", "效率"] },
        douyin: { title: "抖音标题", body: "抖音文案", tags: ["AI"] },
      },
    });

    const retried = await freezeDistributionPackage({
      id: "2026-08-21_demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video, subtitlePath: subtitle },
      variants: [
        { platform: "bilibili", title: "不应覆盖", summary: "新摘要", body: "新简介", tags: ["新"] },
        { platform: "douyin", title: "不应覆盖", summary: "新摘要", body: "新文案", tags: ["新"] },
      ],
      createdAt: "2026-08-22T12:00:00.000Z",
    });
    expect(retried.package).toEqual(frozen.package);
    expect(JSON.parse(await readFile(frozen.packagePath, "utf8"))).toEqual(frozen.package);
  });

  it("文章原文变化后冻结包立即过期，重新冻结不会复用旧平台文案", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-freshness-"));
    const article = join(folder, "article.md");
    const cover = join(folder, "cover.png");
    await writeFile(article, "# 第一版\n", "utf8");
    await writeFile(cover, "cover");

    const first = await freezeDistributionPackage({
      id: "article-freshness",
      folderPath: folder,
      selection: { mode: "article", articlePath: article, coverPath: cover },
      variants: [{
        platform: "wechat-mp",
        title: "第一版",
        summary: "摘要",
        body: "第一版正文",
        tags: ["AI"],
      }],
    });
    expect(await isFrozenDistributionPackageFresh(folder, first.package)).toBe(true);

    await writeFile(article, "# 第二版\n", "utf8");
    expect(await isFrozenDistributionPackageFresh(folder, first.package)).toBe(false);

    const second = await freezeDistributionPackage({
      id: "article-freshness",
      folderPath: folder,
      selection: { mode: "article", articlePath: article, coverPath: cover },
      variants: [{
        platform: "wechat-mp",
        title: "第二版",
        summary: "新摘要",
        body: "第二版正文",
        tags: ["AI"],
      }],
    });
    expect(second.package.sourceDigest).not.toBe(first.package.sourceDigest);
    expect(second.package.variants["wechat-mp"]?.body).toBe("第二版正文");
  });

  it("拒绝消费被篡改为内容目录之外路径的冻结包", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-tampered-"));
    const outside = join(await mkdtemp(join(tmpdir(), "oil-freeze-secret-")), "secret.mp4");
    await writeFile(outside, "secret");
    await writeFile(join(folder, DISTRIBUTION_PACKAGE_NAME), JSON.stringify({
      schemaVersion: 2,
      sourceDigest: "0".repeat(64),
      id: "demo",
      mode: "video",
      createdAt: "2026-08-21T12:00:00.000Z",
      selection: { mode: "video", videoPath: outside },
      variants: {
        bilibili: { title: "标题", summary: "摘要", body: "正文", tags: ["AI"] },
      },
    }));

    expect(await readFrozenDistributionPackage(folder)).toBeUndefined();
  });

  it("拒绝重复平台和空文案，避免 Ego 接收含糊输入", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-"));
    const video = join(folder, "final.mp4");
    await writeFile(video, "video");

    await expect(freezeDistributionPackage({
      id: "demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "", summary: "", body: "", tags: [] },
        { platform: "bilibili", title: "重复", summary: "", body: "正文", tags: ["AI"] },
      ],
    })).rejects.toThrow();
  });

  it("在冻结前强制平台标题与标签上限", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-"));
    const video = join(folder, "final.mp4");
    await writeFile(video, "video");

    await expect(freezeDistributionPackage({
      id: "demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video },
      variants: [{
        platform: "douyin",
        title: "超过三十个字的抖音标题超过三十个字的抖音标题超过三十个字的抖音标题",
        summary: "摘要",
        body: "正文",
        tags: ["一", "二", "三", "四", "五", "六"],
      }],
    })).rejects.toThrow(/标题|标签/);
  });

  it("拒绝把视频素材冻结给文章平台", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-freeze-"));
    const video = join(folder, "final.mp4");
    await writeFile(video, "video");

    await expect(freezeDistributionPackage({
      id: "demo",
      folderPath: folder,
      selection: { mode: "video", videoPath: video },
      variants: [{
        platform: "wechat-mp",
        title: "公众号标题",
        summary: "摘要",
        body: "正文",
        tags: ["AI"],
      }],
    })).rejects.toThrow("素材类型与平台不匹配");
  });
});
