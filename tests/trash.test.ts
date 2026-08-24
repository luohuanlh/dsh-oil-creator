import { describe, expect, it, vi } from "vitest";

import { movePathToTrash, type TrashCommandOptions } from "../src/trash.ts";

describe("movePathToTrash", () => {
  it("macOS 通过 Finder 把精确路径移到废纸篓", async () => {
    const run = vi.fn(async (_command: string, _args: string[]) => undefined);

    await movePathToTrash("/Volumes/media/2026-08-24_测试", {
      platform: "darwin",
      run,
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toBe("/usr/bin/osascript");
    expect(run.mock.calls[0]?.[1]).toContain("/Volumes/media/2026-08-24_测试");
    const script = run.mock.calls[0]?.[1].join("\n") ?? "";
    const resolveAliasAt = script.indexOf("set targetItem to POSIX file targetPath as alias");
    const tellFinderAt = script.indexOf('tell application "Finder"');
    expect(resolveAliasAt).toBeGreaterThanOrEqual(0);
    expect(resolveAliasAt).toBeLessThan(tellFinderAt);
    expect(script).toContain("delete targetItem");
    expect(script).not.toContain("delete POSIX file targetPath");
  });

  it("Linux 使用系统回收站命令且不拼接 shell 字符串", async () => {
    const linuxRun = vi.fn(async (_command: string, _args: string[]) => undefined);

    await movePathToTrash("/tmp/a;still-one-path", { platform: "linux", run: linuxRun });

    expect(linuxRun).toHaveBeenCalledWith("gio", ["trash", "--", "/tmp/a;still-one-path"]);
  });

  it("Windows 通过环境变量传递中文与特殊字符路径", async () => {
    const windowsRun = vi.fn(
      async (
        _command: string,
        _args: string[],
        _options?: TrashCommandOptions,
      ) => undefined,
    );
    const target = "C:\\素材\\一期 & $draft";

    await movePathToTrash(target, { platform: "win32", run: windowsRun });

    expect(windowsRun.mock.calls[0]?.[0]).toBe("powershell.exe");
    const args = windowsRun.mock.calls[0]?.[1] ?? [];
    const command = args.join("\n");
    const options = windowsRun.mock.calls[0]?.[2];
    expect(args).not.toContain(target);
    expect(options?.env?.DSH_OIL_TRASH_TARGET).toBe(target);
    expect(command).toContain("[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs");
    expect(command).toContain("[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin");
    expect(command).toContain("Test-Path -LiteralPath $target -PathType Container");
    expect(command).toContain("Test-Path -LiteralPath $target -PathType Leaf");
  });

  it("系统回收站命令失败时返回可诊断错误", async () => {
    const run = vi.fn(async () => {
      throw new Error("Access denied");
    });

    await expect(
      movePathToTrash("C:\\素材\\一期", { platform: "win32", run }),
    ).rejects.toThrow("无法移到系统废纸篓：Access denied");
  });
});
