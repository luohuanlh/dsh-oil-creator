import { describe, expect, it, vi } from "vitest";
import { ArticleRequests } from "../src/client/articleRequests.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("图文编辑器请求隔离", () => {
  it("保存完成后返回的旧读取不能覆盖已保存的版本", async () => {
    const requests = new ArticleRequests();
    const response = deferred<string>();
    const currentRead = requests.beginRead()!;
    let revision = "initial";
    const pending = response.promise.then((value) => {
      if (currentRead()) revision = value;
    });
    const write = requests.beginWrite()!;
    expect(requests.beginRead()).toBeUndefined();
    revision = "saved";
    write.finish();
    response.resolve("old");
    await pending;
    expect(revision).toBe("saved");
    expect(requests.beginRead()?.()).toBe(true);
  });

  it("重新加载覆盖先前的后台读取资格", () => {
    const requests = new ArticleRequests();
    const background = requests.beginRead()!;
    const reload = requests.beginRead()!;
    expect(background()).toBe(false);
    expect(reload()).toBe(true);
  });

  it("保存和上传同步互斥，避免 React 下一次渲染前重复提交", () => {
    const requests = new ArticleRequests();
    const first = requests.beginWrite()!;
    expect(first.current()).toBe(true);
    expect(requests.beginWrite()).toBeUndefined();
    first.finish();
    const second = requests.beginWrite()!;
    first.finish();
    expect(second.current()).toBe(true);
    expect(requests.beginWrite()).toBeUndefined();
    second.finish();
    expect(requests.beginRead()?.()).toBe(true);
  });

  it("切换文章会终止上传信号并拒绝旧写入回调", () => {
    const requests = new ArticleRequests();
    const write = requests.beginWrite()!;
    const aborted = vi.fn();
    requests.signal.addEventListener("abort", aborted);
    requests.dispose();
    expect(aborted).toHaveBeenCalledOnce();
    expect(write.current()).toBe(false);
    write.finish();
    expect(requests.beginRead()).toBeUndefined();
    expect(requests.beginWrite()).toBeUndefined();
  });

  it("卸载后旧读取不可回写，新文章的请求仍然可用", () => {
    const previous = new ArticleRequests();
    const oldRead = previous.beginRead()!;
    previous.dispose();
    const next = new ArticleRequests();
    expect(oldRead()).toBe(false);
    expect(next.beginRead()?.()).toBe(true);
  });
});
