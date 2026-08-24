import type { ClientContext, ISessions, WorkspaceId } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

import "./OilTheme.css";

import { TYPERT_REMOTE } from "../remote.ts";
import { CREATOR_SETTINGS_NAMESPACE } from "../settingsContract.ts";
import type {
  ArticleMediaResult,
  AssetSelection,
  ContentDetail,
  ContentFilter,
  ContentType,
  CoverThumbResult,
  CreateContentResult,
  CreatorCapabilities,
  CreatorProfile,
  DeleteContentResult,
  LibrarySettings,
  ImportAssetRequest,
  ImportAssetResult,
  ListContentsResult,
  OpenPlatformAccountResult,
  PlatformAccountsResult,
  PrepareAssetUploadRequest,
  PrepareAssetUploadResult,
  PrepareArticleImageUploadRequest,
  PrepareArticleImageUploadResult,
  PublishPlatform,
  SaveArticleRequest,
  SaveArticleResult,
  VideoPlaybackResult,
} from "../types.ts";
import { startLibraryLiveSync } from "./catalogSync.ts";
import { ContentInspector } from "./ContentInspector.tsx";
import { queueDistributionPrompt } from "./distributionPrompt.ts";
import {
  bumpLibrary,
  bumpProfile,
  getSelectedContentId,
  setSelectedContentId,
  subscribeSelectedContentId,
} from "./contentSelection.ts";
import { registerContentTriggers } from "./contentTriggers.ts";
import { CreatorSettingsCard } from "./CreatorSettingsCard.tsx";
import type { CreatorViewFace } from "./face.ts";
import { en, NS, type CreatorKey, zh } from "./locales.ts";
import { remountPluginCss, releasePluginCss } from "./pluginCss.ts";
import { releaseShellChrome } from "./contentSelection.ts";
import { OilSidebarRoot } from "./sidebar/OilSidebarRoot.tsx";
import type { OilSidebarInjected, OilSidebarSlotProps } from "./sidebar/slots.ts";
import {
  registerCreatorSettingsCard,
  type CompatibleSettingsSlots,
} from "./settingsSlot.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "dsh.oil.creator": CreatorKey;
  }
}

interface RemoteAnswer<T> {
  ok: boolean;
  value?: T;
  error?: { code: string; message: string };
}

interface OilCreatorRemote {
  listContents: (request: { query: string; filter: ContentFilter }) => Promise<RemoteAnswer<ListContentsResult>>;
  getContent: (request: { id: string }) => Promise<RemoteAnswer<ContentDetail>>;
  importAsset: (request: ImportAssetRequest) => Promise<RemoteAnswer<ImportAssetResult>>;
  prepareAssetUpload: (request: PrepareAssetUploadRequest) => Promise<RemoteAnswer<PrepareAssetUploadResult>>;
  getCoverThumb: (request: { id: string }) => Promise<RemoteAnswer<CoverThumbResult>>;
  getVideoPlayback: (request: { id: string; path: string }) => Promise<RemoteAnswer<VideoPlaybackResult>>;
  getArticleMedia: (request: { id: string; path: string }) => Promise<RemoteAnswer<ArticleMediaResult>>;
  saveArticle: (request: SaveArticleRequest) => Promise<RemoteAnswer<SaveArticleResult>>;
  prepareArticleImageUpload: (
    request: PrepareArticleImageUploadRequest,
  ) => Promise<RemoteAnswer<PrepareArticleImageUploadResult>>;
  getSettings: (request: Record<string, never>) => Promise<RemoteAnswer<LibrarySettings>>;
  getCapabilities: (request: Record<string, never>) => Promise<RemoteAnswer<{ capabilities: CreatorCapabilities }>>;
  getRevision: (request: Record<string, never>) => Promise<RemoteAnswer<{ revision: number }>>;
  setLibraryRoot: (request: { path: string }) => Promise<RemoteAnswer<LibrarySettings>>;
  setProfile: (request: { profile: CreatorProfile }) => Promise<RemoteAnswer<LibrarySettings>>;
  refreshCatalog: (request: Record<string, never>) => Promise<RemoteAnswer<ListContentsResult>>;
  createContent: (request: {
    title: string;
    contentType?: ContentType;
  }) => Promise<RemoteAnswer<CreateContentResult>>;
  deleteContent: (request: { id: string }) => Promise<RemoteAnswer<DeleteContentResult>>;
  getPlatformAccounts: (request: Record<string, never>) => Promise<RemoteAnswer<PlatformAccountsResult>>;
  openPlatformAccount: (request: { platform: PublishPlatform }) => Promise<RemoteAnswer<OpenPlatformAccountResult>>;
  checkPlatformAccount: (request: { platform: PublishPlatform }) => Promise<RemoteAnswer<PlatformAccountsResult>>;
}

