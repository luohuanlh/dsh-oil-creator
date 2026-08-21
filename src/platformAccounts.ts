import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLISH_PLATFORM_DEFINITIONS } from "./platforms.ts";
import type {
  OpenPlatformAccountResult,
  PlatformAccountStatus,
  PublishPlatform,
} from "./types.ts";

export function platformAccountScriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "platform-account.mjs");
}

export async function resolvePlatformAccountScript(preferred?: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [
    preferred,
    join(here, "platform-account.mjs"),
    join(here, "..", "scripts", "platform-account.mjs"),
  ]) {
    if (path === undefined) continue;
    if (await access(path).then(() => true, () => false)) return path;
  }
  throw new Error("platform-account.mjs is missing; rebuild dsh-oil-creator");
}

interface AccountScriptResult {
  platform: PublishPlatform;
  started?: boolean;
  taskSpace?: string;
  status?: PlatformAccountStatus;
  error?: string;
}

export function parsePlatformAccountOutput(raw: string): AccountScriptResult {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) continue;
    try {
      const result = JSON.parse(line) as AccountScriptResult;
      if (typeof result.platform !== "string") continue;
      return result;
    } catch {
      continue;
    }
  }
  throw new Error("Ego Browser 未返回平台账号状态");
}

export async function withMissingTaskSpaceFallback<T>(
  taskSpace: string | undefined,
  run: (taskSpace?: string) => Promise<T>,
): Promise<T> {
  if (taskSpace === undefined) return run(undefined);
  try {
    return await run(taskSpace);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!/task space not found/i.test(message)) throw cause;
    return run(undefined);
  }
}

async function runPlatformAccountScript(
  platform: PublishPlatform,
  mode: "open" | "check",
  signal: AbortSignal,
  taskSpace?: string,
): Promise<AccountScriptResult> {
  const definition = PUBLISH_PLATFORM_DEFINITIONS[platform];
  const source = await readFile(await resolvePlatformAccountScript(), "utf8");
  const space = taskSpace ?? `oil-account-${platform}-${Date.now()}`;
  const prelude = [
    `var OIL_ACCOUNT_PLATFORM = ${JSON.stringify(platform)};`,
    `var OIL_ACCOUNT_MODE = ${JSON.stringify(mode)};`,
    `var OIL_ACCOUNT_LOGIN_URL = ${JSON.stringify(definition.loginUrl)};`,
    `var OIL_ACCOUNT_WORKSPACE_URL = ${JSON.stringify(definition.workspaceUrl)};`,
    `var OIL_ACCOUNT_SPACE = ${JSON.stringify(space)};`,
    `var OIL_ACCOUNT_RESUME = ${JSON.stringify(taskSpace !== undefined)};`,
  ].join("\n");
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const child = spawn("ego-browser", ["nodejs"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(`${prelude}\n${source}`);
    const onAbort = (): void => { child.kill("SIGTERM"); };
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (cause) => {
      signal.removeEventListener("abort", onAbort);
      const code = (cause as NodeJS.ErrnoException).code;
      reject(code === "ENOENT" ? new Error("未找到 ego-browser，请先安装 Ego Lite") : cause);
    });
    child.once("exit", async (code) => {
      signal.removeEventListener("abort", onAbort);
      const raw = `${stdout}\n${stderr}`;
      try {
        const result = parsePlatformAccountOutput(raw);
        if (mode === "check" && result.taskSpace !== undefined) {
          await completePlatformAccountTask(result.taskSpace).catch(() => undefined);
        }
        if (result.error !== undefined && result.status === "unknown") {
          reject(new Error(result.error));
          return;
        }
        resolve(result);
      } catch (cause) {
        const detail = raw.trim() === "" ? `ego-browser exited ${code}` : raw.trim().slice(-500);
        reject(new Error(`${cause instanceof Error ? cause.message : String(cause)}: ${detail}`));
      }
    });
  });
}

/**
 * Ego Browser 要求完成任务空间的动作独占一次调用。账号检查已经输出结果后，
 * Host 再用这段专用脚本关闭检查空间，避免把清理混进页面检查步骤。
 */
async function completePlatformAccountTask(taskSpace: string): Promise<void> {
  const source = [
    `const result = await completeTaskSpace(${JSON.stringify(taskSpace)}, { keep: false });`,
    "cliLog(JSON.stringify(result));",
  ].join("\n");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "ignore", "ignore"] });
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(source);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Ego Browser 任务空间清理失败：${code}`));
    });
  });
}

export async function openPlatformAccount(
  platform: PublishPlatform,
  signal: AbortSignal,
): Promise<OpenPlatformAccountResult> {
  const result = await runPlatformAccountScript(platform, "open", signal);
  return {
    platform,
    started: result.started === true,
    ...(result.taskSpace === undefined ? {} : { taskSpace: result.taskSpace }),
  };
}

export async function checkPlatformAccount(
  platform: PublishPlatform,
  signal: AbortSignal,
  taskSpace?: string,
): Promise<PlatformAccountStatus> {
  const result = await withMissingTaskSpaceFallback(
    taskSpace,
    (currentTaskSpace) => runPlatformAccountScript(
      platform,
      "check",
      signal,
      currentTaskSpace,
    ),
  );
  return result.status ?? "unknown";
}
