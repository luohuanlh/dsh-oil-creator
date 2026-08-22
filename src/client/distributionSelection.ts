import { PUBLISH_PLATFORM_DEFINITIONS, type PlatformKind } from "../platforms.ts";
import type { PlatformAccount, PublishPlatform } from "../types.ts";

const VIDEO_WORKFLOW_DISPLAY_ORDER: Partial<Record<PublishPlatform, number>> = {
  bilibili: 0,
  channels: 1,
  xiaohongshu: 2,
  douyin: 3,
  kuaishou: 4,
};

export function orderDistributionPlatforms(
  platforms: readonly PublishPlatform[],
): PublishPlatform[] {
  return platforms
    .map((platform, index) => ({ platform, index }))
    .sort((left, right) =>
      (VIDEO_WORKFLOW_DISPLAY_ORDER[left.platform] ?? Number.MAX_SAFE_INTEGER)
      - (VIDEO_WORKFLOW_DISPLAY_ORDER[right.platform] ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    )
    .map(({ platform }) => platform);
}

/**
 * 工作台同时呈现可运行平台与尚未接入运行器的平台。
 * 后者只用于说明能力边界，不会进入默认选择或草稿队列。
 */
export function visibleDistributionPlatforms(
  kind: PlatformKind,
  enabledPlatforms: readonly PublishPlatform[],
): PublishPlatform[] {
  const visible = enabledPlatforms.filter((platform) =>
    PUBLISH_PLATFORM_DEFINITIONS[platform].kind === kind
  );
  if (kind === "video" && !visible.includes("kuaishou")) visible.push("kuaishou");
  return orderDistributionPlatforms(visible);
}

export function defaultDistributionPlatforms(
  availablePlatforms: readonly PublishPlatform[],
  accounts: readonly PlatformAccount[],
): PublishPlatform[] {
  const active = new Set(
    accounts
      .filter((account) => account.status === "active")
      .map((account) => account.platform),
  );
  return availablePlatforms.filter((platform) => active.has(platform));
}
