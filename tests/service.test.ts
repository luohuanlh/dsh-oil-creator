import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const draft = vi.hoisted(() => ({
  prepare: vi.fn(async (_item, _dataDir, platforms) => ({
    packagePath: "/tmp/package.json",
    platforms: [...platforms],
    runnerPlatforms: [...platforms],
  })),
  start: vi.fn(),
  finish: undefined as undefined | ((result: MockVideoCompletion) => void),
  finishes: [] as Array<(result: MockVideoCompletion) => void>,
}));

const articleDraft = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ input: { platform: "wechat-mp" } })),
  start: vi.fn(),
  finish: undefined as undefined | ((result: { ok: true; url: string; remoteId: string; taskSpace: string } | { ok: false; error: string }) => void),
}));

vi.mock("../src/draftRunner.ts", () => ({
  prepareDraftRun: draft.prepare,
  startVideoDraftRun: draft.start,
}));

vi.mock("../src/articleDraftRunner.ts", () => ({
  prepareArticleDraftRun: articleDraft.prepare,
  startArticleDraftRun: articleDraft.start,
}));

import { OilCreatorService } from "../src/service.ts";
import { emptyOverlay, loadOverlay, saveOverlay } from "../src/overlay.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import { DISTRIBUTION_PACKAGE_NAME } from "../src/distribution.ts";
import type { ContentSummary } from "../src/types.ts";

type MockVideoOutcome =
  | { ok: true; url: string; remoteId: string; taskSpace: string }
  | { ok: true; staged: true; taskSpace: string }
  | { ok: false; error: string };

type MockVideoCompletion = MockVideoOutcome | {
  ok: true;
  results: Record<string, MockVideoOutcome>;
};

function summary(folderPath: string, videoPath: string): ContentSummary {
  return {
    id: "2026-08-21_demo",
    folderPath,
    title: "Demo",
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
    hasPublishPackage: true,
    hasDistributionPackage: false,
    hasArticle: false,
    waitingForExport: false,
    tags: ["demo"],
    pipeline: "packaged",
    workflow: "publish",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
  };
}

function probe(dataDir: string, item: ContentSummary): OilCreatorService {
  const service = Object.create(OilCreatorService.prototype) as OilCreatorService;
  Object.assign(service, {
    dataDir,
    libraryRoot: item.folderPath,
    cache: undefined,
    catalogRevision: 0,
    videos: new Map(),
    articles: new Map(),
    assetUploads: new Set(),
    draftStarts: new Set(),
    find: vi.fn(async () => item),
    invalidateCatalog: vi.fn(),
  });
  return service;
}

beforeEach(() => {
  draft.prepare.mockClear();
  draft.start.mockReset();
  draft.finish = undefined;
  draft.finishes = [];
  draft.start.mockImplementation(async () => {
    const completion = new Promise<MockVideoCompletion>((resolve) => {
      draft.finish = resolve;
      draft.finishes.push(resolve);
    });
    return { pid: 43210, completion };
  });
  articleDraft.prepare.mockClear();
  articleDraft.start.mockReset();
  articleDraft.finish = undefined;
  articleDraft.start.mockImplementation(async () => {
    const completion = new Promise<
      { ok: true; url: string; remoteId: string; taskSpace: string } | { ok: false; error: string }
    >((resolve) => { articleDraft.finish = resolve; });
    return { pid: 54321, completion };
  });
});

