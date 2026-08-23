import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  CONTENT_METADATA_NAME,
  countsOf,
  coverPathOf,
  createContentFolder,
  folderDateAndTitle,
  folderDateMs,
  folderNameForTitle,
  matchesFilter,
  matchesQuery,
  pipelineOf,
  scanLibrary,
  workflowOf,
  cuesFromAss,
  cuesFromTranscript,
  readScript,
  readSubtitleCues,
  writeScript,
  stripSubtitleMarkup,
  transcriptPlainText,
} from "../src/catalog.ts";
import { emptyOverlay } from "../src/overlay.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import {
  DISTRIBUTION_PACKAGE_NAME,
  distributionSourceDigest,
} from "../src/distribution.ts";

describe("folderNameForTitle", () => {
  it("prefixes today and strips path characters", () => {
    expect(folderNameForTitle("  DeepSeek / 安装  ", new Date(2026, 7, 15))).toBe(
      "2026-08-15_DeepSeek 安装",
    );
  });

  it("turns hyphens into spaces", () => {
    expect(folderNameForTitle("去-ai-味儿", new Date(2026, 7, 15))).toBe("2026-08-15_去 ai 味儿");
  });
});

describe("createContentFolder", () => {
  it("创建带默认视频类型元数据的日期目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-create-"));
    const created = await createContentFolder(root, "一期测试", new Date(2026, 7, 15));
    expect(created.id).toBe("2026-08-15_一期测试");
    await expect(readFile(join(created.folderPath, CONTENT_METADATA_NAME), "utf8"))
      .resolves.toContain('"contentType": "video"');
    const items = await scanLibrary(root, emptyOverlay());
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("一期测试");
    expect(items[0]?.contentType).toBe("video");
    expect(items[0]?.pipeline).toBe("raw");
  });

  it("保存并扫描用户选择的音频类型", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-create-audio-"));
    await createContentFolder(root, "一期播客", new Date(2026, 7, 15), "audio");
    const [item] = await scanLibrary(root, emptyOverlay());
    expect(item?.contentType).toBe("audio");
  });
});

describe("scanLibrary video pick", () => {
  it("uses the newest raw video when several exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-videos-"));
    const created = await createContentFolder(root, "多成片", new Date(2026, 7, 15));
    const older = join(created.folderPath, "take-1.mp4");
    const newer = join(created.folderPath, "take-2.mp4");
    await writeFile(older, "old");
    await writeFile(newer, "new");
    await utimes(older, new Date(2026, 7, 15, 10), new Date(2026, 7, 15, 10));
    await utimes(newer, new Date(2026, 7, 15, 12), new Date(2026, 7, 15, 12));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.videoRaw).toBe(newer);
  });
});

