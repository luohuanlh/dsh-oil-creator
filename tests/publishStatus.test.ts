import { describe, expect, it } from "vitest";

import { decodeOverlay } from "../src/overlay.ts";
import {
  emptyPublish,
  mapPublisherStatus,
  mergePublish,
  pickAutoPublishName,
  publishFromAutoPublish,
} from "../src/publishStatus.ts";

describe("mapPublisherStatus", () => {
  it("keeps page READY distinct from remote draft and maps live to published", () => {
    expect(mapPublisherStatus("ready")).toBe("unpublished");
    expect(mapPublisherStatus("READY")).toBe("unpublished");
    expect(mapPublisherStatus("draft")).toBe("unpublished");
    expect(mapPublisherStatus("published")).toBe("published");
    expect(mapPublisherStatus("blocked")).toBe("unpublished");
    expect(mapPublisherStatus("needs_mutation")).toBe("unpublished");
  });
});

describe("publishFromAutoPublish", () => {
  it("reads wechat_channels as channels", () => {
    const publish = publishFromAutoPublish({
      publisher: {
        platforms: {
          xiaohongshu: { status: "ready" },
          wechat_channels: { status: "live", url: "https://channels.example/1" },
        },
      },
    });
    expect(publish.xiaohongshu).toEqual({
      status: "unpublished",
      source: "publisher",
      draftState: "ready",
    });
    expect(publish.channels).toEqual({
      status: "published",
      source: "publisher",
      url: "https://channels.example/1",
    });
    expect(publish.douyin.status).toBe("unpublished");
  });

  it("returns empty when the sidecar has no publisher block", () => {
    expect(publishFromAutoPublish({ title: "x" })).toEqual(emptyPublish());
  });

  it("远端 ID 或已验证动作回执配合 URL 才能标记草稿", () => {
    const publish = publishFromAutoPublish({
      publisher: {
        platforms: {
          bilibili: { status: "draft" },
          channels: {
            status: "draft",
            draftReceipt: "channels:save-draft:task-space:23",
            url: "https://channels.example/draft/42",
          },
        },
      },
    });

    expect(publish.bilibili.status).toBe("unpublished");
    expect(publish.channels).toEqual({
      status: "draft",
      source: "publisher",
      url: "https://channels.example/draft/42",
      draftReceipt: "channels:save-draft:task-space:23",
    });
  });
});

describe("mergePublish", () => {
  it("keeps overlay over the sidecar", () => {
    const file = publishFromAutoPublish({
      publisher: { platforms: { xiaohongshu: { status: "ready" } } },
    });
    expect(mergePublish(file, { xiaohongshu: { status: "unpublished" } }).xiaohongshu).toEqual({
      status: "unpublished",
      source: "overlay",
    });
  });
});

describe("pickAutoPublishName", () => {
  it("prefers the canonical name", () => {
    expect(pickAutoPublishName(["foo.auto-publish.json", "auto-publish.json"]))
      .toBe("auto-publish.json");
    expect(pickAutoPublishName(["a.srt", "title.auto-publish.json"]))
      .toBe("title.auto-publish.json");
  });
});

describe("decodeOverlay", () => {
  it("keeps publish and burn fields", () => {
    const store = decodeOverlay({
      schemaVersion: 1,
      items: {
        demo: {
          publish: { douyin: { status: "published", url: "https://v.douyin.com/x" } },
          burn: { status: "running", pid: 12, output: "/tmp/a_subtitled.mp4" },
        },
      },
    });
    expect(store.items.demo?.publish).toEqual({
      douyin: { status: "published", url: "https://v.douyin.com/x" },
    });
    expect(store.items.demo?.burn).toEqual({
      status: "running",
      pid: 12,
      output: "/tmp/a_subtitled.mp4",
    });
  });

  it("保留页面已备但未远端保存的中间态", () => {
    const store = decodeOverlay({
      schemaVersion: 1,
      items: {
        demo: {
          publish: { douyin: { status: "unpublished", draftState: "ready" } },
        },
      },
    });
    expect(store.items.demo?.publish?.douyin)
      .toEqual({ status: "unpublished", draftState: "ready" });
  });

  it("拒绝无远端证据的 overlay 草稿并清除历史 URL 凭据", () => {
    const store = decodeOverlay({
      items: {
        demo: {
          publish: {
            bilibili: { status: "draft" },
            "wechat-mp": {
              status: "draft",
              remoteId: "42",
              url: "https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=42&token=secret-token",
            },
          },
        },
      },
    });

    expect(store.items.demo?.publish?.bilibili?.status).toBe("unpublished");
    expect(store.items.demo?.publish?.["wechat-mp"]).toMatchObject({
      status: "draft",
      remoteId: "42",
    });
    expect(store.items.demo?.publish?.["wechat-mp"]?.url).not.toContain("token=");
  });

  it("保留带动作回执的视频草稿", () => {
    const store = decodeOverlay({
      items: {
        demo: {
          publish: {
            xiaohongshu: {
              status: "draft",
              url: "https://creator.xiaohongshu.com/publish/publish",
              draftReceipt: "xiaohongshu:temporary-leave:task-space:21",
            },
          },
        },
      },
    });

    expect(store.items.demo?.publish?.xiaohongshu).toMatchObject({
      status: "draft",
      draftReceipt: "xiaohongshu:temporary-leave:task-space:21",
    });
  });

  it("保留小红书图文笔记的浏览器本地存储范围", () => {
    const store = decodeOverlay({
      items: {
        demo: {
          publish: {
            "xiaohongshu-note": {
              status: "draft",
              url: "https://creator.xiaohongshu.com/publish/publish?target=image",
              draftReceipt: "xiaohongshu-note:browser-local:local-42",
              draftStorage: "browser-local",
            },
          },
        },
      },
    });

    expect(store.items.demo?.publish?.["xiaohongshu-note"]).toMatchObject({
      status: "draft",
      draftReceipt: "xiaohongshu-note:browser-local:local-42",
      draftStorage: "browser-local",
    });
  });
});
