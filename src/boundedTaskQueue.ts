interface PendingTask {
  start: () => void;
  reject: (cause: unknown) => void;
}

export class BoundedTaskQueue {
  readonly concurrency: number;
  activeCount = 0;
  pendingCount = 0;
  closed = false;
  pending: PendingTask[] = [];

  constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("并发数必须是大于零的整数");
    }
    this.concurrency = concurrency;
  }

  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    if (this.closed) return Promise.reject(new Error("任务队列已关闭"));
    return new Promise<T>((resolve, reject) => {
      const pending: PendingTask = {
        reject,
        start: () => {
          this.activeCount += 1;
          void Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              this.activeCount -= 1;
              this.drain();
            });
        },
      };
      this.pending.push(pending);
      this.pendingCount = this.pending.length;
      this.drain();
    });
  }

  close(cause: unknown = new Error("任务队列已关闭")): void {
    if (this.closed) return;
    this.closed = true;
    const pending = this.pending.splice(0);
    this.pendingCount = 0;
    for (const task of pending) task.reject(cause);
  }

  drain(): void {
    while (!this.closed && this.activeCount < this.concurrency) {
      const next = this.pending.shift();
      this.pendingCount = this.pending.length;
      if (next === undefined) return;
      next.start();
    }
  }
}
