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

  it("抖音必须同时回读 draft 入口标题与 video_id", () => {
    expect(parseVideoDraftOutput(JSON.stringify({
      ok: true,
      platform: "douyin",
      verified: true,
      remoteId: "v0200fg10000demo",
      draftUrl: "https://creator.douyin.com/creator-micro/content/post/video?enter_from=draft",
      taskSpace: "5",
    }), "douyin")).toMatchObject({
      platform: "douyin",
      remoteId: "v0200fg10000demo",
      taskSpace: "5",
    });

    expect(() => parseVideoDraftOutput(JSON.stringify({
      ok: true,
      platform: "bilibili",
      verified: true,
      remoteId: "42",
      draftUrl: "https://example.com/draft/42",
      taskSpace: "5",
    }), "douyin")).toThrow("抖音草稿结果不完整");
  });
});
