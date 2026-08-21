import { describe, expect, it } from "vitest";

import { parseVideoDraftOutput } from "../src/draftRunner.ts";

describe("video draft runner output", () => {
  it("只有带远端 id 的页面回读结果才算 B站草稿成功", () => {
    expect(parseVideoDraftOutput([
      "publisher log",
      JSON.stringify({
        ok: true,
        platform: "bilibili",
        verified: true,
        remoteId: "3779145",
        draftUrl: "https://member.bilibili.com/platform/upload/video/frame?type=draft&draftId=3779145",
        taskSpace: "12",
      }),
    ].join("\n"))).toMatchObject({ remoteId: "3779145", taskSpace: "12" });

    expect(() => parseVideoDraftOutput(JSON.stringify({
      ok: true,
      platform: "bilibili",
      verified: false,
      taskSpace: "12",
    }))).toThrow("未通过远端草稿验证");
  });
});