describe("scanLibrary workbench assets", () => {
  it("返回全部候选素材，并识别 AI 冻结分发包", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-workbench-assets-"));
    const created = await createContentFolder(root, "素材选择", new Date(2026, 7, 15));
    await mkdir(join(created.folderPath, "公众号文章"));
    await writeFile(join(created.folderPath, "take-a.mp4"), "a");
    await writeFile(join(created.folderPath, "take-b.mov"), "b");
    await writeFile(join(created.folderPath, "voice.srt"), "字幕");
    await writeFile(join(created.folderPath, "cover.jpg"), "cover");
    await writeFile(join(created.folderPath, "公众号文章", "article.md"), "# 正文");
    await writeFile(join(created.folderPath, DISTRIBUTION_PACKAGE_NAME), JSON.stringify({
      schemaVersion: 2,
      id: created.id,
      mode: "video",
      createdAt: "2026-08-21T12:00:00.000Z",
      sourceDigest: distributionSourceDigest(""),
      selection: { mode: "video", videoPath: join(created.folderPath, "take-a.mp4") },
      variants: {
        bilibili: { title: "标题", summary: "摘要", body: "正文", tags: ["AI"] },
      },
    }));

    const [item] = await scanLibrary(root, emptyOverlay());

    expect(item?.assets.videos.map((asset) => asset.name)).toEqual(["take-a.mp4", "take-b.mov"]);
    expect(item?.assets.subtitles.map((asset) => asset.name)).toEqual(["voice.srt"]);
    expect(item?.assets.articles.map((asset) => asset.name)).toEqual(["article.md"]);
    expect(item?.assets.covers.map((asset) => asset.name)).toEqual(["cover.jpg"]);
    expect(item?.hasDistributionPackage).toBe(true);
    expect(item?.pipeline).toBe("packaged");
  });

  it("将普通封面文件作为侧栏缩略图来源", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-sidebar-cover-"));
    const created = await createContentFolder(root, "侧栏封面", new Date(2026, 7, 15));
    await writeFile(join(created.folderPath, "cover.jpg"), "cover");

    const [item] = await scanLibrary(root, emptyOverlay());

    expect(item).toBeDefined();
    expect(item?.assets.covers).toEqual([{
      name: "cover.jpg",
      path: join(created.folderPath, "cover.jpg"),
    }]);
    expect(coverPathOf(item!)).toBe(join(created.folderPath, "cover.jpg"));
  });

  it("图文使用脚本素材且远端草稿已保存时标记为已完成", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-article-draft-status-"));
    const created = await createContentFolder(
      root,
      "脚本转图文",
      new Date(2026, 7, 20),
      "article",
    );
    const scriptPath = join(created.folderPath, "script.md");
    const coverPath = join(created.folderPath, "cover.png");
    await writeFile(scriptPath, "# 正文\n");
    await writeFile(coverPath, "cover");
    await writeFile(join(created.folderPath, DISTRIBUTION_PACKAGE_NAME), JSON.stringify({
      schemaVersion: 2,
      id: created.id,
      mode: "article",
      createdAt: "2026-08-20T12:00:00.000Z",
      sourceDigest: distributionSourceDigest("# 正文"),
      selection: { mode: "article", articlePath: scriptPath, coverPath },
      variants: {
        baijiahao: { title: "标题", summary: "摘要", body: "正文", tags: ["AI"] },
      },
    }));
    const overlay = emptyOverlay();
    overlay.items[created.id] = {
      publish: {
        baijiahao: {
          status: "draft",
          url: "https://baijiahao.baidu.com/builder/rc/edit?article_id=1",
          remoteId: "1",
        },
      },
    };

    const [item] = await scanLibrary(root, overlay);

    expect(item?.hasArticle).toBe(false);
    expect(item?.assets.articles.map((asset) => asset.name)).toContain("script.md");
    expect(item?.publish.baijiahao.status).toBe("draft");
    expect(item?.workflow).toBe("live");
  });
});

describe("script.md", () => {
  it("writes and clears the spoken script", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-script-"));
    const created = await createContentFolder(root, "脚本测试", new Date(2026, 7, 15));
    await writeScript(created.folderPath, "先讲问题，再演示。");
    expect(await readScript(created.folderPath)).toBe("先讲问题，再演示。\n");
    await writeScript(created.folderPath, "");
    expect(await readScript(created.folderPath)).toBe("");
  });
});

describe("folderDateAndTitle", () => {
  it("splits a dated folder name", () => {
    expect(folderDateAndTitle("2026-01-23_猹杀-opencreator")).toEqual({
      date: "2026-01-23",
      title: "猹杀-opencreator",
    });
  });

  it("keeps a free title", () => {
    expect(folderDateAndTitle("DeepSeek Harness")).toEqual({
      title: "DeepSeek Harness",
    });
  });
});

