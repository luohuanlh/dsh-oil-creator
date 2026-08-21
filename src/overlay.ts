import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AUTO_DRAFT_PLATFORMS, draftCapability, isPublishPlatform, normalizeEnabledPlatforms, supportsAutoDraft } from "./platforms.ts";
import { decodeBurnJob, decodeOverlayPublish } from "./publishStatus.ts";
import type { CreatorProfile, OverlayItem, OverlayStore, PlatformAccount, PublishPlatform } from "./types.ts";

export { normalizeEnabledPlatforms } from "./platforms.ts";
export const DEFAULT_ENABLED_PLATFORMS: readonly PublishPlatform[] = AUTO_DRAFT_PLATFORMS;

export function emptyProfile(): CreatorProfile {
  return { enabledPlatforms: [...DEFAULT_ENABLED_PLATFORMS] };
}

export function decodeProfile(value: unknown): CreatorProfile {
  if (typeof value !== "object" || value === null) return emptyProfile();
  const raw = value as Record<string, unknown>;
  if (Array.isArray(raw.enabledPlatforms)) {
    return { enabledPlatforms: normalizeEnabledPlatforms(raw.enabledPlatforms) };
  }
  return emptyProfile();
}

export function profileIsEmpty(profile: CreatorProfile): boolean {
  return profile.enabledPlatforms.length === 0;
}

export function overlayPath(dataDir: string): string {
  return join(dataDir, "overlay.json");
}

export function emptyOverlay(): OverlayStore {
  return { schemaVersion: 1, items: {} };
}

function decodeAccounts(value: unknown): OverlayStore["accounts"] {
  if (typeof value !== "object" || value === null) return undefined;
  const accounts: NonNullable<OverlayStore["accounts"]> = {};
  for (const [rawPlatform, entry] of Object.entries(value as Record<string, unknown>)) {
    const platform = rawPlatform === "wechat" ? "channels" : rawPlatform;
    if (!isPublishPlatform(platform) || typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const status = record.status === "active" || record.status === "expired"
      ? record.status
      : "unknown";
    const account: Omit<PlatformAccount, "platform" | "supportsAutoDraft" | "draftCapability"> = { status };
    if (typeof record.nickname === "string" && record.nickname.trim() !== "") {
      account.nickname = record.nickname.trim();
    }
    if (typeof record.checkedAt === "number" && Number.isFinite(record.checkedAt)) {
      account.checkedAt = record.checkedAt;
    }
    if (typeof record.taskSpace === "string" && record.taskSpace.trim() !== "") {
      account.taskSpace = record.taskSpace.trim();
    }
    accounts[platform] = account;
  }
  return Object.keys(accounts).length === 0 ? undefined : accounts;
}

export function decodeOverlay(value: unknown): OverlayStore {
  if (typeof value !== "object" || value === null) return emptyOverlay();
  const raw = value as Record<string, unknown>;
  const items: Record<string, OverlayItem> = {};
  if (raw.items !== null && typeof raw.items === "object") {
    for (const [id, item] of Object.entries(raw.items as Record<string, unknown>)) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      const next: OverlayItem = {};
      if (typeof record.title === "string" && record.title.length > 0) {
        next.title = record.title;
      }
      if (record.readyToRecord === true) next.readyToRecord = true;
      if (typeof record.studioPath === "string" && record.studioPath.length > 0) {
        next.studioPath = record.studioPath;
      }
      if (record.waitingForExport === true) next.waitingForExport = true;
      if (record.exportTimedOut === true) next.exportTimedOut = true;
      const publish = decodeOverlayPublish(record.publish);
      if (publish !== undefined) next.publish = publish;
      const burn = decodeBurnJob(record.burn);
      if (burn !== undefined) next.burn = burn;
      const subtitleJob = decodeBurnJob(record.subtitleJob);
      if (subtitleJob !== undefined) next.subtitleJob = subtitleJob;
      const coverJob = decodeBurnJob(record.coverJob);
      if (coverJob !== undefined) next.coverJob = coverJob;
      items[id] = next;
    }
  }
  const store = emptyOverlay();
  store.items = items;
  if (typeof raw.libraryRoot === "string" && raw.libraryRoot.length > 0) {
    store.libraryRoot = raw.libraryRoot;
  }
  if (typeof raw.profile === "object" && raw.profile !== null) {
    store.profile = decodeProfile(raw.profile);
  }
  const accounts = decodeAccounts(raw.accounts);
  if (accounts !== undefined) store.accounts = accounts;
  return store;
}

export function accountsFromOverlay(store: OverlayStore): PlatformAccount[] {
  const accounts = store.accounts ?? {};
  return Object.entries(accounts).flatMap(([platform, account]) => {
    if (!isPublishPlatform(platform) || account === undefined) return [];
    return [{
      platform,
      status: account.status,
      ...(account.nickname === undefined ? {} : { nickname: account.nickname }),
      ...(account.checkedAt === undefined ? {} : { checkedAt: account.checkedAt }),
      ...(account.taskSpace === undefined ? {} : { taskSpace: account.taskSpace }),
      supportsAutoDraft: supportsAutoDraft(platform),
      draftCapability: draftCapability(platform),
    }];
  });
}

export async function loadOverlay(dataDir: string): Promise<OverlayStore> {
  try {
    const raw = await readFile(overlayPath(dataDir), "utf8");
    return decodeOverlay(JSON.parse(raw) as unknown);
  } catch {
    return emptyOverlay();
  }
}

const overlayTails = new Map<string, Promise<void>>();

export function withOverlayLock<T>(dataDir: string, work: () => Promise<T>): Promise<T> {
  const previous = overlayTails.get(dataDir) ?? Promise.resolve();
  const run = previous.then(work, work);
  overlayTails.set(dataDir, run.then(() => undefined, () => undefined));
  return run;
}

export async function saveOverlay(dataDir: string, store: OverlayStore): Promise<void> {
  const path = overlayPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temp, path);
}
