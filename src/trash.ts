import { execFile } from "node:child_process";

export interface TrashCommandOptions {
  env?: NodeJS.ProcessEnv;
}

export type TrashCommandRunner = (
  command: string,
  args: string[],
  options?: TrashCommandOptions,
) => Promise<void>;

export interface MovePathToTrashOptions {
  platform?: NodeJS.Platform;
  run?: TrashCommandRunner;
}

const MACOS_TRASH_SCRIPT = [
  "on run argv",
  "set targetPath to item 1 of argv",
  "set targetItem to POSIX file targetPath as alias",
  'tell application "Finder"',
  "delete targetItem",
  "end tell",
  "end run",
].join("\n");

const WINDOWS_TRASH_SCRIPT = [
  "Add-Type -AssemblyName Microsoft.VisualBasic",
  "$target = [Environment]::GetEnvironmentVariable('DSH_OIL_TRASH_TARGET')",
  "if ([string]::IsNullOrWhiteSpace($target)) { throw '未提供要删除的路径' }",
  "$uiOption = [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs",
  "$recycleOption = [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin",
  "if (Test-Path -LiteralPath $target -PathType Container) {",
  "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, $uiOption, $recycleOption)",
  "} elseif (Test-Path -LiteralPath $target -PathType Leaf) {",
  "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, $uiOption, $recycleOption)",
  "} else {",
  "  throw \"目标路径不存在或不是普通文件/目录：$target\"",
  "}",
].join("\n");

function runTrashCommand(
  command: string,
  args: string[],
  options: TrashCommandOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, env: options.env }, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });
}

/** 把单个精确路径交给操作系统回收站，不经过 shell 字符串拼接。 */
export async function movePathToTrash(
  path: string,
  options: MovePathToTrashOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runTrashCommand;
  try {
    if (platform === "darwin") {
      await run("/usr/bin/osascript", ["-e", MACOS_TRASH_SCRIPT, "--", path]);
      return;
    }
    if (platform === "win32") {
      await run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_TRASH_SCRIPT],
        {
          env: {
            ...process.env,
            DSH_OIL_TRASH_TARGET: path,
          },
        },
      );
      return;
    }
    await run("gio", ["trash", "--", path]);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`无法移到系统废纸篓：${detail}`);
  }
}