describe("pipeline and filters", () => {
  const base = {
    id: "a",
    folderPath: "/a",
    title: "A",
    recordedAt: 1,
    createdMs: 1,
    covers: {},
    subtitles: {},
    assets: { videos: [], subtitles: [], articles: [], covers: [] },
    hasPublishPackage: false,
    hasDistributionPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: ["AI"],
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
  };

  it("只从发布包、视频和草稿状态推导简化流程", () => {
    expect(workflowOf(base)).toBe("idle");
    expect(workflowOf(base, { readyToRecord: true })).toBe("idle");
    expect(workflowOf({ ...base, studioPath: "/p.screenstudio" })).toBe("idle");
    expect(workflowOf({ ...base, videoRaw: "/a.mp4" })).toBe("idle");
    expect(workflowOf({
      ...base,
      videoRaw: "/a.mp4",
      hasPublishPackage: true,
    })).toBe("publish");
    expect(workflowOf({
      ...base,
      hasArticle: true,
      articlePath: "/article.md",
      hasDistributionPackage: true,
    })).toBe("idle");
    expect(workflowOf({
      ...base,
      hasArticle: true,
      articlePath: "/article.md",
      assets: {
        ...base.assets,
        covers: [{ name: "cover.jpg", path: "/cover.jpg" }],
      },
      hasDistributionPackage: true,
    })).toBe("publish");
    expect(workflowOf({
      ...base,
      videoRaw: "/a.mp4",
      publish: {
        ...emptyPublish(),
        xiaohongshu: { status: "published", source: "sync" },
      },
    })).toBe("live");
  });

  it("文章缺少必选封面时不被历史远端状态标绿", () => {
    expect(workflowOf({
      ...base,
      hasArticle: true,
      articlePath: "/article.md",
      publish: {
        ...emptyPublish(),
        "wechat-mp": { status: "draft", source: "overlay" },
      },
    })).toBe("idle");
  });

  it("derives pipeline from files", () => {
    expect(pipelineOf(base)).toBe("raw");
    expect(pipelineOf({ ...base, subtitles: { srt: "/a.srt" } })).toBe("subtitled");
    expect(pipelineOf({ ...base, covers: { "3x4": "/a.png" } })).toBe("covered");
    expect(pipelineOf({
      ...base,
      assets: {
        ...base.assets,
        covers: [{ name: "cover.jpg", path: "/cover.jpg" }],
      },
    })).toBe("covered");
    expect(pipelineOf({ ...base, hasPublishPackage: true })).toBe("packaged");
  });

  it("filters and searches", () => {
    const item = {
      ...base,
      pipeline: "covered" as const,
      workflow: "finish" as const,
      covers: { "3x4": "/a.png" },
      title: "Harness 安装",
    };
    expect(matchesFilter(item, "cover")).toBe(true);
    expect(matchesFilter(item, "article")).toBe(false);
    expect(matchesQuery(item, "harness")).toBe(true);
    expect(matchesQuery(item, "zzz")).toBe(false);
    expect(countsOf([item]).cover).toBe(1);
  });
});

describe("subtitle text", () => {
  it("reads ass dialogue lines", () => {
    const raw = [
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,0:00:00.72,0:00:05.86,Default,,0,0,0,,Hello 大家好,\\N这期视频我",
      "Dialogue: 0,0:01:08.00,0:01:10.00,Default,,0,0,0,,{\\an2}下一句",
    ].join("\n");
    expect(cuesFromAss(raw)).toEqual([
      { text: "Hello 大家好,\n这期视频我", at: "0:00" },
      { text: "下一句", at: "1:08" },
    ]);
  });

  it("skips ass drawing and progress-bar events", () => {
    const raw = [
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 1,0:00:00.00,0:00:01.00,CaptionBox,ProgressFill,0,0,0,,{\\an7\\p1}m 0 0 l 12 0 l 12 6 l 0 6",
      "Dialogue: 5,0:00:00.12,0:00:00.56,CaptionText,,0,0,0,,哈喽大家好",
    ].join("\n");
    expect(cuesFromAss(raw)).toEqual([{ text: "哈喽大家好", at: "0:00" }]);
  });

  it("strips srt chrome", () => {
    const raw = "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界\n";
    expect(stripSubtitleMarkup(raw)).toBe("你好\n世界");
  });

  it("reads transcript segments", () => {
    expect(transcriptPlainText({
      segments: [{ text: "  甲  " }, { text: "乙" }],
    })).toBe("甲\n乙");
  });

  it("reads a bare transcript array", () => {
    expect(cuesFromTranscript([
      { start: 0.12, text: "哈喽大家好" },
      { start: 61, text: "下一句" },
    ])).toEqual([
      { text: "哈喽大家好", at: "0:00" },
      { text: "下一句", at: "1:01" },
    ]);
  });
});

