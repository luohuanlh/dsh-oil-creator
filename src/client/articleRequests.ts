// 每篇打开的文章持有一个作用域；写入互斥，旧读取不能跨越保存或重新加载。
export class ArticleRequests {
  private readonly controller = new AbortController();
  private version = 0;
  private writing = false;

  get signal(): AbortSignal { return this.controller.signal; }

  beginRead(): (() => boolean) | undefined {
    if (this.signal.aborted || this.writing) return undefined;
    const version = ++this.version;
    return () => !this.signal.aborted && version === this.version;
  }

  beginWrite(): { current: () => boolean; finish: () => void } | undefined {
    if (this.signal.aborted || this.writing) return undefined;
    this.writing = true;
    const version = ++this.version;
    const current = () => !this.signal.aborted && version === this.version;
    return {
      current,
      finish: () => {
        if (!current()) return;
        this.writing = false;
        this.version += 1;
      },
    };
  }

  dispose(): void { this.controller.abort(); }
}
