import { mkdirSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import {
  applyCatalogOverlay,
  countsOf,
  coverPathOf,
  createContentFolder,
  matchesFilter,
  matchesQuery,
  readArticle,
  readPublishCopy,
  readScript,
  readTopicNote,
  scanLibrary,
} from "./catalog.ts";
import { inspectCreatorSetup } from "./capabilities.ts";
import { BoundedTaskQueue } from "./boundedTaskQueue.ts";
import { expandHomePath, resolveDataDir, type Config } from "./config.ts";
import { importContentAsset } from "./assetImport.ts";
import { startAssetUploadServer } from "./assetUpload.ts";
import {
  articleImageUploadTarget,
  readArticleDocument,
  saveArticleDocument,
} from "./articleDocument.ts";
import {
  prepareDraftRun,
  startVideoDraftRun,
  type VideoDraftOutcome,
} from "./draftRunner.ts";
import { prepareArticleDraftRun, startArticleDraftRun } from "./articleDraftRunner.ts";
import {
  freezeDistributionPackage,
  readDistributionSource,
  validateLocalContentAsset,
} from "./distribution.ts";
import { creatorGuideText } from "./guide.ts";
import { startLibraryWatch } from "./libraryWatch.ts";
import {
  accountsFromOverlay,
  emptyOverlay,
  emptyProfile,
  loadOverlay,
  normalizeEnabledPlatforms,
  overlayPath,
  saveOverlay,
  withOverlayLock,
} from "./overlay.ts";
import { checkPlatformAccount, openPlatformAccount } from "./platformAccounts.ts";
import {
  draftCapability,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
  platformGenerationRule,
  SHARED_PLATFORM_GENERATION_RULES,
  supportsAutoDraft,
  type PublishPlatform,
} from "./platforms.ts";
import { draftOutcomeRow, draftPendingRow, reconcileInterruptedDrafts } from "./draftState.ts";
import { pidAlive } from "./processAlive.ts";
import { coverThumb } from "./thumbs.ts";
import { startArticleServer } from "./articleServe.ts";
import { playbackOf, startVideoServer } from "./videoServe.ts";
import { movePathToTrash } from "./trash.ts";
import type {
  ArticleMediaResult,
  AssetPreviewRequest,
  ContentDetail,
  CommitDistributionRequest,
  CommitDistributionResult,
  CoverThumbResult,
  CreateContentRequest,
  CreateContentResult,
  CreatorCapabilities,
  CreatorGuideResult,
  CreatorSetupRequest,
  CreatorSetupResult,
  CreatorSetupStatus,
  DeleteContentResult,
  DistributionSourceRequest,
  DistributionSourceResult,
  IdRequest,
  ImportAssetRequest,
  ImportAssetResult,
  LibrarySettings,
  ListContentsRequest,
  ListContentsResult,
  OpenPlatformAccountResult,
  OverlayItem,
  OverlayPublish,
  OverlayStore,
  PlatformAccountRequest,
  PlatformAccountsResult,
  PrepareAssetUploadRequest,
  PrepareAssetUploadResult,
  PrepareArticleImageUploadRequest,
  PrepareArticleImageUploadResult,
  SaveArticleRequest,
  SaveArticleResult,
  SetLibraryRootRequest,
  SetProfileRequest,
  StartDraftsRequest,
  StartDraftsResult,
  VideoPlaybackResult,
} from "./types.ts";

export const OIL_CREATOR_SERVICE = "oilCreator";
export const ARTICLE_DRAFT_CONCURRENCY = 2;

export class OilCreatorService extends TypertRemoteService {
  // Gateway 会通过 Cordis proxy 调用方法，因此这里不用 #private 字段。
  libraryRoot: string;
  readonly dataDir: string;
  cache: { libraryRoot: string; items: ReturnType<typeof scanLibrary> } | undefined;
  cachedEnabledPlatforms: string[] | undefined;
  catalogRevision = 0;
  watchClose: (() => void) | undefined;
  watchedRoot: string | undefined;
  videos = new Map<string, { url: string; path: string; close: () => void }>();
  articles = new Map<string, { origin: string; root: string; close: () => void }>();
  assetUploads = new Set<() => void>();
  draftStarts = new Set<string>();
  articleDraftQueue: BoundedTaskQueue | undefined;

  constructor(ctx: Context, config: Config) {
    super(ctx, OIL_CREATOR_SERVICE);
    this.libraryRoot = resolveUserPath(config.libraryRoot);
    this.dataDir = resolveUserPath(resolveDataDir(config));
    void loadOverlay(this.dataDir).then((overlay) => { this.rememberOverlay(overlay); });
    ctx.effect(() => async () => {
      this.stopWatch();
      await this.stopServers();
    }, "oil-creator: library watch");
  }

  async stopServers(): Promise<void> {
    this.articleDraftQueue?.close(new Error("内容工作台已停止，排队中的图文草稿已取消"));
    this.articleDraftQueue = undefined;
    for (const session of this.videos.values()) session.close();
    this.videos.clear();
    for (const session of this.articles.values()) session.close();
    this.articles.clear();
    for (const close of this.assetUploads) close();
    this.assetUploads.clear();
  }

  invalidateCatalog(): void {
    this.cache = undefined;
    this.notifyCatalogChanged();
  }

  notifyCatalogChanged(): void {
    this.catalogRevision += 1;
  }

  enqueueArticleDraft(task: () => Promise<void>): Promise<void> {
    this.articleDraftQueue ??= new BoundedTaskQueue(ARTICLE_DRAFT_CONCURRENCY);
    return this.articleDraftQueue.enqueue(task);
  }

  stopWatch(): void {
    this.watchClose?.();
    this.watchClose = undefined;
    this.watchedRoot = undefined;
  }

  ensureWatch(libraryRoot: string): void {
    if (this.watchedRoot === libraryRoot && this.watchClose !== undefined) return;
    this.stopWatch();
    this.watchedRoot = libraryRoot;
    try {
      mkdirSync(this.dataDir, { recursive: true });
    } catch {
      // 已有目录仍可以被监视。
    }
    this.watchClose = startLibraryWatch({
      libraryRoot,
      overlayPath: overlayPath(this.dataDir),
      onChange: () => { this.invalidateCatalog(); },
      onOverlayChange: () => { this.notifyCatalogChanged(); },
    }).close;
  }

  async readCatalogOverlay(): Promise<OverlayStore> {
    return withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      if (reconcileInterruptedDrafts(overlay, this.draftStarts, pidAlive)) {
        await saveOverlay(this.dataDir, overlay);
        this.notifyCatalogChanged();
      }
      return overlay;
    });
  }

  async scanned() {
    for (;;) {
      const before = await this.readCatalogOverlay();
      const libraryRoot = before.libraryRoot ?? this.libraryRoot;
      this.ensureWatch(libraryRoot);
      // 并发读请求复用同一次磁盘扫描，扫描期间不占用状态文件锁。
      if (this.cache?.libraryRoot !== libraryRoot) {
        this.cache = { libraryRoot, items: scanLibrary(libraryRoot, emptyOverlay()) };
      }
      const cache = this.cache;
      let baseItems: Awaited<ReturnType<typeof scanLibrary>>;
      try {
        baseItems = await cache.items;
      } catch (cause) {
        if (this.cache === cache) this.cache = undefined;
        throw cause;
      }
      const overlay = await this.readCatalogOverlay();
      // 扫描期间素材变化或切换目录时，丢弃过期结果并读取新快照。
      if (this.cache !== cache || (overlay.libraryRoot ?? this.libraryRoot) !== libraryRoot) continue;
      this.rememberOverlay(overlay);
      return {
        overlay,
        libraryRoot,
        items: baseItems.map((item) => applyCatalogOverlay(item, overlay.items[item.id])),
      };
    }
  }

  async getRevision(
    _request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<{ revision: number }> {
    signal.throwIfAborted();
    if (this.watchClose === undefined) await this.scanned();
    return { revision: this.catalogRevision };
  }

  async listContents(
    request: ListContentsRequest,
    signal: AbortSignal,
  ): Promise<ListContentsResult> {
    signal.throwIfAborted();
    const { overlay, libraryRoot, items: scanned } = await this.scanned();
    return {
      settings: this.settingsOf(libraryRoot, overlay),
      items: scanned.filter((item) =>
        matchesFilter(item, request.filter) && matchesQuery(item, request.query)
      ),
      counts: countsOf(scanned),
      revision: this.catalogRevision,
    };
  }

  async getContent(request: IdRequest, signal: AbortSignal): Promise<ContentDetail> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    return {
      ...item,
      publishCopy: await readPublishCopy(item.folderPath),
      topicNote: await readTopicNote(item.folderPath),
      script: await readScript(item.folderPath),
      article: await readArticle(item.articlePath),
    };
  }

  async importAsset(
    request: ImportAssetRequest,
    signal: AbortSignal,
  ): Promise<ImportAssetResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const asset = await importContentAsset(item.folderPath, request);
    this.invalidateCatalog();
    return {
      asset,
      detail: await this.getContent({ id: request.id }, signal),
    };
  }

  async prepareAssetUpload(
    request: PrepareAssetUploadRequest,
    signal: AbortSignal,
  ): Promise<PrepareAssetUploadResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    let close: () => void = () => {};
    const upload = await startAssetUploadServer({
      folderPath: item.folderPath,
      kind: request.kind,
      name: request.name,
      expectedSize: request.size,
      onImported: () => { this.invalidateCatalog(); },
      onSettled: () => { this.assetUploads.delete(close); },
    });
    close = upload.close;
    this.assetUploads.add(close);
    return { url: upload.url };
  }

  async getCoverThumb(request: IdRequest, signal: AbortSignal): Promise<CoverThumbResult> {
    signal.throwIfAborted();
    const folderId = request.id.split("::")[0] ?? request.id;
    const ratio = request.id.split("::")[1];
    const item = await this.find(folderId);
    const path = ratio === "3x4" || ratio === "4x3" || ratio === "16x9"
      ? item?.covers[ratio]
      : item === undefined ? undefined : coverPathOf(item);
    return coverThumb(this.dataDir, request.id, path);
  }

  async getVideoPlayback(
    request: AssetPreviewRequest,
    signal: AbortSignal,
  ): Promise<VideoPlaybackResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) return { found: false, url: "", kind: "raw" };
    const path = await validateLocalContentAsset(item.folderPath, request.path, "video");
    const preferred = playbackOf(item);
    const picked = {
      path,
      kind: preferred?.kind === "subtitled" && preferred.path === path
        ? "subtitled" as const
        : "raw" as const,
    };
    const existing = this.videos.get(request.id);
    if (existing !== undefined && existing.path === picked.path) {
      return { found: true, url: existing.url, kind: picked.kind };
    }
    existing?.close();
    const session = await startVideoServer(picked.path);
    this.videos.set(request.id, { url: session.url, path: picked.path, close: session.close });
    return { found: true, url: session.url, kind: picked.kind };
  }

  async getArticleMedia(
    request: AssetPreviewRequest,
    signal: AbortSignal,
  ): Promise<ArticleMediaResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) {
      return { found: false, origin: "", text: "", revision: "", editable: false };
    }
    const document = await readArticleDocument(item.folderPath, request.path);
    const root = document.root;
    const existing = this.articles.get(request.id);
    if (existing !== undefined && existing.root === root) {
      return {
        found: true,
        origin: existing.origin,
        text: document.text,
        revision: document.revision,
        editable: document.editable,
        ...(document.previewHtml === undefined ? {} : { previewHtml: document.previewHtml }),
      };
    }
    existing?.close();
    const session = await startArticleServer(root);
    this.articles.set(request.id, { origin: session.origin, root, close: session.close });
    return {
      found: true,
      origin: session.origin,
      text: document.text,
      revision: document.revision,
      editable: document.editable,
      ...(document.previewHtml === undefined ? {} : { previewHtml: document.previewHtml }),
    };
  }

  async saveArticle(
    request: SaveArticleRequest,
    signal: AbortSignal,
  ): Promise<SaveArticleResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const saved = await saveArticleDocument(item.folderPath, request);
    this.invalidateCatalog();
    return saved;
  }

  async prepareArticleImageUpload(
    request: PrepareArticleImageUploadRequest,
    signal: AbortSignal,
  ): Promise<PrepareArticleImageUploadResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const target = await articleImageUploadTarget(
      item.folderPath,
      request.articlePath,
      request.name,
    );
    let close: () => void = () => {};
    const upload = await startAssetUploadServer({
      folderPath: target.folderPath,
      kind: "article-image",
      name: target.name,
      expectedSize: request.size,
      onImported: () => { this.invalidateCatalog(); },
      onSettled: () => { this.assetUploads.delete(close); },
    });
    close = upload.close;
    this.assetUploads.add(close);
    return { url: upload.url, markdownPrefix: target.markdownPrefix };
  }

  async getSettings(
    _request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<LibrarySettings> {
    signal.throwIfAborted();
    const overlay = await loadOverlay(this.dataDir);
    this.rememberOverlay(overlay);
    return this.settingsOf(overlay.libraryRoot ?? this.libraryRoot, overlay);
  }

  async setLibraryRoot(
    request: SetLibraryRootRequest,
    signal: AbortSignal,
  ): Promise<LibrarySettings> {
    signal.throwIfAborted();
    const libraryRoot = resolveUserPath(request.path);
    const info = await stat(libraryRoot).catch(() => undefined);
    if (info === undefined || !info.isDirectory()) {
      throw new Error(`library root is not a directory: ${libraryRoot}`);
    }
    return withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      overlay.libraryRoot = libraryRoot;
      await saveOverlay(this.dataDir, overlay);
      this.libraryRoot = libraryRoot;
      this.stopWatch();
      this.invalidateCatalog();
      return this.settingsOf(libraryRoot, overlay);
    });
  }

  async setProfile(request: SetProfileRequest, signal: AbortSignal): Promise<LibrarySettings> {
    signal.throwIfAborted();
    return withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      overlay.profile = {
        enabledPlatforms: normalizeEnabledPlatforms(request.profile.enabledPlatforms),
      };
      await saveOverlay(this.dataDir, overlay);
      this.rememberOverlay(overlay);
      this.notifyCatalogChanged();
      return this.settingsOf(overlay.libraryRoot ?? this.libraryRoot, overlay);
    });
  }

  async getCapabilities(
    _request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<{ capabilities: CreatorCapabilities }> {
    signal.throwIfAborted();
    return { capabilities: (await this.getCreatorSetupStatus(signal)).capabilities };
  }

  async getCreatorSetupStatus(signal: AbortSignal): Promise<CreatorSetupStatus> {
    signal.throwIfAborted();
    const settings = await this.getSettings({}, signal);
    return inspectCreatorSetup({
      libraryRoot: settings.libraryRoot,
      dataDir: this.dataDir,
      settings,
    });
  }

  async getCreatorGuide(signal: AbortSignal): Promise<CreatorGuideResult> {
    signal.throwIfAborted();
    const status = await this.getCreatorSetupStatus(signal);
    return { guide: creatorGuideText(status), status };
  }

  async configureCreator(
    request: CreatorSetupRequest,
    signal: AbortSignal,
  ): Promise<CreatorSetupResult> {
    signal.throwIfAborted();
    const proposal: CreatorSetupResult["proposal"] = {};
    if (request.libraryRoot !== undefined) proposal.libraryRoot = resolveUserPath(request.libraryRoot);
    if (request.enabledPlatforms !== undefined) {
      proposal.enabledPlatforms = normalizeEnabledPlatforms(request.enabledPlatforms);
    }
    if (!request.apply || Object.keys(proposal).length === 0) {
      return { applied: false, proposal, status: await this.getCreatorSetupStatus(signal) };
    }
    if (proposal.libraryRoot !== undefined) {
      const info = await stat(proposal.libraryRoot).catch(() => undefined);
      if (info === undefined || !info.isDirectory()) {
        throw new Error(`library root is not a directory: ${proposal.libraryRoot}`);
      }
    }
    await withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      if (proposal.libraryRoot !== undefined) overlay.libraryRoot = proposal.libraryRoot;
      const profile = overlay.profile ?? emptyProfile();
      if (proposal.enabledPlatforms !== undefined) {
        profile.enabledPlatforms = [...proposal.enabledPlatforms];
      }
      overlay.profile = profile;
      await saveOverlay(this.dataDir, overlay);
      this.rememberOverlay(overlay);
      if (proposal.libraryRoot !== undefined) {
        this.libraryRoot = proposal.libraryRoot;
        this.stopWatch();
      }
      this.invalidateCatalog();
    });
    return { applied: true, proposal, status: await this.getCreatorSetupStatus(signal) };
  }

  async getPlatformAccounts(
    _request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<PlatformAccountsResult> {
    signal.throwIfAborted();
    const overlay = await loadOverlay(this.dataDir);
    const stored = new Map(accountsFromOverlay(overlay).map((account) => [account.platform, account]));
    return {
      accounts: PUBLISH_PLATFORMS.map((platform) => stored.get(platform) ?? {
        platform,
        status: "unknown",
        supportsAutoDraft: supportsAutoDraft(platform),
        draftCapability: draftCapability(platform),
      }),
    };
  }

  async openPlatformAccount(
    request: PlatformAccountRequest,
    signal: AbortSignal,
  ): Promise<OpenPlatformAccountResult> {
    signal.throwIfAborted();
    const result = await openPlatformAccount(request.platform, signal);
    if (result.started) {
      await withOverlayLock(this.dataDir, async () => {
        const overlay = await loadOverlay(this.dataDir);
        overlay.accounts = { ...overlay.accounts };
        overlay.accounts[request.platform] = {
          status: "unknown",
          ...(result.taskSpace === undefined ? {} : { taskSpace: result.taskSpace }),
        };
        await saveOverlay(this.dataDir, overlay);
      });
    }
    return result;
  }

  async checkPlatformAccount(
    request: PlatformAccountRequest,
    signal: AbortSignal,
  ): Promise<PlatformAccountsResult> {
    signal.throwIfAborted();
    const before = await loadOverlay(this.dataDir);
    const taskSpace = before.accounts?.[request.platform]?.taskSpace;
    const status = await checkPlatformAccount(request.platform, signal, taskSpace);
    await withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      overlay.accounts = { ...overlay.accounts };
      overlay.accounts[request.platform] = { status, checkedAt: Date.now() };
      await saveOverlay(this.dataDir, overlay);
    });
    return this.getPlatformAccounts({}, signal);
  }

  async startDrafts(
    request: StartDraftsRequest,
    signal: AbortSignal,
  ): Promise<StartDraftsResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const overlay = await loadOverlay(this.dataDir);
    const enabled = overlay.profile?.enabledPlatforms ?? emptyProfile().enabledPlatforms;
    const platforms = [...new Set(request.platforms)];
    if (platforms.length === 0) throw new Error("至少选择一个自动草稿平台");
    const disabled = platforms.filter((platform) => !enabled.includes(platform));
    if (disabled.length > 0) {
      throw new Error(`平台尚未在设置中启用：${disabled.map((p) => PUBLISH_PLATFORM_DEFINITIONS[p].name).join("、")}`);
    }
    const unsupported = platforms.filter((platform) => !supportsAutoDraft(platform));
    if (unsupported.length > 0) {
      throw new Error(`尚未接入自动草稿：${unsupported.map((p) => PUBLISH_PLATFORM_DEFINITIONS[p].name).join("、")}`);
    }
    const articlePlatforms = platforms.filter((platform) =>
      PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner === "article-ego"
    );
    const inactive = platforms.filter((platform) => overlay.accounts?.[platform]?.status !== "active");
    if (inactive.length > 0) {
      throw new Error(`平台账号尚未通过登录检查：${inactive.map((p) => PUBLISH_PLATFORM_DEFINITIONS[p].name).join("、")}`);
    }
    const running = platforms.filter((platform) => {
      const row = item.publish[platform];
      return row.draftState === "running"
        && row.draftPid !== undefined
        && pidAlive(row.draftPid);
    });
    if (running.length === platforms.length) {
      return { id: item.id, platforms, started: false };
    }
    if (running.length > 0) {
      throw new Error(`部分平台已有草稿任务运行中：${running.map((p) => PUBLISH_PLATFORM_DEFINITIONS[p].name).join("、")}`);
    }
    const startKeys = platforms.map((platform) => `${item.id}:${platform}`);
    const starting = platforms.filter((_platform, index) => this.draftStarts.has(startKeys[index]!));
    if (starting.length === platforms.length) {
      return { id: item.id, platforms, started: false };
    }
    if (starting.length > 0) {
      throw new Error(`部分平台正在启动草稿任务：${starting.map((p) => PUBLISH_PLATFORM_DEFINITIONS[p].name).join("、")}`);
    }
    for (const key of startKeys) this.draftStarts.add(key);
    let started = false;
    const startErrors: string[] = [];
    const retainedStartKeys = new Set<string>();
    const applyOutcome = async (
      platform: PublishPlatform,
      result: VideoDraftOutcome,
    ): Promise<void> => {
      await this.patchDraftRows(item.id, [platform], (current) => {
        return draftOutcomeRow(current, result);
      });
    };
    const markRunning = async (
      targets: readonly PublishPlatform[],
      pid: number,
    ): Promise<void> => {
      await this.patchDraftRows(item.id, targets, (current) => draftPendingRow(current, pid));
    };
    const markQueued = async (targets: readonly PublishPlatform[]): Promise<void> => {
      await this.patchDraftRows(item.id, targets, (current) => draftPendingRow(current));
    };
    try {
      const videoPlatforms = platforms.filter((platform) =>
        PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner === "video-publisher"
      );
      if (videoPlatforms.length > 0) {
        try {
          const run = await startVideoDraftRun(
            await prepareDraftRun(item, this.dataDir, videoPlatforms),
            request.confirmOriginalRights === true ? { confirmOriginalRights: true } : {},
          );
          started = true;
          await markRunning(videoPlatforms, run.pid);
          void run.completion.then(async (result) => {
            const results = "results" in result
              ? result.results
              : videoPlatforms.length === 1
                ? { [videoPlatforms[0]!]: result }
                : Object.fromEntries(videoPlatforms.map((platform) => [platform, {
                    ok: false as const,
                    error: result.ok ? "多平台草稿结果缺少逐平台状态" : result.error,
                  }]));
            for (const platform of videoPlatforms) {
              await applyOutcome(platform, results[platform] ?? {
                ok: false,
                error: `${PUBLISH_PLATFORM_DEFINITIONS[platform].name}草稿结果缺失`,
              });
            }
          }).catch((cause) => {
            this.invalidateCatalog();
            process.emitWarning(
              `视频草稿结果写入失败（${videoPlatforms.join("、")}）：${cause instanceof Error ? cause.message : String(cause)}`,
              { code: "OIL_DRAFT_STATE_WRITE_FAILED" },
            );
          });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          startErrors.push(`${videoPlatforms.map((platform) => PUBLISH_PLATFORM_DEFINITIONS[platform].name).join("、")}：${message}`);
          for (const platform of videoPlatforms) {
            await applyOutcome(platform, { ok: false, error: message });
          }
        }
      }
      if (articlePlatforms.length > 0) {
        await markQueued(articlePlatforms);
        started = true;
        for (const platform of articlePlatforms) {
          const startKey = `${item.id}:${platform}`;
          const queued = this.enqueueArticleDraft(async () => {
            let outcome: VideoDraftOutcome;
            try {
              const run = await startArticleDraftRun(await prepareArticleDraftRun(item, platform));
              await markRunning([platform], run.pid);
              outcome = await run.completion;
            } catch (cause) {
              outcome = {
                ok: false,
                error: cause instanceof Error ? cause.message : String(cause),
              };
            }
            try {
              await applyOutcome(platform, outcome);
            } finally {
              this.draftStarts.delete(startKey);
            }
          });
          retainedStartKeys.add(startKey);
          void queued.catch((cause) => {
            this.draftStarts.delete(startKey);
            const message = cause instanceof Error ? cause.message : String(cause);
            void applyOutcome(platform, { ok: false, error: message }).catch((writeCause) => {
              this.invalidateCatalog();
              process.emitWarning(
                `草稿结果写入失败（${platform}）：${writeCause instanceof Error ? writeCause.message : String(writeCause)}`,
                { code: "OIL_DRAFT_STATE_WRITE_FAILED" },
              );
            });
          });
        }
      }
      if (!started) throw new Error(startErrors.join("；") || "草稿运行器未启动");
      return { id: item.id, platforms, started };
    } finally {
      for (const key of startKeys) {
        if (!retainedStartKeys.has(key)) this.draftStarts.delete(key);
      }
    }
  }

  async getDistributionSource(
    request: DistributionSourceRequest,
    signal: AbortSignal,
  ): Promise<DistributionSourceResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const platforms = [...new Set(request.platforms)];
    if (platforms.length === 0) throw new Error("至少选择一个目标平台");
    const source = await readDistributionSource(item.folderPath, request.selection);
    const wrongKind = platforms.filter((platform) =>
      PUBLISH_PLATFORM_DEFINITIONS[platform].kind !== source.mode
    );
    if (wrongKind.length > 0) {
      throw new Error(`所选素材类型与平台不匹配：${wrongKind.map((platform) =>
        PUBLISH_PLATFORM_DEFINITIONS[platform].name).join("、")}`);
    }
    return {
      id: item.id,
      title: item.title,
      selection: request.selection,
      sourceText: source.sourceText,
      sharedRules: SHARED_PLATFORM_GENERATION_RULES,
      platforms: platforms.map(platformGenerationRule),
    };
  }

  async commitDistribution(
    request: CommitDistributionRequest,
    signal: AbortSignal,
  ): Promise<CommitDistributionResult> {
    signal.throwIfAborted();
    const item = await this.find(request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);
    const platforms = request.variants.map((variant) => variant.platform);
    const frozen = await freezeDistributionPackage({
      id: item.id,
      folderPath: item.folderPath,
      selection: request.selection,
      variants: request.variants,
    });
    this.invalidateCatalog();
    return {
      id: item.id,
      mode: frozen.package.mode,
      platforms,
      packagePath: frozen.packagePath,
    };
  }

  async refreshCatalog(
    _request: Record<string, never>,
    signal: AbortSignal,
  ): Promise<ListContentsResult> {
    this.invalidateCatalog();
    return this.listContents({ query: "", filter: "all" }, signal);
  }

  async createContent(
    request: CreateContentRequest,
    signal: AbortSignal,
  ): Promise<CreateContentResult> {
    signal.throwIfAborted();
    const overlay = await loadOverlay(this.dataDir);
    const created = await createContentFolder(
      overlay.libraryRoot ?? this.libraryRoot,
      request.title,
      undefined,
      request.contentType ?? "video",
    );
    this.invalidateCatalog();
    return created;
  }

  async deleteContent(
    request: IdRequest,
    signal: AbortSignal,
  ): Promise<DeleteContentResult> {
    signal.throwIfAborted();
    const { libraryRoot, items } = await this.scanned();
    const item = items.find((candidate) => candidate.id === request.id);
    if (item === undefined) throw new Error(`content not found: ${request.id}`);

    const hasRunningJob = [item.burn, item.subtitleJob, item.coverJob]
      .some((job) => job.status === "running")
      || Object.values(item.publish).some((row) => row.draftState === "running" || row.draftState === "queued")
      || [...this.draftStarts].some((key) => key.startsWith(`${item.id}:`));
    if (hasRunningJob || this.assetUploads.size > 0) {
      throw new Error("内容任务仍在运行，完成或停止后才能删除");
    }

    const [root, folder] = await Promise.all([
      realpath(libraryRoot),
      realpath(item.folderPath),
    ]);
    if (folder === root || dirname(folder) !== root) {
      throw new Error("所选内容文件夹不属于当前内容库，拒绝删除");
    }

    const video = this.videos.get(item.id);
    video?.close();
    this.videos.delete(item.id);
    const article = this.articles.get(item.id);
    article?.close();
    this.articles.delete(item.id);

    await movePathToTrash(folder);
    try {
      await withOverlayLock(this.dataDir, async () => {
        const overlay = await loadOverlay(this.dataDir);
        delete overlay.items[item.id];
        await saveOverlay(this.dataDir, overlay);
      });
    } catch (cause) {
      process.emitWarning(
        `内容已移到废纸篓，但状态清理失败：${cause instanceof Error ? cause.message : String(cause)}`,
        { code: "OIL_CONTENT_TRASH_STATE_CLEANUP_FAILED" },
      );
    }
    this.invalidateCatalog();
    return { id: item.id, trashedAt: Date.now() };
  }

  async find(id: string) {
    const { items } = await this.scanned();
    return items.find((item) => item.id === id);
  }

  rememberOverlay(overlay: OverlayStore): void {
    this.cachedEnabledPlatforms = overlay.profile?.enabledPlatforms ?? emptyProfile().enabledPlatforms;
  }

  settingsOf(libraryRoot: string, overlay: Pick<OverlayStore, "profile">): LibrarySettings {
    return {
      libraryRoot,
      profile: overlay.profile ?? emptyProfile(),
    };
  }

  async patchItem(
    id: string,
    mutate: (item: OverlayItem) => void,
    signal: AbortSignal,
  ): Promise<ContentDetail> {
    await withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      const next = { ...(overlay.items[id] ?? {}) };
      mutate(next);
      overlay.items[id] = next;
      await saveOverlay(this.dataDir, overlay);
      this.notifyCatalogChanged();
    });
    return this.getContent({ id }, signal);
  }

  async patchDraftRows(
    id: string,
    platforms: readonly (typeof PUBLISH_PLATFORMS)[number][],
    mutate: (current: OverlayPublish) => OverlayPublish,
  ): Promise<void> {
    await withOverlayLock(this.dataDir, async () => {
      const overlay = await loadOverlay(this.dataDir);
      const item = { ...(overlay.items[id] ?? {}) };
      const publish = { ...item.publish };
      for (const platform of platforms) {
        publish[platform] = mutate(publish[platform] ?? { status: "unpublished" });
      }
      item.publish = publish;
      overlay.items[id] = item;
      await saveOverlay(this.dataDir, overlay);
      this.notifyCatalogChanged();
    });
  }
}

function resolveUserPath(path: string): string {
  const expanded = expandHomePath(path);
  if (!isAbsolute(expanded)) throw new Error(`path must be absolute: ${path}`);
  return expanded;
}
