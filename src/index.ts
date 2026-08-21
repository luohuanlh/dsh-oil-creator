import type { Context } from "@deepseek-ai/cordis";

import { Config } from "./config.ts";
import { registerCreatorWorkbenchSkill } from "./creatorSkill.ts";
import { registerLibraryPrompt } from "./libraryPrompt.ts";
import { OilCreatorService } from "./service.ts";
import { registerCreatorSettingsNamespace } from "./settingsHost.ts";
import { registerCreatorTools } from "./tools.ts";

export const name = "dsh-oil-creator";
export const inject = ["settings", "tools", "systemPrompt", "skills"];
export { Config };
export type { Config as ConfigType } from "./config.ts";

export function apply(ctx: Context, config: Config): void {
  const host = ctx as Context
    & { settings: Parameters<typeof registerCreatorSettingsNamespace>[0] }
    & Parameters<typeof registerCreatorTools>[0]
    & Parameters<typeof registerLibraryPrompt>[0]
    & Parameters<typeof registerCreatorWorkbenchSkill>[0];
  const service = new OilCreatorService(ctx, config);
  registerCreatorSettingsNamespace(host.settings);
  registerCreatorTools(host, service);
  registerLibraryPrompt(host, service);
  registerCreatorWorkbenchSkill(host);
}