describe("OilCreatorService.startDrafts", () => {
  it("记录运行中状态并在运行器完成后标为草稿", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-draft-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili"] };
    overlay.accounts = { bilibili: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili"] },
      new AbortController().signal,
    );

    expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.bilibili)
      .toMatchObject({ status: "unpublished", draftState: "running", draftPid: 43210 });

    draft.finish?.({
      ok: true,
      url: "https://member.bilibili.com/draft/42",
      remoteId: "42",
      taskSpace: "7",
    });
    await vi.waitFor(async () => {
      expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.bilibili)
        .toMatchObject({ status: "draft" });
    });
    expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.bilibili?.draftState)
      .toBeUndefined();
  });

  it("平台只达到页面 READY 时不伪装成远端草稿", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-staged-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["douyin"] };
    overlay.accounts = { douyin: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["douyin"] },
      new AbortController().signal,
    );
    draft.finish?.({ ok: true, staged: true, taskSpace: "13" });

    await vi.waitFor(async () => {
      expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.douyin)
        .toMatchObject({ status: "unpublished", draftState: "ready" });
    });
  });

  it("运行器缺少远端 ID 或回读 URL 时拒绝标记为草稿", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-unverified-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili"] };
    overlay.accounts = { bilibili: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili"] },
      new AbortController().signal,
    );
    (draft.finish as unknown as ((result: { ok: true }) => void) | undefined)?.({ ok: true });

    await vi.waitFor(async () => {
      expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.bilibili)
        .toMatchObject({
          status: "unpublished",
          draftState: "error",
          draftError: expect.stringContaining("远端 ID"),
        });
    });
  });

  it("拒绝未启用的平台", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-draft-"));
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili"] };
    overlay.accounts = { bilibili: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, join(root, "demo.mp4")));

    await expect(service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["douyin"] },
      new AbortController().signal,
    )).rejects.toThrow("平台尚未在设置中启用");
    expect(draft.prepare).not.toHaveBeenCalled();
  });

  it("拒绝尚未通过登录检查的平台", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-draft-"));
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili"] };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, join(root, "demo.mp4")));

    await expect(service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili"] },
      new AbortController().signal,
    )).rejects.toThrow("账号尚未通过登录检查");
    expect(draft.prepare).not.toHaveBeenCalled();
  });

  it("拒绝空的平台列表", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-draft-"));
    const service = probe(root, summary(root, join(root, "demo.mp4")));
    await expect(service.startDrafts(
      { id: "2026-08-21_demo", platforms: [] },
      new AbortController().signal,
    )).rejects.toThrow("至少选择一个");
  });

  it("并发请求只允许同一平台启动一个运行器", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-start-lock-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili"] };
    overlay.accounts = { bilibili: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));
    let releaseStart: (() => void) | undefined;
    draft.start.mockImplementationOnce(() => new Promise((resolve) => {
      releaseStart = () => {
        resolve({
          pid: 43210,
          completion: new Promise(() => undefined),
        });
      };
    }));

    const first = service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili"] },
      new AbortController().signal,
    );
    await vi.waitFor(() => { expect(draft.start).toHaveBeenCalledTimes(1); });
    await expect(service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili"] },
      new AbortController().signal,
    )).resolves.toMatchObject({ started: false });
    releaseStart?.();
    await first;
    expect(draft.start).toHaveBeenCalledTimes(1);
  });

  it("单个 publisher 调度多平台并隔离成功与失败状态", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-isolation-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["bilibili", "douyin"] };
    overlay.accounts = {
      bilibili: { status: "active", checkedAt: 1 },
      douyin: { status: "active", checkedAt: 1 },
    };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["bilibili", "douyin"] },
      new AbortController().signal,
    );

    expect(draft.prepare.mock.calls.map((call) => call[2])).toEqual([["bilibili", "douyin"]]);
    expect(draft.start).toHaveBeenCalledTimes(1);
    draft.finishes[0]?.({
      ok: true,
      results: {
        bilibili: {
          ok: true,
          url: "https://member.bilibili.com/draft/42",
          remoteId: "42",
          taskSpace: "7",
        },
        douyin: { ok: false, error: "抖音页面失败" },
      },
    });
    await vi.waitFor(async () => {
      const saved = await loadOverlay(root);
      expect(saved.items["2026-08-21_demo"]?.publish?.bilibili?.status).toBe("draft");
      expect(saved.items["2026-08-21_demo"]?.publish?.douyin)
        .toMatchObject({ status: "unpublished", draftState: "error", draftError: "抖音页面失败" });
    });
  });

  it("五个视频平台共享一个 publisher 作业", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-five-platforms-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const platforms = [
      "bilibili",
      "douyin",
      "xiaohongshu",
      "channels",
      "kuaishou",
    ] as const;
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: [...platforms] };
    overlay.accounts = Object.fromEntries(platforms.map((platform) => [
      platform,
      { status: "active" as const, checkedAt: 1 },
    ]));
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, video));

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: [...platforms] },
      new AbortController().signal,
    );

    expect(draft.prepare.mock.calls.map((call) => call[2])).toEqual([[...platforms]]);
    expect(draft.start).toHaveBeenCalledTimes(1);
    draft.finishes[0]?.({
      ok: true,
      results: {
        bilibili: { ok: true, url: "https://bilibili/draft/1", remoteId: "1", taskSpace: "1" },
        douyin: { ok: true, url: "https://douyin/draft/2", remoteId: "2", taskSpace: "2" },
        xiaohongshu: { ok: true, staged: true, taskSpace: "3" },
        channels: { ok: true, staged: true, taskSpace: "4" },
        kuaishou: { ok: true, url: "https://kuaishou/draft/5", remoteId: "5", taskSpace: "5" },
      },
    });
    await vi.waitFor(async () => {
      const saved = await loadOverlay(root);
      expect(saved.items["2026-08-21_demo"]?.publish?.bilibili?.status).toBe("draft");
      expect(saved.items["2026-08-21_demo"]?.publish?.douyin?.status).toBe("draft");
      expect(saved.items["2026-08-21_demo"]?.publish?.xiaohongshu?.draftState).toBe("ready");
      expect(saved.items["2026-08-21_demo"]?.publish?.channels?.draftState).toBe("ready");
      expect(saved.items["2026-08-21_demo"]?.publish?.kuaishou?.status).toBe("draft");
    });
  });

  it("文章冻结包交给微信公众号 Ego 适配器", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-article-"));
    const article = join(root, "article.md");
    const cover = join(root, "cover.png");
    await writeFile(article, "# 文章");
    await writeFile(cover, "cover");
    const overlay = emptyOverlay();
    overlay.profile = { enabledPlatforms: ["wechat-mp"] };
    overlay.accounts = { "wechat-mp": { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const { videoRaw: _videoRaw, ...articleBase } = summary(root, join(root, "missing.mp4"));
    const content: ContentSummary = {
      ...articleBase,
      assets: {
        videos: [],
        subtitles: [],
        articles: [{ name: "article.md", path: article }],
        covers: [{ name: "cover.png", path: cover }],
      },
      hasArticle: true,
      articlePath: article,
    };
    const service = probe(root, content);

    await service.startDrafts(
      { id: "2026-08-21_demo", platforms: ["wechat-mp"] },
      new AbortController().signal,
    );

    expect(articleDraft.prepare).toHaveBeenCalledWith(content, "wechat-mp");
    expect(articleDraft.start).toHaveBeenCalledTimes(1);
    articleDraft.finish?.({
      ok: true,
      url: "https://mp.weixin.qq.com/draft/42",
      remoteId: "42",
      taskSpace: "7",
    });
    await vi.waitFor(async () => {
      expect((await loadOverlay(root)).items["2026-08-21_demo"]?.publish?.["wechat-mp"])
        .toMatchObject({ status: "draft", url: "https://mp.weixin.qq.com/draft/42", remoteId: "42" });
    });
  });
});