describe("recordedAt precedence", () => {
  it("keeps the name date even when the folder is touched later", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-new-"));
    const created = await createContentFolder(root, "刚建的内容", new Date(2026, 7, 16));
    await utimes(created.folderPath, new Date(2026, 7, 18, 14, 40), new Date(2026, 7, 18, 14, 40));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.recordedAt).toBe(new Date(2026, 7, 16).getTime());
  });

  it("keeps the planned name date for an old topic folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-old-"));
    const folder = join(root, "2026-09-01_future topic");
    await mkdir(folder);
    await utimes(folder, new Date(2026, 7, 16, 14, 40), new Date(2026, 7, 16, 14, 40));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.recordedAt).toBe(new Date(2026, 8, 1).getTime());
  });

  it("ignores video mtime: re-exporting must not move the episode", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-vid-"));
    const created = await createContentFolder(root, "有成片", new Date(2026, 7, 16));
    const video = join(created.folderPath, "final.mp4");
    await writeFile(video, "x");
    // Simulate a re-export days later: the video mtime jumps forward.
    await utimes(video, new Date(2026, 7, 18, 10, 0), new Date(2026, 7, 18, 10, 0));
    await utimes(created.folderPath, new Date(2026, 7, 18, 14, 40), new Date(2026, 7, 18, 14, 40));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.recordedAt).toBe(new Date(2026, 7, 16).getTime());
  });
});

describe("folderDateMs", () => {
  it("parses a local calendar day", () => {
    expect(folderDateMs("2026-06-27")).toBe(new Date(2026, 5, 27).getTime());
    expect(folderDateMs(undefined)).toBeUndefined();
  });
});