function unwrap<T>(answer: RemoteAnswer<T>, fallback: string): T {
  if (!answer.ok || answer.value === undefined) {
    throw new Error(answer.error?.message ?? fallback);
  }
  return answer.value;
}

export const inject = ["slots", "locale", "remote", "workspaces", "layout", "sessions"];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-oil-creator: dictionaries");
  ctx.effect(() => {
    remountPluginCss();
    return () => {
      releasePluginCss();
      releaseShellChrome();
    };
  }, "dsh-oil-creator: chrome");

  const remoteOf = (): OilCreatorRemote | undefined =>
    ctx.get("remote.oilCreator") as OilCreatorRemote | undefined;

  const face = (): CreatorViewFace => ({
    ready: () => remoteOf() !== undefined,
    listContents: async (query, filter) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.listContents({ query, filter }), "list failed");
    },
    getContent: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getContent({ id }), "content failed");
    },
    importAsset: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const imported = unwrap(await remote.importAsset(request), "asset import failed");
      bumpLibrary();
      return imported;
    },
    prepareAssetUpload: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.prepareAssetUpload(request), "asset upload failed");
    },
    getCoverThumb: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, mime: "", base64: "" };
      const answer = await remote.getCoverThumb({ id });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, mime: "", base64: "" };
    },
    getVideoPlayback: async (id, path) => {
      const remote = remoteOf();
      if (remote === undefined) return { found: false, url: "", kind: "raw" };
      const answer = await remote.getVideoPlayback({ id, path });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, url: "", kind: "raw" };
    },
    getArticleMedia: async (id, path) => {
      const remote = remoteOf();
      if (remote === undefined) {
        return { found: false, origin: "", text: "", revision: "", editable: false };
      }
      const answer = await remote.getArticleMedia({ id, path });
      return answer.ok && answer.value !== undefined
        ? answer.value
        : { found: false, origin: "", text: "", revision: "", editable: false };
    },
    saveArticle: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.saveArticle(request), "article save failed");
    },
    prepareArticleImageUpload: async (request) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(
        await remote.prepareArticleImageUpload(request),
        "article image upload failed",
      );
    },
    pickDirectory: () => ctx.workspaces.pickDirectory(),
    openPath: (path) => ctx.workspaces.openPath(path),
    getSettings: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getSettings({}), "settings failed");
    },
    getCapabilities: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getCapabilities({}), "capabilities failed").capabilities;
    },
    getRevision: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getRevision({}), "revision failed").revision;
    },
    setLibraryRoot: async (path) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setLibraryRoot({ path }), "set root failed");
      bumpLibrary();
    },
    setProfile: async (profile) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      unwrap(await remote.setProfile({ profile }), "set profile failed");
      bumpProfile();
    },
    refreshCatalog: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const listed = unwrap(await remote.refreshCatalog({}), "refresh failed");
      bumpLibrary();
      return listed;
    },
    createContent: async (title, contentType) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const created = unwrap(
        await remote.createContent({ title, contentType }),
        "create failed",
      );
      bumpLibrary();
      return created;
    },
    deleteContent: async (id) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      const deleted = unwrap(await remote.deleteContent({ id }), "delete failed");
      bumpLibrary();
      return deleted;
    },
    getPlatformAccounts: async () => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.getPlatformAccounts({}), "accounts failed");
    },
    openPlatformAccount: async (platform) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.openPlatformAccount({ platform }), "open account failed");
    },
    checkPlatformAccount: async (platform) => {
      const remote = remoteOf();
      if (remote === undefined) throw new Error("remote unavailable");
      return unwrap(await remote.checkPlatformAccount({ platform }), "check account failed");
    },
    queueDistribution: async (request: {
      id: string;
      selection: AssetSelection;
      platforms: PublishPlatform[];
      confirmOriginalRights?: boolean;
    }) => {
      await queueDistributionPrompt(ctx.get("sessions") as unknown as ISessions, request);
    },
  });

  const contentFace = face();

  ctx.effect(() => {
    const triggers = ctx.get("inputTriggers") as
      | Parameters<typeof registerContentTriggers>[0]
      | undefined;
    return registerContentTriggers(
      triggers,
      (id) => contentFace.getContent(id),
      async () => {
        const listed = await contentFace.listContents("", "all");
        return listed.items.map((item) => ({ id: item.id, title: item.title }));
      },
    );
  }, "dsh-oil-creator: content triggers");

  const injectSidebar = (): OilSidebarInjected => ({
    startSession: (workspaceId?: WorkspaceId) => { ctx.workspaces.startSession(workspaceId); },
    toggleSidebar: () => { ctx.layout.toggleSidebar(); },
  });

  function BoundSidebar(props: OilSidebarSlotProps) {
    const contentT = ctx.locale.bind(NS);
    return (
      <OilSidebarRoot
        {...props}
        tabLabels={{ sessions: contentT("tab.sessions"), content: contentT("tab") }}
        contentFace={contentFace}
        contentT={contentT}
      />
    );
  }

  ctx.slots.inject("sidebar", () =>
    ctx.slots.register({
      name: "sidebar",
      locale: NS,
      priority: -1,
      children: {
        "sidebar.workspaces": { kind: "single", scope: "root" },
        "sidebar.settings": { kind: "single", scope: "root" },
        "sidebar.footer.action": { kind: "list", scope: "root" },
      },
      inject: injectSidebar,
    }, BoundSidebar),
  );

  ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
    if (ctx.fiber.state >= 5) {
      await disposeRemote();
      return () => {};
    }
    bumpProfile();

    const stopOverlay = ctx.slots.inject("shell.overlay", () => {
      let disposeOccupant: (() => void) | undefined;
      const release = (): void => {
        disposeOccupant?.();
        disposeOccupant = undefined;
      };
      const sync = (): void => {
        if (getSelectedContentId() === null) {
          release();
          return;
        }
        if (disposeOccupant !== undefined) return;
        disposeOccupant = ctx.slots.register({
          name: "shell.overlay",
          id: "oil-creator-inspector",
          order: 20,
          locale: NS,
          inject: () => ({
            ...face(),
            closeDetails: () => { setSelectedContentId(null); },
          }),
        }, ContentInspector);
      };
      const stop = subscribeSelectedContentId(sync);
      sync();
      return () => {
        stop();
        release();
      };
    });
    const stopSettings = ctx.slots.inject("settings.plugin.item", () =>
      registerCreatorSettingsCard(
        ctx.slots as unknown as CompatibleSettingsSlots,
        CreatorSettingsCard,
        {
          namespace: CREATOR_SETTINGS_NAMESPACE,
          legacyId: "dsh-oil-creator",
          legacyOrder: 40,
          locale: NS,
          inject: () => face(),
        },
      ));
    const stopLive = startLibraryLiveSync(() => contentFace.getRevision());

    return async () => {
      stopLive();
      stopOverlay();
      stopSettings();
      await disposeRemote();
    };
  }, "dsh-oil-creator: remote-view");
}
