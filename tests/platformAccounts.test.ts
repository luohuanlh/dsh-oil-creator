import { describe, expect, it } from "vitest";

import { parsePlatformAccountOutput } from "../src/platformAccounts.ts";

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
});