describe("scanLibrary", () => {
  it("旧工程文件不会改变简化后的内容流程", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-openscreen-"));
    const folder = join(root, "2026-08-20_demo");
    const projectPath = join(folder, "demo.openscreen");
    await mkdir(folder);
    await writeFile(projectPath, "{}\n");

    const items = await scanLibrary(root, emptyOverlay());

    expect(items[0]?.studioPath).toBe(projectPath);
    expect(items[0]?.workflow).toBe("idle");
  });

  it("reads one content folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-creator-"));
    const folder = join(root, "2026-01-23_demo");
    await mkdir(folder);
    await writeFile(join(folder, "2026-01-23_demo_3x4.png"), "x");
    await writeFile(join(folder, "2026-01-23_demo_subtitled.srt"), "1\n00:00:00,000 --> 00:00:01,000\nhi\n");
    await writeFile(join(folder, "publish-package.json"), JSON.stringify({
      title: "Demo title",
      xhsTopics: ["AI"],
    }));

    const items = await scanLibrary(root, emptyOverlay());
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("demo");
    expect(items[0]?.date).toBe("2026-01-23");
    expect(items[0]?.recordedAt).toBeGreaterThan(0);
    expect(items[0]?.hasPublishPackage).toBe(true);
    expect(items[0]?.pipeline).toBe("packaged");
    expect(items[0]?.covers["3x4"]?.endsWith("_3x4.png")).toBe(true);
    expect(items[0]?.publish.xiaohongshu.status).toBe("unpublished");
    expect(items[0]?.burn.status).toBe("idle");
    expect(items[0]?.tags).toEqual(["AI"]);
  });

  it("sorts by recordedAt: the name date decides, not the last touch", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-sort-"));
    const older = join(root, "2026-06-27_old video");
    const newer = join(root, "2026-08-15_new video");
    await mkdir(older);
    await mkdir(newer);
    // Both were touched in July; the name date still decides the order.
    await utimes(older, new Date(2026, 6, 1), new Date(2026, 6, 1));
    await utimes(newer, new Date(2026, 6, 2), new Date(2026, 6, 2));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items.map((item) => item.id)).toEqual([
      "2026-08-15_new video",
      "2026-06-27_old video",
    ]);
  });

  it("breaks same-date ties by folder creation time", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-tie-"));
    await mkdir(join(root, "2026-08-18_先做的一期"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await mkdir(join(root, "2026-08-18_后做的一期"));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items.map((item) => item.id)).toEqual([
      "2026-08-18_后做的一期",
      "2026-08-18_先做的一期",
    ]);
  });

  it("reads an article from 公众号文章", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-art-"));
    const folder = join(root, "2026-04-06_demo");
    await mkdir(join(folder, "公众号文章"), { recursive: true });
    await writeFile(join(folder, "公众号文章", "一篇文章.md"), "# hello\n");
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.hasArticle).toBe(true);
    expect(items[0]?.articlePath?.endsWith("一篇文章.md")).toBe(true);
    expect(matchesFilter(items[0]!, "article")).toBe(true);
    expect(countsOf(items).article).toBe(1);
  });

  it("识别内容文件夹根目录中的 HTML 文章，但忽略脚本和选题", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-html-"));
    const folder = join(root, "2026-04-07_html");
    await mkdir(folder);
    await writeFile(join(folder, "script.md"), "# script\n");
    await writeFile(join(folder, "topic.md"), "# topic\n");
    await writeFile(join(folder, "article.html"), "<h1>hello</h1>\n");

    const items = await scanLibrary(root, emptyOverlay());

    expect(items[0]?.hasArticle).toBe(true);
    expect(items[0]?.articlePath?.endsWith("article.html")).toBe(true);
  });

  it("reads publisher draft status from auto-publish.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-pub-"));
    const folder = join(root, "2026-08-13_demo");
    await mkdir(folder);
    await writeFile(join(folder, "demo.auto-publish.json"), JSON.stringify({
      publisher: {
        platforms: {
          xiaohongshu: { status: "ready" },
          douyin: { status: "blocked" },
          wechat_channels: { status: "published" },
        },
      },
    }));
    const items = await scanLibrary(root, emptyOverlay());
    expect(items[0]?.publish.xiaohongshu).toEqual({
      status: "unpublished",
      source: "publisher",
      draftState: "ready",
    });
    expect(items[0]?.publish.douyin.status).toBe("unpublished");
    expect(items[0]?.publish.channels).toEqual({ status: "published", source: "publisher" });
  });

  it("lets overlay publish status win", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-ov-"));
    const folder = join(root, "2026-08-13_demo");
    await mkdir(folder);
    await writeFile(join(folder, "demo.auto-publish.json"), JSON.stringify({
      publisher: { platforms: { xiaohongshu: { status: "ready" } } },
    }));
    const overlay = emptyOverlay();
    overlay.items["2026-08-13_demo"] = {
      publish: { xiaohongshu: { status: "published", url: "https://example.com/xhs" } },
    };
    const items = await scanLibrary(root, overlay);
    expect(items[0]?.publish.xiaohongshu).toEqual({
      status: "published",
      source: "overlay",
      url: "https://example.com/xhs",
    });
  });

  it("reads srt even when the work transcript is a bare array", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-sub-"));
    const folder = join(root, "2026-08-13_demo");
    const work = join(folder, "demo.subtitle-work");
    await mkdir(work, { recursive: true });
    await writeFile(join(work, "transcript.json"), JSON.stringify([
      { start: 0.12, text: "哈喽大家好" },
    ]));
    await writeFile(
      join(folder, "demo_subtitled.srt"),
      "1\n00:00:00,120 --> 00:00:00,560\n哈喽大家好\n",
    );
    const items = await scanLibrary(root, emptyOverlay());
    const item = items[0];
    expect(item).toBeDefined();
    if (item === undefined) return;
    const cues = await readSubtitleCues(item);
    expect(cues[0]?.text).toBe("哈喽大家好");
    expect(cues[0]?.at).toBe("0:00");
  });

  it("lists newer recordings first", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-oil-creator-"));
    const older = join(root, "2026-01-01_old");
    const newer = join(root, "2026-08-01_new");
    await mkdir(older);
    await mkdir(newer);
    await writeFile(join(older, "old.mp4"), "old");
    await writeFile(join(newer, "new.mp4"), "new");
    const { utimes } = await import("node:fs/promises");
    await utimes(join(older, "old.mp4"), 1_700_000_000, 1_700_000_000);
    await utimes(join(newer, "new.mp4"), 1_780_000_000, 1_780_000_000);

    const items = await scanLibrary(root, emptyOverlay());
    expect(items.map((item) => item.id)).toEqual(["2026-08-01_new", "2026-01-01_old"]);
  });
});
