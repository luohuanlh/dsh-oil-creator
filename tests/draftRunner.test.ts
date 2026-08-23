import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { prepareDraftRun } from "../src/draftRunner.ts";
import { freezeDistributionPackage } from "../src/distribution.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import type { ContentSummary } from "../src/types.ts";

function item(folderPath: string, videoPath: string): ContentSummary {
  return {
    id: "2026-08-21_测试",
    folderPath,
    title: "测试标题",
    recordedAt: 1,
    createdMs: 1,
    videoRaw: videoPath,
    covers: {},
    subtitles: {},
    assets: {
      videos: [{ name: "demo.mp4", path: videoPath }],
      subtitles: [],
      articles: [],
      covers: [],
    },
    hasPublishPackage: false,
    hasDistributionPackage: true,
    hasArticle: false,
    waitingForExport: false,
    tags: [],
    pipeline: "packaged",
    workflow: "publish",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
  };
}

describe("prepareDraftRun", () => {
  it("从 Harness 冻结分发包派生平台字段，不要求人工 publish-package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "B站摘要", body: "B站简介", tags: ["B站标签"] },
        { platform: "channels", title: "视频号标题", summary: "视频号摘要", body: "视频号说明", tags: ["视频号标签"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["bilibili", "channels"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as Record<string, unknown>;

    expect(derived).toMatchObject({
      title: "B站标题",
      videoPath: await realpath(video),
      bilibiliTitle: "B站标题",
      bilibiliDescription: "B站简介",
      bilibiliTags: ["B站标签"],
      wechatTitle: "视频号标题",
      wechatDescription: "视频号说明",
      wechatTags: ["视频号标签"],
    });
    expect(result.runnerPlatforms).toEqual(["bilibili", "wechat_channels"]);
  });

  it("B站选择封面时生成显式自定义 4:3 封面包", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-custom-cover-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    const cover = join(root, "cover-4x3.png");
    await writeFile(video, "video");
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    }).png().toFile(cover);
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video, coverPath: cover },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "", body: "B站简介", tags: ["B站标签"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["bilibili"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as Record<string, unknown>;

    expect(derived).toMatchObject({
      bilibiliCoverStrategy: "custom",
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: await realpath(cover),
      },
    });
  });

  it("B站选择方形封面时自动派生 4:3 文件，不改动原图", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-square-cover-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    const cover = join(root, "cover-square.png");
    await writeFile(video, "video");
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 120, g: 80, b: 40 },
      },
    }).png().toFile(cover);
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video, coverPath: cover },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "", body: "B站简介", tags: ["B站标签"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["bilibili"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as {
      cover: { horizontal4x3Path: string };
    };
    const sourceMetadata = await sharp(cover).metadata();
    const derivedMetadata = await sharp(derived.cover.horizontal4x3Path).metadata();

    expect(derived.cover.horizontal4x3Path).not.toBe(await realpath(cover));
    expect({ width: sourceMetadata.width, height: sourceMetadata.height })
      .toEqual({ width: 1024, height: 1024 });
    expect({ width: derivedMetadata.width, height: derivedMetadata.height })
      .toEqual({ width: 1024, height: 768 });
  });

  it("B站未选择封面时显式请求平台 AI 封面", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-ai-cover-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "", body: "B站简介", tags: ["B站标签"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["bilibili"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as Record<string, unknown>;

    expect(derived).toMatchObject({
      bilibiliCoverStrategy: "platform-ai",
      cover: { uploadCustomCover: false },
    });
  });

  it("抖音选择方形封面时同时派生 3:4 与 4:3 文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-douyin-cover-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    const cover = join(root, "cover-square.png");
    await writeFile(video, "video");
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 150, g: 100, b: 50 },
      },
    }).png().toFile(cover);
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video, coverPath: cover },
      variants: [
        { platform: "douyin", title: "抖音标题", summary: "", body: "抖音简介", tags: ["抖音标签"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["douyin"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as {
      cover: { vertical3x4Path: string; horizontal4x3Path: string };
    };
    const vertical = await sharp(derived.cover.vertical3x4Path).metadata();
    const horizontal = await sharp(derived.cover.horizontal4x3Path).metadata();

    expect({ width: vertical.width, height: vertical.height })
      .toEqual({ width: 768, height: 1024 });
    expect({ width: horizontal.width, height: horizontal.height })
      .toEqual({ width: 1024, height: 768 });
  });

  it("快手派生单描述、最多四个话题与可选 4:3 封面", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-kuaishou-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    const cover = join(root, "cover-4x3.png");
    await writeFile(video, "video");
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 30, g: 60, b: 90 },
      },
    }).png().toFile(cover);
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video, coverPath: cover },
      variants: [
        { platform: "kuaishou", title: "快手标题", summary: "", body: "快手正文", tags: ["AI工具", "自动化测试"] },
      ],
    });

    const result = await prepareDraftRun(item(root, video), data, ["kuaishou"]);
    const derived = JSON.parse(await readFile(result.packagePath, "utf8")) as Record<string, unknown>;

    expect(derived).toMatchObject({
      kuaishouTitle: "快手标题",
      kuaishouDescription: "快手正文",
      kuaishouTopics: ["AI工具", "自动化测试"],
      cover: {
        uploadCustomCover: true,
        horizontal4x3Path: await realpath(cover),
      },
    });
    expect(result.runnerPlatforms).toEqual(["kuaishou"]);
  });

  it("拒绝冻结包缺少目标平台变体", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "", body: "B站简介", tags: ["AI"] },
      ],
    });

    await expect(prepareDraftRun(item(root, video), root, ["douyin"]))
      .rejects.toThrow("缺少抖音平台变体");
  });

  it("按目标平台隔离临时分发包，避免并发草稿互相覆盖", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-"));
    const data = join(root, "data");
    await mkdir(data);
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    await freezeDistributionPackage({
      id: "2026-08-21_测试",
      folderPath: root,
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "", body: "B站简介", tags: ["AI"] },
        { platform: "douyin", title: "抖音标题", summary: "", body: "抖音简介", tags: ["AI"] },
      ],
    });

    const bilibili = await prepareDraftRun(item(root, video), data, ["bilibili"]);
    const douyin = await prepareDraftRun(item(root, video), data, ["douyin"]);

    expect(bilibili.packagePath).not.toBe(douyin.packagePath);
    expect(bilibili.packagePath).toContain("bilibili");
    expect(douyin.packagePath).toContain("douyin");
  });

  it("拒绝没有真实草稿适配器的平台", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-draft-runner-"));
    await expect(prepareDraftRun(item(root, join(root, "demo.mp4")), root, ["netease"]))
      .rejects.toThrow("尚未接入自动草稿");
  });
});
