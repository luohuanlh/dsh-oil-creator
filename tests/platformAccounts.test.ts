import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  parsePlatformAccountOutput,
  withMissingTaskSpaceFallback,
} from "../src/platformAccounts.ts";

describe("parsePlatformAccountOutput", () => {
  it("读取 Ego Browser 输出的最后一个账号结果", () => {
    expect(parsePlatformAccountOutput([
      "opening platform",
      JSON.stringify({ platform: "zhihu", status: "active" }),
    ].join("\n"))).toEqual({ platform: "zhihu", status: "active" });
  });

  it("没有结构化结果时明确失败", () => {
    expect(() => parsePlatformAccountOutput("browser failed")).toThrow("未返回平台账号状态");
  });

  it("已保存的任务空间不存在时自动使用新的检查空间重试", async () => {
    const run = vi.fn(async (taskSpace?: string) => {
      if (taskSpace !== undefined) throw new Error(`task space not found: ${taskSpace}`);
      return { status: "active" as const };
    });

    await expect(withMissingTaskSpaceFallback("4", run))
      .resolves.toEqual({ status: "active" });
    expect(run.mock.calls).toEqual([["4"], [undefined]]);
  });

  it("非任务空间错误不盲目重试", async () => {
    const run = vi.fn(async () => { throw new Error("network unavailable"); });
    await expect(withMissingTaskSpaceFallback("4", run)).rejects.toThrow("network unavailable");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("接管已有任务空间时不依赖 takeOverTaskSpace 的返回值", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../scripts/platform-account.mjs", import.meta.url)),
      "utf8",
    );
    const output: string[] = [];
    const takeOverTaskSpace = vi.fn(async () => undefined);
    const useOrCreateTaskSpace = vi.fn(async () => ({ id: 10 }));
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
      ...args: string[]
    ) => (...values: unknown[]) => Promise<void>;
    const execute = new AsyncFunction(
      "OIL_ACCOUNT_PLATFORM",
      "OIL_ACCOUNT_MODE",
      "OIL_ACCOUNT_LOGIN_URL",
      "OIL_ACCOUNT_WORKSPACE_URL",
      "OIL_ACCOUNT_SPACE",
      "OIL_ACCOUNT_RESUME",
      "cliLog",
      "takeOverTaskSpace",
      "useOrCreateTaskSpace",
      "openOrReuseTab",
      "handOffTaskSpace",
      "wait",
      "pageInfo",
      "snapshotText",
      "process",
      source,
    );

    await execute(
      "xiaohongshu",
      "check",
      "https://creator.xiaohongshu.com/login",
      "https://creator.xiaohongshu.com/publish/publish",
      "9",
      true,
      (value: unknown) => { output.push(String(value)); },
      takeOverTaskSpace,
      useOrCreateTaskSpace,
      async () => undefined,
      async () => ({ done: true }),
      async () => undefined,
      async () => ({ url: "https://creator.xiaohongshu.com/publish/publish" }),
      async () => "上传视频",
      process,
    );

    expect(takeOverTaskSpace).toHaveBeenCalledWith("9");
    expect(useOrCreateTaskSpace).not.toHaveBeenCalled();
    expect(output.map((line) => JSON.parse(line))).toContainEqual({
      platform: "xiaohongshu",
      status: "active",
      taskSpace: "9",
    });
  });
});
