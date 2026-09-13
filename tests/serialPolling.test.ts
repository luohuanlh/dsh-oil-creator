import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSerialPolling } from "../src/client/serialPolling.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("工作台草稿轮询", () => {
  it("慢请求期间不重叠发送，结束后继续刷新", async () => {
    const pending = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue("new");
    const onValue = vi.fn();
    const stop = startSerialPolling({ read, onValue, onError: vi.fn(), intervalMs: 100 });
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(read).toHaveBeenCalledTimes(1);
      pending.resolve("first");
      await vi.advanceTimersByTimeAsync(100);
      expect(onValue.mock.calls).toEqual([["first"], ["new"]]);
      expect(read).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it.each(["成功", "失败"])("切换内容停止轮询后，忽略旧请求的%s回调", async (outcome) => {
    const pending = deferred<string>();
    const onValue = vi.fn();
    const onError = vi.fn();
    const read = vi.fn(() => pending.promise);
    const stop = startSerialPolling({ read, onValue, onError, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    stop();
    if (outcome === "成功") pending.resolve("旧内容");
    else pending.reject(new Error("旧请求失败"));
    await vi.advanceTimersByTimeAsync(500);
    expect(onValue).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("临时失败后下一轮仍能成功", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    const onValue = vi.fn();
    const onError = vi.fn();
    const stop = startSerialPolling({ read, onValue, onError, intervalMs: 100 });
    try {
      await vi.advanceTimersByTimeAsync(200);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onValue).toHaveBeenCalledWith("recovered");
    } finally { stop(); }
  });
});
