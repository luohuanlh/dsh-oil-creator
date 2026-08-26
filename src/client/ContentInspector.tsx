import { useEffect, useRef, useState } from "react";
import {
  IconCloseOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import { resolveContentType } from "../contentType.ts";
import {
  PUBLISH_PLATFORM_DEFINITIONS,
  supportsAutoDraft,
} from "../platforms.ts";
import type {
  AssetImportKind,
  AssetSelection,
  ContentDetail,
  ContentType,
  ImportAssetResult,
  PlatformAccount,
  PublishPlatform,
  VideoPlaybackResult,
} from "../types.ts";
import type { CreatorViewFace } from "./face.ts";
import { ArticleWorkbench } from "./ArticleWorkbench.tsx";
import {
  applyConversationInset,
  clearConversationInset,
  getInspectorWidth,
  setInspectorWidth,
  useLibraryEpoch,
  useProfileEpoch,
  useSelectedContentId,
} from "./contentSelection.ts";
import {
  defaultDistributionPlatforms,
  invertDistributionPlatforms,
  visibleDistributionPlatforms,
} from "./distributionSelection.ts";
import { remoteDraftProgress } from "./draftProgress.ts";
import { ACCOUNT_PLATFORM_MARKS } from "./accountPlatformMarks.ts";
import type { CreatorKey } from "./locales.ts";
import { PlatformMark } from "./PlatformMark.tsx";
import { ActionBar, ActionButton } from "./ui/ActionButton.tsx";
import { StatusPill, type StatusTone } from "./ui/StatusPill.tsx";
import { Surface } from "./ui/Surface.tsx";
import "./ContentInspector.css";

const CONTENT_TYPE_KEY: Record<ContentType, CreatorKey> = {
  video: "inspector.tab.video",
  audio: "inspector.tab.audio",
  article: "inspector.tab.article",
};

type InlineAssetImportKind = Extract<AssetImportKind, "article" | "cover">;

const LOCAL_IMPORT_LIMIT: Record<InlineAssetImportKind, number> = {
  article: 2 * 1024 * 1024,
  cover: 20 * 1024 * 1024,
};
const ARTICLE_META_MAX = 120;

function wechatPreviewDate(value: string | undefined): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (match === null) return undefined;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function DistributionPlatformMark({ platform }: { platform: PublishPlatform }) {
  const mark = ACCOUNT_PLATFORM_MARKS[platform];
  if (mark.icon !== undefined) return <PlatformMark id={mark.icon} size={16} />;
  if (mark.src !== undefined) {
    return (
      <img
        className="platformMark"
        src={mark.src}
        width={16}
        height={16}
        alt=""
        draggable={false}
      />
    );
  }
  return <span className="platformMark platformMarkFallback">{mark.glyph}</span>;
}

async function fileBase64(file: File, kind: InlineAssetImportKind): Promise<string> {
  if (file.size > LOCAL_IMPORT_LIMIT[kind]) {
    throw new Error(kind === "article"
      ? "Markdown 文章不能超过 2 MB"
      : "文章封面不能超过 20 MB");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function friendlyError(cause: unknown, t: (key: CreatorKey) => string): string {
  if (cause instanceof Error) {
    if (cause.message.startsWith("content not found")) return t("empty.gone");
    return cause.message;
  }
  return t("empty.error");
}

function draftTone(detail: ContentDetail, platform: PublishPlatform): StatusTone {
  const row = detail.publish[platform];
  if (row.draftState === "running") return "active";
  if (row.draftState === "ready") return "pending";
  if (row.draftState === "error") return "error";
  if (row.status === "draft") return "success";
  return "neutral";
}

function draftLabel(
  detail: ContentDetail,
  platform: PublishPlatform,
  t: (key: CreatorKey) => string,
): string {
  const row = detail.publish[platform];
  if (row.draftState === "running") return t("inspector.draft.running");
  if (row.draftState === "ready") return t("inspector.draft.staged");
  if (row.draftState === "error") return t("inspector.draft.failed");
  if (row.status === "draft") return row.draftStorage === "browser-local"
    ? t("inspector.publish.localDraft")
    : t("inspector.publish.draft");
  return t("inspector.publish.unpublished");
}

export type ContentInspectorProps =
  & PropsRuntime<"shell.overlay">
  & InjectFace<CreatorViewFace>
  & PropsLocale<"dsh.oil.creator">
  & { closeDetails: () => void };

export function ContentInspector({
  t,
  useSessions,
  ready,
  getContent,
  getVideoPlayback,
  getArticleMedia,
  saveArticle,
  prepareArticleImageUpload,
  getSettings,
  getPlatformAccounts,
  importAsset,
  prepareAssetUpload,
  queueDistribution,
  openPath,
  closeDetails,
}: ContentInspectorProps) {
  const [selectedId, setSelectedId] = useSelectedContentId();
  const currentSessionId = useSessions((sessions) => sessions.current);
  const libraryEpoch = useLibraryEpoch();
  const profileEpoch = useProfileEpoch();
  const [detail, setDetail] = useState<ContentDetail>();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [enabledPlatforms, setEnabledPlatforms] = useState<PublishPlatform[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PublishPlatform[]>([]);
  const [videoPath, setVideoPath] = useState("");
  const [subtitlePath, setSubtitlePath] = useState("");
  const [articlePath, setArticlePath] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleSummary, setArticleSummary] = useState("");
  const [importingAsset, setImportingAsset] = useState<AssetImportKind>();
  const [assetError, setAssetError] = useState<string>();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [panelWidth, setPanelWidth] = useState(getInspectorWidth);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string>();
  const [videoReady, setVideoReady] = useState(false);
  const [articleDirty, setArticleDirty] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const videoFileInput = useRef<HTMLInputElement>(null);
  const subtitleFileInput = useRef<HTMLInputElement>(null);
  const articleFileInput = useRef<HTMLInputElement>(null);
  const coverFileInput = useRef<HTMLInputElement>(null);
  const contentType = detail === undefined ? undefined : resolveContentType(detail);
  const mode: AssetSelection["mode"] = contentType === "article" ? "article" : "video";

  useEffect(() => {
    setDetail(undefined);
    setError(undefined);
    setActionError(undefined);
    setAssetError(undefined);
    setImportingAsset(undefined);
    setArticleTitle("");
    setArticleSummary("");
    setQueued(false);
    setVideoSrc(undefined);
    setVideoReady(false);
    setArticleDirty(false);
  }, [selectedId]);

  useEffect(() => {
    if (detail === undefined) return;
    setVideoPath(detail.videoSubtitled ?? detail.videoRaw ?? detail.assets.videos[0]?.path ?? "");
    setSubtitlePath(
      detail.subtitles.srt
      ?? detail.subtitles.ass
      ?? detail.assets.subtitles[0]?.path
      ?? "",
    );
    setArticlePath(detail.articlePath ?? detail.assets.articles[0]?.path ?? "");
    setCoverPath(detail.assets.covers[0]?.path ?? "");
  }, [detail?.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setExpanded(true); });
    return () => { window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (selectedId === null || !ready()) return;
    let cancelled = false;
    void getContent(selectedId).then(
      (next) => { if (!cancelled) setDetail(next); },
      (cause) => { if (!cancelled) setError(friendlyError(cause, t)); },
    );
    return () => { cancelled = true; };
  }, [selectedId, libraryEpoch, getContent, ready, t]);

  useEffect(() => {
    if (!ready()) return;
    let cancelled = false;
    void Promise.all([getSettings(), getPlatformAccounts()]).then(([settings, result]) => {
      if (cancelled) return;
      const enabled = settings.profile.enabledPlatforms.filter(supportsAutoDraft);
      setEnabledPlatforms(enabled);
      setAccounts(result.accounts);
    }, () => undefined);
    return () => { cancelled = true; };
  }, [profileEpoch, getSettings, getPlatformAccounts, ready]);

  const availablePlatforms = enabledPlatforms.filter((platform) =>
    PUBLISH_PLATFORM_DEFINITIONS[platform].kind === mode
  );

  useEffect(() => {
    setSelectedPlatforms(defaultDistributionPlatforms(availablePlatforms, accounts));
    setQueued(false);
  }, [
    mode,
    enabledPlatforms.join("|"),
    accounts.map((account) => `${account.platform}:${account.status}`).join("|"),
  ]);

  const hasRunningDraft = detail !== undefined
    && selectedPlatforms.some((platform) => detail.publish[platform].draftState === "running");

  useEffect(() => {
    if (!hasRunningDraft || selectedId === null || !ready()) return;
    const timer = window.setInterval(() => {
      void getContent(selectedId).then(
        (next) => { setDetail(next); },
        (cause) => { setActionError(friendlyError(cause, t)); },
      );
    }, 3000);
    return () => { window.clearInterval(timer); };
  }, [hasRunningDraft, selectedId, getContent, ready, t]);

  const queueReachedRunner = queued && detail !== undefined
    && selectedPlatforms.some((platform) => {
      const row = detail.publish[platform];
      return row.draftState === "running"
        || row.draftState === "ready"
        || row.draftState === "error"
        || row.status === "draft";
    });

  useEffect(() => {
    if (queueReachedRunner) setQueued(false);
  }, [queueReachedRunner]);

  useEffect(() => {
    if (contentType !== "video" || selectedId === null || videoPath === "" || !ready()) return;
    let cancelled = false;
    setVideoReady(false);
    void getVideoPlayback(selectedId, videoPath).then((next: VideoPlaybackResult) => {
      if (cancelled) return;
      setVideoSrc(next.found ? next.url : undefined);
      setVideoReady(true);
    }, () => {
      if (!cancelled) setVideoReady(true);
    });
    return () => { cancelled = true; };
  }, [contentType, selectedId, videoPath, libraryEpoch, getVideoPlayback, ready]);

  const shownWidth = expanded ? panelWidth : 0;
  useEffect(() => {
    if (selectedId === null) {
      clearConversationInset();
      return;
    }
    applyConversationInset(shownWidth, !dragging);
  }, [selectedId, currentSessionId, shownWidth, dragging]);
  useEffect(() => () => { clearConversationInset(); }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      if (drag.current === null) return;
      setInspectorWidth(drag.current.startWidth + (event.clientX - drag.current.startX));
      setPanelWidth(getInspectorWidth());
    };
    const onUp = (): void => {
      if (drag.current === null) return;
      drag.current = null;
      setDragging(false);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, []);

  if (selectedId === null) return null;

  const selection: AssetSelection | undefined = mode === "video"
    ? videoPath === "" ? undefined : {
        mode: "video",
        videoPath,
        ...(subtitlePath === "" ? {} : { subtitlePath }),
        ...(coverPath === "" ? {} : { coverPath }),
      }
    : articlePath === "" || coverPath === "" ? undefined : {
        mode: "article",
        articlePath,
        coverPath,
        ...(articleTitle.trim() === "" ? {} : { articleTitle: articleTitle.trim() }),
        ...(articleSummary.trim() === "" ? {} : { articleSummary: articleSummary.trim() }),
      };
  const contentReady = selection !== undefined;
  const accountMap = new Map(accounts.map((account) => [account.platform, account]));
  const accountsReady = selectedPlatforms.length > 0
    && selectedPlatforms.every((platform) => accountMap.get(platform)?.status === "active");
  const draftProgress = remoteDraftProgress(selectedPlatforms, detail?.publish ?? {});
  const draftsReady = draftProgress.hasSaved;
  const canStart = detail !== undefined
    && contentReady
    && accountsReady
    && selectedPlatforms.length > 0
    && currentSessionId !== undefined
    && !busy
    && !queued
    && !articleDirty
    && !hasRunningDraft;

  const togglePlatform = (platform: PublishPlatform) => {
    setQueued(false);
    setSelectedPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : availablePlatforms.filter((item) => current.includes(item) || item === platform)
    );
  };

  const invertPlatforms = () => {
    setQueued(false);
    setSelectedPlatforms((current) =>
      invertDistributionPlatforms(availablePlatforms, current)
    );
  };

  const onStartDrafts = () => {
    if (detail === undefined || selection === undefined || !canStart) return;
    setBusy(true);
    setQueued(false);
    setActionError(undefined);
    void queueDistribution({
      id: detail.id,
      selection,
      platforms: selectedPlatforms,
    }).then(() => {
      setQueued(true);
      setBusy(false);
    }, (cause) => {
      setActionError(friendlyError(cause, t));
      setBusy(false);
    });
  };

  const onImportAsset = async (kind: AssetImportKind, file: File): Promise<void> => {
    if (detail === undefined || importingAsset !== undefined) return;
    setImportingAsset(kind);
    setAssetError(undefined);
    setQueued(false);
    try {
      let imported: ImportAssetResult;
      if (kind === "video" || kind === "subtitle") {
        const prepared = await prepareAssetUpload({
          id: detail.id,
          kind,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });
        const response = await fetch(prepared.url, {
          method: "PUT",
          body: file,
          ...(file.type === "" ? {} : { headers: { "Content-Type": file.type } }),
        });
        const uploaded = await response.json().catch(() => undefined) as
          | { asset?: { name?: unknown; path?: unknown }; error?: unknown }
          | undefined;
        if (!response.ok) {
          throw new Error(typeof uploaded?.error === "string" ? uploaded.error : "本地文件导入失败");
        }
        if (typeof uploaded?.asset?.name !== "string" || typeof uploaded.asset.path !== "string") {
          throw new Error("本地文件导入结果无效");
        }
        imported = {
          asset: { name: uploaded.asset.name, path: uploaded.asset.path },
          detail: await getContent(detail.id),
        };
      } else {
        imported = await importAsset({
          id: detail.id,
          kind,
          name: file.name,
          mimeType: file.type,
          base64: await fileBase64(file, kind),
        });
      }
      setDetail(imported.detail);
      if (kind === "video") setVideoPath(imported.asset.path);
      else if (kind === "subtitle") setSubtitlePath(imported.asset.path);
      else if (kind === "article") setArticlePath(imported.asset.path);
      else setCoverPath(imported.asset.path);
    } catch (cause) {
      setAssetError(friendlyError(cause, t));
    } finally {
      setImportingAsset(undefined);
    }
  };

  const renderWorkflowRail = (workflowMode: AssetSelection["mode"]) => (
    <div className="workflowRail" aria-label={t(CONTENT_TYPE_KEY[workflowMode])}>
      {[
        { label: t("inspector.flow.content"), done: contentReady, count: undefined },
        { label: t("inspector.flow.distribute"), done: draftsReady, count: draftProgress.label },
      ].map((step, index, all) => {
        const current = !step.done && all.slice(0, index).every((item) => item.done);
        return (
          <div key={step.label} className={`flowNode ${step.done ? "done" : current ? "current" : ""}`}>
            <span className="flowState" aria-hidden="true" />
            <span className="flowLabel">{step.label}</span>
            {step.count !== undefined && <span className="flowCount">{step.count}</span>}
          </div>
        );
      })}
    </div>
  );

  const renderWorkflow = (workflowMode: AssetSelection["mode"]) => {
    if (detail === undefined) return null;
    const workflowPlatforms = visibleDistributionPlatforms(workflowMode, enabledPlatforms);
    const previewAuthor = accountMap.get("wechat-mp")?.nickname;
    const previewDate = wechatPreviewDate(detail.date);
    const preview = workflowMode === "video"
      ? !videoReady
        ? <div className="empty workflowPreview">{t("empty.loading")}</div>
        : videoSrc === undefined
          ? <div className="empty workflowPreview">{t("inspector.video.empty")}</div>
          : (
            <video
              className="videoPlayer workflowPreview"
              controls={true}
              playsInline={true}
              preload="metadata"
              src={videoSrc}
            />
          )
      : articlePath === ""
        ? null
        : (
          <ArticleWorkbench
            key={articlePath}
            id={detail.id}
            path={articlePath}
            previewTitle={articleTitle.trim() || detail.title}
            {...(previewAuthor === undefined
              ? {}
              : { previewAuthor })}
            {...(previewDate === undefined
              ? {}
              : { previewDate })}
            libraryEpoch={libraryEpoch}
            t={t}
            getArticleMedia={getArticleMedia}
            saveArticle={saveArticle}
            prepareArticleImageUpload={prepareArticleImageUpload}
            onDirtyChange={setArticleDirty}
            onSaved={() => {
              setQueued(false);
              setDetail((current) => current === undefined
                ? current
                : { ...current, hasDistributionPackage: false });
            }}
          />
        );

    return (
      <>
        <div className="workflowStack">
          <Surface
            marker="01"
            className="workflowSurface contentSurface"
            title={t("inspector.content.title")}
            titleAside={(
              <StatusPill tone={detail.hasDistributionPackage ? "success" : "neutral"}>
                {detail.hasDistributionPackage
                  ? t("inspector.package.frozen")
                  : t("inspector.package.pending")}
                </StatusPill>
            )}
          >
            {workflowMode === "video" ? (
              <div className="assetFields">
                <div className="assetField">
                  <div className="assetControl">
                    <select
                      aria-label={t("inspector.asset.video")}
                      className="assetSelect"
                      value={videoPath}
                      onChange={(event) => { setVideoPath(event.target.value); setQueued(false); }}
                    >
                      <option value="">{t("inspector.asset.video")}</option>
                      {detail.assets.videos.map((asset) => (
                        <option key={asset.path} value={asset.path}>{asset.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="assetImportButton"
                      disabled={importingAsset !== undefined}
                      onClick={() => { videoFileInput.current?.click(); }}
                    >
                      {importingAsset === "video"
                        ? t("inspector.asset.importing")
                        : t("inspector.asset.import")}
                    </button>
                    <input
                      ref={videoFileInput}
                      className="assetFileInput"
                      type="file"
                      accept=".mp4,.mov,video/mp4,video/quicktime"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file !== undefined) void onImportAsset("video", file);
                      }}
                    />
                  </div>
                </div>
                <div className="assetField">
                  <div className="assetControl">
                    <select
                      aria-label={t("inspector.asset.subtitle")}
                      className="assetSelect"
                      value={subtitlePath}
                      onChange={(event) => { setSubtitlePath(event.target.value); setQueued(false); }}
                    >
                      <option value="">{t("inspector.asset.subtitle")}</option>
                      {detail.assets.subtitles.map((asset) => (
                        <option key={asset.path} value={asset.path}>{asset.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="assetImportButton"
                      disabled={importingAsset !== undefined}
                      onClick={() => { subtitleFileInput.current?.click(); }}
                    >
                      {importingAsset === "subtitle"
                        ? t("inspector.asset.importing")
                        : t("inspector.asset.import")}
                    </button>
                    <input
                      ref={subtitleFileInput}
                      className="assetFileInput"
                      type="file"
                      accept=".srt,.ass,.vtt,.txt"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file !== undefined) void onImportAsset("subtitle", file);
                      }}
                    />
                  </div>
                </div>
                <div className="assetField videoCoverField">
                  <div className="assetControl">
                    <select
                      aria-label={t("inspector.asset.videoCover")}
                      className="assetSelect"
                      value={coverPath}
                      onChange={(event) => { setCoverPath(event.target.value); setQueued(false); }}
                    >
                      <option value="">{t("inspector.asset.videoCover")}</option>
                      {detail.assets.covers.map((asset) => (
                        <option key={asset.path} value={asset.path}>{asset.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="assetImportButton"
                      disabled={importingAsset !== undefined}
                      onClick={() => { coverFileInput.current?.click(); }}
                    >
                      {importingAsset === "cover"
                        ? t("inspector.asset.importing")
                        : t("inspector.asset.import")}
                    </button>
                    <input
                      ref={coverFileInput}
                      className="assetFileInput"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file !== undefined) void onImportAsset("cover", file);
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="assetFields">
                  <div className="assetField">
                    <span>{t("inspector.asset.article")}</span>
                    <div className="assetControl">
                      <select
                        aria-label={t("inspector.asset.article")}
                        className="assetSelect"
                        value={articlePath}
                        onChange={(event) => {
                          const nextPath = event.target.value;
                          if (articleDirty && !window.confirm(t("inspector.article.discardConfirm"))) {
                            return;
                          }
                          setArticlePath(nextPath);
                          setArticleDirty(false);
                          setQueued(false);
                        }}
                      >
                        <option value="">{t("inspector.asset.choose")}</option>
                        {detail.assets.articles.map((asset) => (
                          <option key={asset.path} value={asset.path}>{asset.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="assetImportButton"
                        disabled={importingAsset !== undefined}
                        onClick={() => {
                          if (articleDirty
                            && !window.confirm(t("inspector.article.discardConfirm"))) return;
                          articleFileInput.current?.click();
                        }}
                      >
                        {importingAsset === "article"
                          ? t("inspector.asset.importing")
                          : t("inspector.asset.import")}
                      </button>
                      <input
                        ref={articleFileInput}
                        className="assetFileInput"
                        type="file"
                        accept=".md,.markdown,.html,.htm,text/markdown,text/plain,text/html"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file !== undefined) void onImportAsset("article", file);
                        }}
                      />
                    </div>
                  </div>
                  <div className="assetField">
                    <span>{t("inspector.asset.cover")}</span>
                    <div className="assetControl">
                      <select
                        aria-label={t("inspector.asset.cover")}
                        className="assetSelect"
                        value={coverPath}
                        onChange={(event) => { setCoverPath(event.target.value); setQueued(false); }}
                      >
                        <option value="">{t("inspector.asset.choose")}</option>
                        {detail.assets.covers.map((asset) => (
                          <option key={asset.path} value={asset.path}>{asset.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="assetImportButton"
                        disabled={importingAsset !== undefined}
                        onClick={() => { coverFileInput.current?.click(); }}
                      >
                        {importingAsset === "cover"
                          ? t("inspector.asset.importing")
                          : t("inspector.asset.import")}
                      </button>
                      <input
                        ref={coverFileInput}
                        className="assetFileInput"
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file !== undefined) void onImportAsset("cover", file);
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="articleMetaFields">
                  <label className="articleMetaField">
                    <span className="articleMetaHeader">
                      <span>{t("inspector.asset.title")}</span>
                      <span>{articleTitle.length}/{ARTICLE_META_MAX}</span>
                    </span>
                    <input
                      className="articleMetaInput"
                      type="text"
                      maxLength={ARTICLE_META_MAX}
                      value={articleTitle}
                      placeholder={t("inspector.asset.titlePlaceholder")}
                      onChange={(event) => { setArticleTitle(event.target.value); setQueued(false); }}
                    />
                  </label>
                  <label className="articleMetaField">
                    <span className="articleMetaHeader">
                      <span>{t("inspector.asset.summary")}</span>
                      <span>{articleSummary.length}/{ARTICLE_META_MAX}</span>
                    </span>
                    <input
                      className="articleMetaInput"
                      type="text"
                      maxLength={ARTICLE_META_MAX}
                      value={articleSummary}
                      placeholder={t("inspector.asset.summaryPlaceholder")}
                      onChange={(event) => { setArticleSummary(event.target.value); setQueued(false); }}
                    />
                  </label>
                </div>
              </>
            )}
            {assetError !== undefined && <div className="assetImportError">{assetError}</div>}
            {preview}
          </Surface>
          <Surface
            marker="02"
            className="workflowSurface draftSurface"
            title={t("inspector.distribution.title")}
            titleAside={(
              <div className="draftHeadingActions">
                <ActionButton
                  tone="ghost"
                  disabled={availablePlatforms.length === 0}
                  onClick={invertPlatforms}
                >
                  {t("inspector.distribution.invert")}
                </ActionButton>
                <ActionButton tone="primary" disabled={!canStart} onClick={onStartDrafts}>
                  {busy || hasRunningDraft
                    ? t("inspector.draft.running")
                    : t("inspector.draft.aiStart")}
                </ActionButton>
              </div>
            )}
          >
            {workflowPlatforms.length === 0
              ? <div className="empty">{t("inspector.publish.noAdapter")}</div>
              : (
                <div className="publishGrid">
                  {workflowPlatforms.map((platform) => {
                    const account = accountMap.get(platform);
                    const selected = selectedPlatforms.includes(platform);
                    const supportsDraft = supportsAutoDraft(platform);
                    const row = detail.publish[platform];
                    return (
                      <label
                        key={platform}
                        className={`publishCard${supportsDraft ? "" : " unsupported"}`}
                        aria-disabled={!supportsDraft}
                      >
                        <div className="publishRow">
                          <span className="publishName">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!supportsDraft}
                              onChange={() => { togglePlatform(platform); }}
                            />
                            <DistributionPlatformMark platform={platform} />
                            {PUBLISH_PLATFORM_DEFINITIONS[platform].name}
                          </span>
                          <StatusPill tone={account?.status === "active" ? "success" : "neutral"}>
                            {account?.status === "active"
                              ? t("settings.account.active")
                              : t("settings.account.unknown")}
                          </StatusPill>
                        </div>
                        <div className="draftStatusRow">
                          <span>{t("inspector.draft.title")}</span>
                          <StatusPill tone={supportsDraft ? draftTone(detail, platform) : "neutral"}>
                            {supportsDraft
                              ? draftLabel(detail, platform, t)
                              : t("inspector.draft.unsupported")}
                          </StatusPill>
                        </div>
                        {row.draftError !== undefined && (
                          <div className="publishMetrics">{row.draftError}</div>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            {currentSessionId === undefined && (
              <div className="jobNote error">{t("inspector.draft.sessionRequired")}</div>
            )}
          </Surface>
        </div>
        {queued && <div className="jobNote done">{t("inspector.draft.queued")}</div>}
        {actionError !== undefined && <div className="jobNote error">{actionError}</div>}
      </>
    );
  };

  const renderAudio = () => {
    if (detail === undefined) return null;
    return (
      <div className="audioStack">
        <Surface
          marker="01"
          className="workflowSurface audioSurface"
          title={t("inspector.audio.title")}
          hint={t("inspector.audio.hint")}
        >
          <div className="audioNotice">
            <span className="audioWave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            <span>{t("inspector.audio.manual")}</span>
          </div>
          <ActionBar>
            <ActionButton onClick={() => { void openPath(detail.folderPath); }}>
              {t("inspector.openFolder")}
            </ActionButton>
          </ActionBar>
        </Surface>
      </div>
    );
  };

  return (
    <div
      data-plugin="dsh-oil-creator"
      data-surface="inspector"
      className={[
        "docked",
        expanded ? "open" : "",
        dragging ? "dragging" : "",
        panelWidth >= 560 ? "wide" : "",
      ].filter(Boolean).join(" ")}
      style={{ width: shownWidth }}
    >
      <header className="header">
        <div className="titleRow">
          <div className="titleBlock">
            <div className="titleMetaRow">
              <span className="titleKicker">{t("settings.title")}</span>
              {contentType === "video" && renderWorkflowRail("video")}
              {contentType === "article" && renderWorkflowRail("article")}
            </div>
          </div>
          <div className="titleActions">
            <button
              type="button"
              className="close"
              aria-label={t("inspector.close")}
              onClick={() => {
                if (articleDirty && !window.confirm(t("inspector.article.discardConfirm"))) return;
                setSelectedId(null);
                closeDetails();
              }}
            >
              <IconCloseOutline16 size={14} />
            </button>
          </div>
        </div>
      </header>
      <div className="body">
        {error !== undefined && <div className="empty">{error}</div>}
        {error === undefined && detail === undefined && <div className="empty">{t("empty.loading")}</div>}
        {detail !== undefined && contentType === "video" && renderWorkflow("video")}
        {detail !== undefined && contentType === "article" && renderWorkflow("article")}
        {detail !== undefined && contentType === "audio" && renderAudio()}
      </div>
      <div
        className="resize"
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { startX: event.clientX, startWidth: panelWidth };
          setDragging(true);
        }}
      />
    </div>
  );
}
