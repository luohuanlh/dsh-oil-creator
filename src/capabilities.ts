import { constants, existsSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { skillDirCandidates } from "./config.ts";
import { egoInstallCandidates, extraBinDirs, pathEnvValue } from "./runtimePaths.ts";
import type {
  CreatorCapabilities,
  CreatorCapability,
  CreatorSetupStatus,
  LibrarySettings,
} from "./types.ts";

interface InspectCreatorSetupOptions {
  libraryRoot: string;
  dataDir: string;
  settings: LibrarySettings;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  findSkillDir?: (skillName: string) => string | undefined;
}

export function defaultFindSkillDir(skillName: string, home = homedir()): string | undefined {
  for (const candidate of skillDirCandidates(skillName, home)) {
    if (existsSync(join(candidate, "SKILL.md"))) return candidate;
    const nested = join(candidate, skillName);
    if (existsSync(join(nested, "SKILL.md"))) return nested;
  }
  return undefined;
}

function capability(
  state: CreatorCapability["state"],
  required: boolean,
  detail: string,
  path?: string,
): CreatorCapability {
  return path === undefined
    ? { state, required, detail }
    : { state, required, detail, path };
}

async function libraryCapability(path: string): Promise<CreatorCapability> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) {
    return capability("missing", true, "内容目录不存在，需要先选择或创建目录。", path);
  }
  const writable = await access(path, constants.R_OK | constants.W_OK)
    .then(() => true, () => false);
  return writable
    ? capability("ready", true, "内容目录可读写。", path)
    : capability("missing", true, "内容目录存在，但当前进程没有读写权限。", path);
}

function skillCapability(
  findSkillDir: (skillName: string) => string | undefined,
  skillName: string,
  readyDetail: string,
): CreatorCapability {
  const found = findSkillDir(skillName);
  return found === undefined
    ? capability("missing", false, `未发现 ${skillName}。`)
    : capability("ready", false, readyDetail, found);
}

export async function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): Promise<string | undefined> {
  const extensions = platform === "win32"
    ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)]
    : [""];
  const mode = platform === "win32" ? constants.F_OK : constants.X_OK;
  const directories = [
    ...pathEnvValue(env).split(delimiter).filter(Boolean),
    ...extraBinDirs(platform, home, env),
  ];
  for (const directory of directories) {
    for (const extension of extensions) {
      const fileName = platform === "win32" && extension !== ""
        ? `${command}${extension}`
        : command;
      const path = join(directory, fileName);
      if (await access(path, mode).then(() => true, () => false)) return path;
    }
  }
  return undefined;
}

async function findEgo(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): Promise<{ path: string; kind: "cli" | "app" } | undefined> {
  const cli = await findExecutable("ego-browser", env, platform, home);
  if (cli !== undefined) return { path: cli, kind: "cli" };
  for (const path of egoInstallCandidates(platform, home, env)) {
    if (await access(path).then(() => true, () => false)) return { path, kind: "app" };
  }
  return undefined;
}

function egoCapability(
  found: { path: string; kind: "cli" | "app" } | undefined,
): CreatorCapability {
  if (found === undefined) {
    return capability("missing", true, "未发现 Ego Browser；平台绑定和自动草稿不可用。");
  }
  if (found.kind === "app") {
    return capability(
      "missing",
      true,
      "已发现 Ego Lite 应用，但 PATH 里没有 ego-browser 命令。",
      found.path,
    );
  }
  return capability("ready", true, "已发现 Ego Browser，可绑定平台账号并运行草稿流程。", found.path);
}

function recommendationsOf(capabilities: CreatorCapabilities): string[] {
  const recommendations: string[] = [];
  if (capabilities.library.state !== "ready") {
    recommendations.push("先选择一个可读写的内容目录。");
  }
  if (capabilities.egoBrowser.state !== "ready") {
    recommendations.push("安装 Ego Browser（https://lite.ego.app）并保证 PATH 中存在 ego-browser。");
  }
  if (capabilities.autoPublish.state !== "ready") {
    recommendations.push("安装 video-publisher Skill，自动草稿只会停在最终发表前。");
  }
  return recommendations;
}

export async function inspectCreatorSetup(
  options: InspectCreatorSetupOptions,
): Promise<CreatorSetupStatus> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const findSkillDir = options.findSkillDir ?? ((name: string) => defaultFindSkillDir(name, home));
  const capabilities: CreatorCapabilities = {
    library: await libraryCapability(options.libraryRoot),
    autoPublish: skillCapability(
      findSkillDir,
      "video-publisher",
      "已发现自动发布工作流；支持的平台会生成草稿并停在最终发表前。",
    ),
    article: capability(
      "ready",
      false,
      "已内置微信公众号图文草稿适配器；实际运行仍需要 Ego Browser 登录态。",
    ),
    egoBrowser: egoCapability(await findEgo(platform, env, home)),
  };
  return {
    platform,
    dataDir: options.dataDir,
    settings: options.settings,
    capabilities,
    recommendations: recommendationsOf(capabilities),
  };
}
