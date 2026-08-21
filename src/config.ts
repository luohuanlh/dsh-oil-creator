import { homedir } from "node:os";
import { join } from "node:path";

import Schema from "@deepseek-ai/schemastery";

export interface Config {
  libraryRoot: string;
  dataDir: string;
}

export function defaultLibraryRoot(platform: NodeJS.Platform = process.platform): string {
  const videos = platform === "darwin" ? "Movies" : "Videos";
  return join(homedir(), videos, "视频项目");
}

export function defaultDataDir(): string {
  return join(homedir(), ".dsh-oil-creator");
}

export function skillDirCandidates(skillName: string, home = homedir()): string[] {
  return [
    join(home, ".claude", "skills", skillName),
    join(home, ".codex", "skills", skillName),
    join(home, ".agents", "skills", skillName),
    join(home, ".grok", "skills", skillName),
  ];
}

function joinUnderHome(home: string, rest: string): string {
  return join(home, ...rest.replaceAll("\\", "/").split("/").filter(Boolean));
}

export function expandHomePath(path: string, home = homedir()): string {
  const trimmed = path.trim();
  if (trimmed === "~" || trimmed === "%USERPROFILE%" || trimmed === "%HOME%") return home;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return joinUnderHome(home, trimmed.slice(2));
  const windowsHome = /^%(?:USERPROFILE|HOME)%([\\/].*)?$/i.exec(trimmed);
  if (windowsHome !== null) {
    const rest = windowsHome[1];
    return rest === undefined || rest === "" ? home : joinUnderHome(home, rest);
  }
  return trimmed;
}

/** @deprecated Use {@link defaultLibraryRoot}. Kept so existing imports keep working. */
export const DEFAULT_LIBRARY_ROOT = defaultLibraryRoot();

export const Config: Schema<Config> = Schema.object({
  libraryRoot: Schema.string().default(defaultLibraryRoot()),
  dataDir: Schema.string().default(defaultDataDir()),
});

export function resolveDataDir(config: Config): string {
  return config.dataDir === "" ? defaultDataDir() : config.dataDir;
}
