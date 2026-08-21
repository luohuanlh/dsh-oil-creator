import { z } from "zod";

import { PUBLISH_PLATFORMS } from "./platforms.ts";

const contentCoversSchema = z.object({
  "3x4": z.string().optional(),
  "4x3": z.string().optional(),
  "16x9": z.string().optional(),
});

const contentSubtitlesSchema = z.object({
  srt: z.string().optional(),
  ass: z.string().optional(),
  transcript: z.string().optional(),
});

const localContentAssetSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

const contentAssetsSchema = z.object({
  videos: z.array(localContentAssetSchema),
  subtitles: z.array(localContentAssetSchema),
  articles: z.array(localContentAssetSchema),
  covers: z.array(localContentAssetSchema),
});

const pipelineSchema = z.union([
  z.literal("raw"),
  z.literal("subtitled"),
  z.literal("covered"),
  z.literal("packaged"),
]);

const workflowSchema = z.union([
  z.literal("idle"),
  z.literal("record"),
  z.literal("cut"),
  z.literal("finish"),
  z.literal("publish"),
  z.literal("live"),
]);

const publishMarkSchema = z.union([
  z.literal("unpublished"),
  z.literal("draft"),
  z.literal("published"),
]);

const publishPlatformSchema = z.enum(PUBLISH_PLATFORMS);

const platformPublishSchema = z.object({
  status: publishMarkSchema,
  source: z.union([
    z.literal("none"),
    z.literal("publisher"),
    z.literal("overlay"),
    z.literal("sync"),
  ]),
  url: z.string().optional(),
  remoteId: z.string().optional(),
  views: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  syncedAt: z.number().optional(),
  draftState: z.union([
    z.literal("running"),
    z.literal("ready"),
    z.literal("error"),
  ]).optional(),
  draftError: z.string().optional(),
  draftStartedAt: z.number().optional(),
  draftPid: z.number().int().positive().optional(),
});

const contentPublishSchema = z.object(
  Object.fromEntries(PUBLISH_PLATFORMS.map((platform) => [platform, platformPublishSchema])) as Record<
    (typeof PUBLISH_PLATFORMS)[number],
    typeof platformPublishSchema
  >,
);

const burnJobSchema = z.object({
  status: z.union([
    z.literal("idle"),
    z.literal("running"),
    z.literal("done"),
    z.literal("error"),
  ]),
  startedAt: z.number().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  pid: z.number().optional(),
});

export const contentSummarySchema = z.object({
  id: z.string().min(1),
  folderPath: z.string().min(1),
  title: z.string(),
  contentType: z.union([
    z.literal("video"),
    z.literal("audio"),
    z.literal("article"),
  ]).optional(),
  date: z.string().optional(),
  recordedAt: z.number(),
  createdMs: z.number(),
  videoRaw: z.string().optional(),
  videoSubtitled: z.string().optional(),
  covers: contentCoversSchema,
  subtitles: contentSubtitlesSchema,
  assets: contentAssetsSchema,
  hasPublishPackage: z.boolean(),
  hasDistributionPackage: z.boolean(),
  hasArticle: z.boolean(),
  studioPath: z.string().optional(),
  waitingForExport: z.boolean(),
  exportTimedOut: z.boolean().optional(),
  articlePath: z.string().optional(),
  tags: z.array(z.string()),
  pipeline: pipelineSchema,
  workflow: workflowSchema,
  publish: contentPublishSchema,
  burn: burnJobSchema,
  subtitleJob: burnJobSchema,
  coverJob: burnJobSchema,
});

export const creatorProfileSchema = z.object({
  enabledPlatforms: z.array(publishPlatformSchema),
});

export const librarySettingsSchema = z.object({
  libraryRoot: z.string(),
  profile: creatorProfileSchema,
});

export const listContentsRequestSchema = z.object({
  query: z.string(),
  filter: z.union([
    z.literal("all"),
    z.literal("cover"),
    z.literal("subtitle"),
    z.literal("article"),
  ]),
});

export const listContentsResultSchema = z.object({
  settings: librarySettingsSchema,
  items: z.array(contentSummarySchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    cover: z.number().int().nonnegative(),
    subtitle: z.number().int().nonnegative(),
    article: z.number().int().nonnegative(),
  }),
  revision: z.number().int().nonnegative(),
});

export const idRequestSchema = z.object({
  id: z.string().min(1),
});

export const importAssetRequestSchema = z.object({
  id: z.string().min(1),
  kind: z.union([z.literal("article"), z.literal("cover")]),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128),
  base64: z.string().min(1).max(28_000_000),
});

