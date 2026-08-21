import type {
  ArticleMediaResult,
  AssetSelection,
  ContentDetail,
  ContentFilter,
  ContentType,
  CoverThumbResult,
  CreatorCapabilities,
  CreatorProfile,
  LibrarySettings,
  ImportAssetRequest,
  ImportAssetResult,
  ListContentsResult,
  OpenPlatformAccountResult,
  PlatformAccountsResult,
  PrepareAssetUploadRequest,
  PrepareAssetUploadResult,
  PublishPlatform,
  VideoPlaybackResult,
} from "../types.ts";

export interface CreatorViewFace {
  ready: () => boolean;
  listContents: (query: string, filter: ContentFilter) => Promise<ListContentsResult>;
  getRevision: () => Promise<number>;
  getContent: (id: string) => Promise<ContentDetail>;
  importAsset: (request: ImportAssetRequest) => Promise<ImportAssetResult>;
  prepareAssetUpload: (request: PrepareAssetUploadRequest) => Promise<PrepareAssetUploadResult>;
  getCoverThumb: (id: string) => Promise<CoverThumbResult>;
  getVideoPlayback: (id: string, path: string) => Promise<VideoPlaybackResult>;
  getArticleMedia: (id: string, path: string) => Promise<ArticleMediaResult>;
  pickDirectory: () => Promise<string | null>;
  openPath: (path: string) => Promise<void>;
  getSettings: () => Promise<LibrarySettings>;
  getCapabilities: () => Promise<CreatorCapabilities>;
  setLibraryRoot: (path: string) => Promise<void>;
  setProfile: (profile: CreatorProfile) => Promise<void>;
  refreshCatalog: () => Promise<ListContentsResult>;
  createContent: (
    title: string,
    contentType: ContentType,
  ) => Promise<{ id: string; folderPath: string }>;
  getPlatformAccounts: () => Promise<PlatformAccountsResult>;
  openPlatformAccount: (platform: PublishPlatform) => Promise<OpenPlatformAccountResult>;
  checkPlatformAccount: (platform: PublishPlatform) => Promise<PlatformAccountsResult>;
  queueDistribution: (request: {
    id: string;
    selection: AssetSelection;
    platforms: PublishPlatform[];
    confirmOriginalRights?: boolean;
  }) => Promise<void>;
}
