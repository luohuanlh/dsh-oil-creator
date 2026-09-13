import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { PUBLISH_PLATFORMS } from "./platforms.ts";
import type {
  BurnJob,
  ContentPublish,
  OverlayItem,
  OverlayPublish,
  PlatformPublish,
  PublishMark,
  PublishPlatform,
} from "./types.ts";

export { PUBLISH_PLATFORMS } from "./platforms.ts";

const FILE_TO_PLATFORM: Record<string, PublishPlatform> = Object.fromEntries([
  ...PUBLISH_PLATFORMS.map((platform) => [platform, platform]),
  ["wechat_channels", "channels"],
  ["wechat", "channels"],
]) as Record<string, PublishPlatform>;

function sanitizeStoredUrl(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    for (const key of ["token", "ticket", "access_token", "auth_token"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.replace(
      /([?&](?:token|ticket|access_token|auth_token)=)[^&\s"'<>]+/gi,
      "$1[REDACTED]",
    );
  }
}

export function anyPlatformPublished(publish: ContentPublish): boolean {
  return PUBLISH_PLATFORMS.some((key) => publish[key].status === "published");
}

export function emptyPublish(): ContentPublish {
  const result = {} as ContentPublish;
  for (const platform of PUBLISH_PLATFORMS) {
    result[platform] = { status: "unpublished", source: "none" };
  }
  return result;
}

export function emptyBurn(): BurnJob {
  return { status: "idle" };
}

export function isPublishMark(value: unknown): value is PublishMark {
  return value === "unpublished" || value === "draft" || value === "published";
}

export function isPublishPlatform(value: unknown): value is PublishPlatform {
  return PUBLISH_PLATFORMS.includes(value as PublishPlatform);
}

export function mapPublisherStatus(raw: string): PublishMark {
  const value = raw.trim().toLowerCase();
  if (value === "published" || value === "live" || value === "posted") return "published";
  return "unpublished";
}

function publisherReady(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "ready" || value === "prepared";
}

export function pickAutoPublishName(names: readonly string[]): string | undefined {
  if (names.includes("auto-publish.json")) return "auto-publish.json";
  return names.find((name) => name.endsWith(".auto-publish.json"));
}

function platformFromField(field: unknown, fallback: PublishMark): PlatformPublish {
  if (typeof field === "string") {
    return {
      status: mapPublisherStatus(field),
      source: "publisher",
      ...(publisherReady(field) ? { draftState: "ready" as const } : {}),
    };
  }
  if (typeof field !== "object" || field === null) {
    return { status: fallback, source: "publisher" };
  }
  const record = field as Record<string, unknown>;
  const rawStatus = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  const url = typeof record.url === "string" && record.url.trim() !== ""
    ? sanitizeStoredUrl(record.url)
    : undefined;
  const remoteId = typeof record.remoteId === "string" && record.remoteId.trim() !== ""
    ? record.remoteId.trim()
    : undefined;
  const draftReceipt = typeof record.draftReceipt === "string" && record.draftReceipt.trim() !== ""
    ? record.draftReceipt.trim()
    : undefined;
  const draftStorage = record.draftStorage === "remote" || record.draftStorage === "browser-local"
    ? record.draftStorage
    : undefined;
  const verifiedDraft = rawStatus === "draft"
    && url !== undefined
    && (remoteId !== undefined || draftReceipt !== undefined);
  const status = verifiedDraft
    ? "draft"
    : typeof record.status === "string"
      ? mapPublisherStatus(record.status)
      : fallback;
  return url === undefined
    ? {
        status,
        source: "publisher",
        ...(publisherReady(record.status) ? { draftState: "ready" as const } : {}),
        ...(remoteId === undefined ? {} : { remoteId }),
        ...(draftReceipt === undefined ? {} : { draftReceipt }),
        ...(draftStorage === undefined ? {} : { draftStorage }),
      }
    : {
        status,
        source: "publisher",
        url,
        ...(publisherReady(record.status) ? { draftState: "ready" as const } : {}),
        ...(remoteId === undefined ? {} : { remoteId }),
        ...(draftReceipt === undefined ? {} : { draftReceipt }),
        ...(draftStorage === undefined ? {} : { draftStorage }),
      };
}

export function publishFromAutoPublish(value: unknown): ContentPublish {
  const result = emptyPublish();
  if (typeof value !== "object" || value === null) return result;
  const publisher = (value as Record<string, unknown>).publisher;
  if (typeof publisher !== "object" || publisher === null) return result;
  const record = publisher as Record<string, unknown>;
  const platforms = record.platforms;
  if (typeof platforms !== "object" || platforms === null) return result;
  for (const [rawKey, field] of Object.entries(platforms as Record<string, unknown>)) {
    const key = FILE_TO_PLATFORM[rawKey];
    if (key === undefined) continue;
    result[key] = platformFromField(field, "unpublished");
  }
  return result;
}

export function mergePublish(
  file: ContentPublish,
  overlay?: OverlayItem["publish"],
): ContentPublish {
  if (overlay === undefined) return file;
  const result = {} as ContentPublish;
  for (const key of PUBLISH_PLATFORMS) {
    result[key] = file[key];
    const over = overlay[key];
    if (over === undefined) continue;
    const source = over.syncedAt === undefined ? "overlay" : "sync";
    result[key] = {
      status: over.status,
      source,
      ...copyOverlayFields(over),
    };
  }
  return result;
}

export function decodeOverlayPublish(raw: unknown): OverlayItem["publish"] {
  if (typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const next: NonNullable<OverlayItem["publish"]> = {};
  for (const key of PUBLISH_PLATFORMS) {
    const field = source[key];
    if (typeof field !== "object" || field === null) continue;
    const record = field as Record<string, unknown>;
    if (!isPublishMark(record.status)) continue;
    const entry: OverlayPublish = { status: record.status };
    if (typeof record.url === "string" && record.url.trim() !== "") {
      entry.url = sanitizeStoredUrl(record.url);
    }
    if (typeof record.remoteId === "string" && record.remoteId.trim() !== "") {
      entry.remoteId = record.remoteId.trim();
    }
    if (typeof record.draftReceipt === "string" && record.draftReceipt.trim() !== "") {
      entry.draftReceipt = record.draftReceipt.trim();
    }
    if (record.draftStorage === "remote" || record.draftStorage === "browser-local") {
      entry.draftStorage = record.draftStorage;
    }
    if (typeof record.views === "number" && Number.isFinite(record.views)) entry.views = record.views;
    if (typeof record.likes === "number" && Number.isFinite(record.likes)) entry.likes = record.likes;
    if (typeof record.comments === "number" && Number.isFinite(record.comments)) {
      entry.comments = record.comments;
    }
    if (typeof record.syncedAt === "number" && Number.isFinite(record.syncedAt)) {
      entry.syncedAt = record.syncedAt;
    }
    if (record.draftState === "queued"
      || record.draftState === "running"
      || record.draftState === "ready"
      || record.draftState === "error") {
      entry.draftState = record.draftState;
    }
    if (typeof record.draftError === "string" && record.draftError.trim() !== "") {
      entry.draftError = record.draftError.trim();
    }
    if (typeof record.draftStartedAt === "number" && Number.isFinite(record.draftStartedAt)) {
      entry.draftStartedAt = record.draftStartedAt;
    }
    if (typeof record.draftPid === "number" && Number.isInteger(record.draftPid) && record.draftPid > 0) {
      entry.draftPid = record.draftPid;
    }
    if (entry.status === "draft"
      && (entry.url === undefined
        || (entry.remoteId === undefined && entry.draftReceipt === undefined))) {
      entry.status = "unpublished";
    }
    next[key] = entry;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

export function decodeBurnJob(raw: unknown): BurnJob | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  if (record.status !== "running" && record.status !== "done" && record.status !== "error") {
    return undefined;
  }
  const next: BurnJob = { status: record.status };
  if (typeof record.startedAt === "number" && Number.isFinite(record.startedAt)) {
    next.startedAt = record.startedAt;
  }
  if (typeof record.output === "string" && record.output !== "") next.output = record.output;
  if (typeof record.error === "string" && record.error !== "") next.error = record.error;
  if (typeof record.pid === "number" && Number.isInteger(record.pid) && record.pid > 0) {
    next.pid = record.pid;
  }
  return next;
}

function copyOverlayFields(over: OverlayPublish): Pick<
  OverlayPublish,
  "url" | "remoteId" | "draftReceipt" | "draftStorage" | "views" | "likes" | "comments" | "syncedAt" | "draftState" | "draftError" | "draftStartedAt" | "draftPid"
> {
  const next: Pick<OverlayPublish, "url" | "remoteId" | "draftReceipt" | "draftStorage" | "views" | "likes" | "comments" | "syncedAt" | "draftState" | "draftError" | "draftStartedAt" | "draftPid"> = {};
  if (over.url !== undefined) next.url = over.url;
  if (over.remoteId !== undefined) next.remoteId = over.remoteId;
  if (over.draftReceipt !== undefined) next.draftReceipt = over.draftReceipt;
  if (over.draftStorage !== undefined) next.draftStorage = over.draftStorage;
  if (over.views !== undefined) next.views = over.views;
  if (over.likes !== undefined) next.likes = over.likes;
  if (over.comments !== undefined) next.comments = over.comments;
  if (over.syncedAt !== undefined) next.syncedAt = over.syncedAt;
  if (over.draftState !== undefined) next.draftState = over.draftState;
  if (over.draftError !== undefined) next.draftError = over.draftError;
  if (over.draftStartedAt !== undefined) next.draftStartedAt = over.draftStartedAt;
  if (over.draftPid !== undefined) next.draftPid = over.draftPid;
  return next;
}

export async function readFolderPublish(
  folderPath: string,
  names?: readonly string[],
): Promise<ContentPublish> {
  const list = names ?? await readdir(folderPath).catch(() => []);
  const name = pickAutoPublishName(list);
  if (name === undefined) return emptyPublish();
  try {
    const value = JSON.parse(await readFile(join(folderPath, name), "utf8")) as unknown;
    return publishFromAutoPublish(value);
  } catch {
    return emptyPublish();
  }
}