export const contentDetailSchema = contentSummarySchema.and(
  z.object({
    publishCopy: z.string(),
    topicNote: z.string(),
    script: z.string(),
    article: z.string(),
  }),
);

export const importAssetResultSchema = z.object({
  asset: localContentAssetSchema,
  detail: contentDetailSchema,
});

export const coverThumbResultSchema = z.object({
  found: z.boolean(),
  mime: z.string(),
  base64: z.string(),
});

export const videoPlaybackResultSchema = z.object({
  found: z.boolean(),
  url: z.string(),
  kind: z.union([z.literal("raw"), z.literal("subtitled")]),
});

export const assetPreviewRequestSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});

export const articleMediaResultSchema = z.object({
  found: z.boolean(),
  origin: z.string(),
  text: z.string(),
});

export const subtitleTextResultSchema = z.object({
  text: z.string(),
  cues: z.array(z.object({
    text: z.string(),
    at: z.string().optional(),
  })),
});

export const setContentStageRequestSchema = z.object({
  id: z.string().min(1),
  readyToRecord: z.boolean(),
});

export const bindStudioRequestSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});

export const subtitlePreviewResultSchema = z.object({
  url: z.string().min(1),
  port: z.number().int().positive(),
});

export const syncPublishRequestSchema = z.object({
  id: z.string().min(1).optional(),
  platform: publishPlatformSchema.optional(),
  force: z.boolean().optional(),
});

export const syncPublishResultSchema = z.object({
  matched: z.number().int().nonnegative(),
  cached: z.boolean().optional(),
  platforms: z.array(z.object({
    platform: publishPlatformSchema,
    count: z.number().int().nonnegative(),
    loginRequired: z.boolean().optional(),
    error: z.string().optional(),
  })),
});

export const revisionResultSchema = z.object({
  revision: z.number().int().nonnegative(),
});

const capabilitySchema = z.object({
  state: z.union([
    z.literal("ready"),
    z.literal("missing"),
    z.literal("unsupported"),
  ]),
  required: z.boolean(),
  detail: z.string(),
  path: z.string().optional(),
});

export const capabilitiesResultSchema = z.object({
  capabilities: z.object({
    library: capabilitySchema,
    autoPublish: capabilitySchema,
    article: capabilitySchema,
    egoBrowser: capabilitySchema,
  }),
});

const platformAccountSchema = z.object({
  platform: publishPlatformSchema,
  status: z.union([z.literal("unknown"), z.literal("active"), z.literal("expired")]),
  nickname: z.string().optional(),
  checkedAt: z.number().optional(),
  taskSpace: z.string().optional(),
  supportsAutoDraft: z.boolean(),
  draftCapability: z.union([
    z.literal("remote-verified"),
    z.literal("implemented-simulated"),
    z.literal("page-ready"),
    z.literal("unsupported"),
  ]),
});

export const platformAccountsResultSchema = z.object({
  accounts: z.array(platformAccountSchema),
});

export const platformAccountRequestSchema = z.object({
  platform: publishPlatformSchema,
});

export const openPlatformAccountResultSchema = z.object({
  platform: publishPlatformSchema,
  started: z.boolean(),
  taskSpace: z.string().optional(),
});

export const startDraftsRequestSchema = z.object({
  id: z.string().min(1),
  platforms: z.array(publishPlatformSchema).min(1),
  confirmOriginalRights: z.boolean().optional(),
});

export const startDraftsResultSchema = z.object({
  id: z.string().min(1),
  platforms: z.array(publishPlatformSchema),
  started: z.boolean(),
});

export const waitExportRequestSchema = z.object({
  id: z.string().min(1),
  timeoutMs: z.number().optional(),
});

export const setLibraryRootRequestSchema = z.object({
  path: z.string().min(1),
});

export const createContentRequestSchema = z.object({
  title: z.string().min(1),
  contentType: z.union([
    z.literal("video"),
    z.literal("audio"),
    z.literal("article"),
  ]).optional(),
});

export const createContentResultSchema = z.object({
  id: z.string().min(1),
  folderPath: z.string().min(1),
});

export const setProfileRequestSchema = z.object({
  profile: creatorProfileSchema,
});

export const setScriptRulesRequestSchema = z.object({
  text: z.string(),
});

export const setTopicNoteRequestSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});

export const setScriptRequestSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
});

export const organizeRequestSchema = z.object({
  apply: z.boolean(),
  ids: z.array(z.string()),
});

export const organizePreviewSchema = z.object({
  moves: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.union([
      z.literal("add-date"),
      z.literal("readable-title"),
      z.literal("both"),
    ]),
  })),
  unchanged: z.number().int().nonnegative(),
});
