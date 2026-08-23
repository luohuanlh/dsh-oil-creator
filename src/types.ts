export type ContentFilter = "all" | "cover" | "subtitle" | "article";

export type ContentType = "video" | "audio" | "article";

export type PipelineStage = "raw" | "subtitled" | "covered" | "packaged";

export type WorkflowStage = "idle" | "record" | "cut" | "finish" | "publish" | "live";

export type { DraftCapability, PublishPlatform } from "./platforms.ts";
import type { DraftCapability, PublishPlatform } from "./platforms.ts";
import type {
  AssetSelection,
  ContentAssets,
  PlatformVariant,
} from "./distribution.ts";
import type { PlatformGenerationRule } from "./platforms.ts";

export type {
  AssetSelection,
  ContentAssets,
  PlatformVariant,
} from "./distribution.ts";

export type PublishMark = "unpublished" | "draft" | "published";

export type PublishSource = "none" | "publisher" | "overlay" | "sync";

export interface PublishMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  syncedAt?: number;
}

export interface PlatformPublish extends PublishMetrics {
  status: PublishMark;
  source: PublishSource;
  url?: string;
  remoteId?: string;
  draftReceipt?: string;
  draftStorage?: "remote" | "browser-local";
  draftState?: "running" | "ready" | "error";
  draftError?: string;
  draftStartedAt?: number;
  draftPid?: number;
}

export type ContentPublish = Record<PublishPlatform, PlatformPublish>;

export type BurnStatus = "idle" | "running" | "done" | "error";

export interface BurnJob {
  status: BurnStatus;
  startedAt?: number;
  output?: string;
  error?: string;
  pid?: number;
}

export type MediaJob = BurnJob;

export interface OverlayPublish extends PublishMetrics {
  status: PublishMark;
  url?: string;
  remoteId?: string;
  draftReceipt?: string;
  draftStorage?: "remote" | "browser-local";
  draftState?: "running" | "ready" | "error";
  draftError?: string;
  draftStartedAt?: number;
  draftPid?: number;
}

export interface SubtitleCue {
  text: string;
  at?: string;
}

export interface ContentCovers {
  "3x4"?: string;
  "4x3"?: string;
  "16x9"?: string;
}

export interface ContentSubtitles {
  srt?: string;
  ass?: string;
  transcript?: string;
}

export interface ContentSummary {
  id: string;
  folderPath: string;
  title: string;
  contentType?: ContentType;
  date?: string;
  recordedAt: number;
  createdMs: number;
  videoRaw?: string;
  videoSubtitled?: string;
  covers: ContentCovers;
  subtitles: ContentSubtitles;
  assets: ContentAssets;
  hasPublishPackage: boolean;
  hasDistributionPackage: boolean;
  hasArticle: boolean;
  studioPath?: string;
  waitingForExport: boolean;
  exportTimedOut?: boolean;
  articlePath?: string;
  tags: string[];
  pipeline: PipelineStage;
  workflow: WorkflowStage;
  publish: ContentPublish;
  burn: BurnJob;
  subtitleJob: MediaJob;
  coverJob: MediaJob;
}

export interface CreatorProfile {
  enabledPlatforms: PublishPlatform[];
}

export interface LibrarySettings {
  libraryRoot: string;
  profile: CreatorProfile;
}

export type CreatorCapabilityState = "ready" | "missing" | "unsupported";

export interface CreatorCapability {
  state: CreatorCapabilityState;
  required: boolean;
  detail: string;
  path?: string;
}

export interface CreatorCapabilities {
  library: CreatorCapability;
  autoPublish: CreatorCapability;
  article: CreatorCapability;
  egoBrowser: CreatorCapability;
}

export interface CreatorSetupStatus {
  platform: NodeJS.Platform;
  dataDir: string;
  settings: LibrarySettings;
  capabilities: CreatorCapabilities;
  recommendations: string[];
}

export interface CreatorSetupRequest {
  apply: boolean;
  libraryRoot?: string;
  enabledPlatforms?: PublishPlatform[];
}

export interface CreatorSetupResult {
  applied: boolean;
  proposal: Omit<CreatorSetupRequest, "apply">;
  status: CreatorSetupStatus;
}

export interface LibraryCounts {
  total: number;
  cover: number;
  subtitle: number;
  article: number;
}

export interface ListContentsRequest {
  query: string;
  filter: ContentFilter;
}

export interface ListContentsResult {
  settings: LibrarySettings;
  items: ContentSummary[];
  counts: LibraryCounts;
  revision: number;
}

export interface IdRequest {
  id: string;
}

export type AssetImportKind = "video" | "subtitle" | "article" | "cover";

export interface ImportAssetRequest {
  id: string;
  kind: AssetImportKind;
  name: string;
  mimeType: string;
  base64: string;
}