describe("OilCreatorService.getPlatformAccounts", () => {
  it("始终返回 24 个平台并区分草稿支持", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-accounts-"));
    const overlay = emptyOverlay();
    overlay.accounts = { zhihu: { status: "active", checkedAt: 1 } };
    await saveOverlay(root, overlay);
    const service = probe(root, summary(root, join(root, "demo.mp4")));

    const result = await service.getPlatformAccounts({}, new AbortController().signal);
    expect(result.accounts).toHaveLength(24);
    expect(result.accounts.find((row) => row.platform === "zhihu"))
      .toMatchObject({ status: "active", supportsAutoDraft: false });
    expect(result.accounts.find((row) => row.platform === "bilibili")?.supportsAutoDraft)
      .toBe(true);
    expect(result.accounts.find((row) => row.platform === "netease-music"))
      .toMatchObject({ status: "unknown", supportsAutoDraft: false });
    expect(result.accounts.find((row) => row.platform === "ximalaya"))
      .toMatchObject({ status: "unknown", supportsAutoDraft: false });
  });
});

describe("OilCreatorService Harness distribution", () => {
  it("为视频创建一次性上传地址并在完成后刷新目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-upload-"));
    const service = probe(root, summary(root, join(root, "missing.mp4")));
    const bytes = new TextEncoder().encode("streamed-video");

    const prepared = await service.prepareAssetUpload({
      id: "2026-08-21_demo",
      kind: "video",
      name: "selected.mp4",
      mimeType: "video/mp4",
      size: bytes.byteLength,
    }, new AbortController().signal);
    const response = await fetch(prepared.url, { method: "PUT", body: bytes });

    expect(response.status).toBe(201);
    expect(await readFile(join(root, "selected.mp4"), "utf8")).toBe("streamed-video");
    expect(service.invalidateCatalog).toHaveBeenCalled();
    expect(service.assetUploads.size).toBe(0);
  });

  it("预览严格使用工作台当前选择的素材并拒绝目录外路径", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-preview-"));
    const defaultVideo = join(root, "default.mp4");
    const selectedVideo = join(root, "selected.mov");
    const defaultArticle = join(root, "default.md");
    const selectedArticle = join(root, "selected.md");
    const outsideArticle = join(await mkdtemp(join(tmpdir(), "oil-preview-outside-")), "outside.md");
    await Promise.all([
      writeFile(defaultVideo, "default-video"),
      writeFile(selectedVideo, "selected-video"),
      writeFile(defaultArticle, "# 默认文章"),
      writeFile(selectedArticle, "# 当前选择文章"),
      writeFile(outsideArticle, "# 目录外文章"),
    ]);
    const item = summary(root, defaultVideo);
    item.articlePath = defaultArticle;
    item.assets.videos.push({ name: "selected.mov", path: selectedVideo });
    item.assets.articles = [
      { name: "default.md", path: defaultArticle },
      { name: "selected.md", path: selectedArticle },
    ];
    const service = probe(root, item);

    const video = await service.getVideoPlayback(
      { id: item.id, path: selectedVideo },
      new AbortController().signal,
    );
    const article = await service.getArticleMedia(
      { id: item.id, path: selectedArticle },
      new AbortController().signal,
    );

    expect(video).toMatchObject({ found: true, kind: "raw" });
    expect(article).toMatchObject({ found: true, text: "# 当前选择文章" });
    await expect(service.getArticleMedia(
      { id: item.id, path: outsideArticle },
      new AbortController().signal,
    )).rejects.toThrow("不属于当前内容文件夹");
    await service.stopServers();
  });

  it("把所选字幕和平台约束交给 Harness AI", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-source-"));
    const video = join(root, "demo.mp4");
    const subtitle = join(root, "demo.srt");
    await writeFile(video, "video");
    await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:01,000\n你好 Harness\n");
    const service = probe(root, summary(root, video));

    const result = await service.getDistributionSource({
      id: "2026-08-21_demo",
      selection: { mode: "video", videoPath: video, subtitlePath: subtitle },
      platforms: ["bilibili", "douyin"],
    }, new AbortController().signal);

    expect(result.sourceText).toContain("你好 Harness");
    expect(result.platforms).toEqual([
      expect.objectContaining({ platform: "bilibili", titleMax: 80, tagsMax: 10 }),
      expect.objectContaining({ platform: "douyin", titleMax: 30, tagsMax: 5 }),
    ]);
  });

  it("提交 AI 平台变体后原子写入冻结包", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-service-commit-"));
    const video = join(root, "demo.mp4");
    await writeFile(video, "video");
    const service = probe(root, summary(root, video));

    const result = await service.commitDistribution({
      id: "2026-08-21_demo",
      selection: { mode: "video", videoPath: video },
      variants: [
        { platform: "bilibili", title: "B站标题", summary: "摘要", body: "简介", tags: ["AI"] },
      ],
    }, new AbortController().signal);

    expect(result).toMatchObject({ id: "2026-08-21_demo", mode: "video", platforms: ["bilibili"] });
    expect(JSON.parse(await readFile(join(root, DISTRIBUTION_PACKAGE_NAME), "utf8")))
      .toMatchObject({ variants: { bilibili: { title: "B站标题", body: "简介" } } });
  });
});
