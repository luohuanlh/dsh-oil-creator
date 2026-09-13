import { describe, expect, it } from "vitest";
import { reconcileInterruptedDrafts } from "../src/draftState.ts";
import { decodeOverlay } from "../src/overlay.ts";

describe("草稿任务恢复", () => {
  it("保留当前服务拥有的队列任务和等待结果写回的任务", () => {
    const overlay = decodeOverlay({ items: { demo: { publish: {
      zhihu: { status: "unpublished", draftState: "queued" },
      baijiahao: { status: "unpublished", draftState: "running", draftPid: 42 },
    } } } });
    expect(reconcileInterruptedDrafts(overlay, new Set(["demo:zhihu", "demo:baijiahao"]), () => false))
      .toBe(false);
    expect(overlay.items.demo?.publish?.zhihu?.draftState).toBe("queued");
    expect(overlay.items.demo?.publish?.baijiahao?.draftState).toBe("running");
  });

  it("重启后清理丢失的排队、旧版无 PID 任务和死亡进程，保留存活进程及成功草稿", () => {
    const overlay = decodeOverlay({ items: { demo: { publish: {
      zhihu: { status: "unpublished", draftState: "queued" },
      baijiahao: { status: "unpublished", draftState: "running" },
      weibo: { status: "unpublished", draftState: "running", draftPid: 41 },
      bilibili: { status: "unpublished", draftState: "running", draftPid: 42 },
      douyin: { status: "draft", remoteId: "saved", url: "https://example.com/draft" },
    } } } });
    expect(reconcileInterruptedDrafts(overlay, new Set(), (pid) => pid === 42)).toBe(true);
    for (const platform of ["zhihu", "baijiahao", "weibo"] as const) {
      expect(overlay.items.demo?.publish?.[platform]).toMatchObject({
        draftState: "error", draftError: "上次草稿任务已中断，请重新启动",
      });
      expect(overlay.items.demo?.publish?.[platform]).not.toHaveProperty("draftPid");
    }
    expect(overlay.items.demo?.publish?.bilibili?.draftState).toBe("running");
    expect(overlay.items.demo?.publish?.douyin?.status).toBe("draft");
    expect(reconcileInterruptedDrafts(overlay, new Set(), (pid) => pid === 42)).toBe(false);
  });
});
