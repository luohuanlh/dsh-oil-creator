import type { PlatformPublish, PublishPlatform } from "../types.ts";

export interface DraftProgress {
  saved: number;
  total: number;
  label: string;
  hasSaved: boolean;
}

export function remoteDraftProgress(
  platforms: readonly PublishPlatform[],
  publish: Partial<Record<PublishPlatform, Pick<PlatformPublish, "status">>>,
): DraftProgress {
  const saved = platforms.filter((platform) => {
    const status = publish[platform]?.status;
    return status === "draft" || status === "published";
  }).length;
  const total = platforms.length;
  return { saved, total, label: `${saved}/${total}`, hasSaved: saved > 0 };
}
