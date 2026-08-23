import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";

import {
  capabilitiesResultSchema,
  contentDetailSchema,
  coverThumbResultSchema,
  idRequestSchema,
  importAssetRequestSchema,
  importAssetResultSchema,
  prepareAssetUploadRequestSchema,
  prepareAssetUploadResultSchema,
  librarySettingsSchema,
  listContentsRequestSchema,
  listContentsResultSchema,
  setLibraryRootRequestSchema,
  createContentRequestSchema,
  createContentResultSchema,
  setProfileRequestSchema,
  revisionResultSchema,
  videoPlaybackResultSchema,
  articleMediaResultSchema,
  assetPreviewRequestSchema,
  saveArticleRequestSchema,
  saveArticleResultSchema,
  prepareArticleImageUploadRequestSchema,
  prepareArticleImageUploadResultSchema,
  platformAccountsResultSchema,
  platformAccountRequestSchema,
  openPlatformAccountResultSchema,
  startDraftsRequestSchema,
  startDraftsResultSchema,
} from "./schemas.ts";

export const PACKAGE_NAME = "dsh-oil-creator";
export const REMOTE_NAMESPACE = "oilCreator";

const emptyObjectSchema = z.object({});

function codec(typeSymbol: string, schema: z.ZodType<unknown>) {
  return { mode: "strict" as const, typeSymbol, schema };
}

function jsonParam(
  name: string,
  typeSymbol: string,
  schema: z.ZodType<unknown>,
): InvocationDescriptor["parameters"][number] {
  return {
    name,
    wire: name,
    source: "json",
    codec: codec(typeSymbol, schema),
  };
}

function invocation(
  method: string,
  request: z.ZodType<unknown>,
  result: z.ZodType<unknown>,
): InvocationDescriptor {
  return {
    id: `${PACKAGE_NAME}#${REMOTE_NAMESPACE}/${method}`,
    service: REMOTE_NAMESPACE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: "direct" },
    parameters: [jsonParam("request", `${PACKAGE_NAME}#${method}Request`, request)],
    cancellation: { parameter: "signal" },
    result: codec(`${PACKAGE_NAME}#${method}Result`, result),
    sourceLocation: { file: "src/service.ts", line: 1, column: 1 },
  };
}

export const OIL_CREATOR_INVOCATIONS: readonly InvocationDescriptor[] = [
  invocation("listContents", listContentsRequestSchema, listContentsResultSchema),
  invocation("getContent", idRequestSchema, contentDetailSchema),
  invocation("importAsset", importAssetRequestSchema, importAssetResultSchema),
  invocation("prepareAssetUpload", prepareAssetUploadRequestSchema, prepareAssetUploadResultSchema),
  invocation("getCoverThumb", idRequestSchema, coverThumbResultSchema),
  invocation("getVideoPlayback", assetPreviewRequestSchema, videoPlaybackResultSchema),
  invocation("getArticleMedia", assetPreviewRequestSchema, articleMediaResultSchema),
  invocation("saveArticle", saveArticleRequestSchema, saveArticleResultSchema),
  invocation(
    "prepareArticleImageUpload",
    prepareArticleImageUploadRequestSchema,
    prepareArticleImageUploadResultSchema,
  ),
  invocation("getSettings", emptyObjectSchema, librarySettingsSchema),
  invocation("getCapabilities", emptyObjectSchema, capabilitiesResultSchema),
  invocation("getRevision", emptyObjectSchema, revisionResultSchema),
  invocation("setLibraryRoot", setLibraryRootRequestSchema, librarySettingsSchema),
  invocation("refreshCatalog", emptyObjectSchema, listContentsResultSchema),
  invocation("createContent", createContentRequestSchema, createContentResultSchema),
  invocation("setProfile", setProfileRequestSchema, librarySettingsSchema),
  invocation("getPlatformAccounts", emptyObjectSchema, platformAccountsResultSchema),
  invocation("openPlatformAccount", platformAccountRequestSchema, openPlatformAccountResultSchema),
  invocation("checkPlatformAccount", platformAccountRequestSchema, platformAccountsResultSchema),
  invocation("startDrafts", startDraftsRequestSchema, startDraftsResultSchema),
];
