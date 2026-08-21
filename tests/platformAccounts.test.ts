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
});
