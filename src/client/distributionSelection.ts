import type { PlatformAccount, PublishPlatform } from "../types.ts";

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