export interface ImportAssetResult {
  asset: { name: string; path: string };
  detail: ContentDetail;
}

export interface PrepareAssetUploadRequest {
  id: string;
  kind: AssetImportKind;
  name: string;
  mimeType: string;
  size: number;
}

export interface PrepareAssetUploadResult {
  url: string;
}

export interface ContentDetail extends ContentSummary {
  publishCopy: string;
  topicNote: string;
  script: string;
  article: string;
}

export type PlatformAccountStatus = "unknown" | "active" | "expired";

export interface PlatformAccount {
  platform: PublishPlatform;
  status: PlatformAccountStatus;
  nickname?: string;
  checkedAt?: number;
  taskSpace?: string;
  supportsAutoDraft: boolean;
  draftCapability: DraftCapability;
}

export interface PlatformAccountsResult {
  accounts: PlatformAccount[];
}

export interface PlatformAccountRequest {
  platform: PublishPlatform;
}

export interface OpenPlatformAccountResult {
  platform: PublishPlatform;
  started: boolean;
  taskSpace?: string;
}

export interface StartDraftsRequest {
  id: string;
  platforms: PublishPlatform[];
  confirmOriginalRights?: boolean;
}

export interface StartDraftsResult {
  id: string;
  platforms: PublishPlatform[];
  started: boolean;
}

export interface DistributionSourceRequest {
  id: string;
  selection: AssetSelection;
  platforms: PublishPlatform[];
}

export interface DistributionSourceResult {
  id: string;
  title: string;
  selection: AssetSelection;
  sourceText: string;
  sharedRules: readonly string[];
  platforms: PlatformGenerationRule[];
}

export interface CommitDistributionRequest {
  id: string;
  selection: AssetSelection;
  variants: PlatformVariant[];
}

export interface CommitDistributionResult {
  id: string;
  mode: AssetSelection["mode"];
  platforms: PublishPlatform[];
  packagePath: string;
}

export interface CoverThumbResult {
  found: boolean;
  mime: string;
  base64: string;
}

export interface VideoPlaybackResult {
  found: boolean;
  url: string;
  kind: "raw" | "subtitled";
}

export interface AssetPreviewRequest {
  id: string;
  path: string;
}

export interface ArticleMediaResult {
  found: boolean;
  origin: string;
  text: string;
}

export interface SubtitleTextResult {
  text: string;
  cues: SubtitleCue[];
}

export interface SetLibraryRootRequest {
  path: string;
}

export interface CreateContentRequest {
  title: string;
  contentType?: ContentType;
}

export interface CreateContentResult {
  id: string;
  folderPath: string;
}

export interface SetContentStageRequest {
  id: string;
  readyToRecord: boolean;
}

export interface BindStudioRequest {
  id: string;
  path: string;
}

export interface WaitExportRequest {
  id: string;
  timeoutMs?: number;
}

export interface OverlayItem {
  title?: string;
  readyToRecord?: boolean;
  studioPath?: string;
  waitingForExport?: boolean;
  exportTimedOut?: boolean;
  publish?: Partial<Record<PublishPlatform, OverlayPublish>>;
  burn?: BurnJob;
  subtitleJob?: MediaJob;
  coverJob?: MediaJob;
}

export interface SubtitlePreviewResult {
  url: string;
  port: number;
}

export interface SyncPublishRequest {
  id?: string;
  platform?: PublishPlatform;
  force?: boolean;
}

export interface SyncPublishResult {
  matched: number;
  cached?: boolean;
  platforms: Array<{
    platform: PublishPlatform;
    count: number;
    loginRequired?: boolean;
    error?: string;
  }>;
}

export interface OverlayStore {
  schemaVersion: 1;
  libraryRoot?: string;
  profile?: CreatorProfile;
  accounts?: Partial<Record<PublishPlatform, Omit<PlatformAccount, "platform" | "supportsAutoDraft" | "draftCapability">>>;
  items: Record<string, OverlayItem>;
}

export type OrganizeReason = "add-date" | "readable-title" | "both";

export interface OrganizeMove {
  from: string;
  to: string;
  reason: OrganizeReason;
}

export interface OrganizeRequest {
  apply: boolean;
  ids: string[];
}

export interface OrganizePreview {
  moves: OrganizeMove[];
  unchanged: number;
}

export interface SetProfileRequest {
  profile: CreatorProfile;
}

export interface SetScriptRulesRequest {
  text: string;
}

export interface CreatorGuideResult {
  guide: string;
  status: CreatorSetupStatus;
}

export interface SetTopicNoteRequest {
  id: string;
  text: string;
}

export interface SetScriptRequest {
  id: string;
  text: string;
}
