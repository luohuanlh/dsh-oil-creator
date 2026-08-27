import { describe, expect, it, vi } from "vitest";

import { BoundedTaskQueue } from "../src/boundedTaskQueue.ts";

describe("BoundedTaskQueue", () => {
  it("始终把活跃任务限制在配置并发数以内", async () => {
    const queue = new BoundedTaskQueue(2);
    const started: number[] = [];
    const finish = new Map<number, () => void>();
    let active = 0;
    let peak = 0;
    const runs = Array.from({ length: 5 }, (_, index) => queue.enqueue(async () => {
      started.push(index);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => { finish.set(index, resolve); });
      active -= 1;
      return index;
    }));

    await vi.waitFor(() => { expect(started).toEqual([0, 1]); });
    expect(queue.activeCount).toBe(2);
    expect(queue.pendingCount).toBe(3);

    finish.get(0)?.();
    await vi.waitFor(() => { expect(started).toEqual([0, 1, 2]); });
    finish.get(1)?.();
    await vi.waitFor(() => { expect(started).toEqual([0, 1, 2, 3]); });
    finish.get(2)?.();
    await vi.waitFor(() => { expect(started).toEqual([0, 1, 2, 3, 4]); });
    finish.get(3)?.();
    finish.get(4)?.();

    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });

  it("关闭时拒绝尚未启动的任务，但不打断正在收尾的任务", async () => {
    const queue = new BoundedTaskQueue(1);
    let finishActive: (() => void) | undefined;
    const active = queue.enqueue(() => new Promise<string>((resolve) => {
      finishActive = () => resolve("done");
    }));
    const pending = queue.enqueue(async () => "never");

    await vi.waitFor(() => { expect(queue.activeCount).toBe(1); });
    queue.close(new Error("工作台停止"));
    await expect(pending).rejects.toThrow("工作台停止");
    finishActive?.();
    await expect(active).resolves.toBe("done");
    await expect(queue.enqueue(async () => "late")).rejects.toThrow("任务队列已关闭");
  });
});
