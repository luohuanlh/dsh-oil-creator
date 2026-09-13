import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startAssetUploadServer } from "../src/assetUpload.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "oil-asset-upload-"));
  temporaryDirectories.push(folder);
  return folder;
}

function slowUpload(url: string) {
  const request = httpRequest(url, { method: "PUT", headers: { "Content-Length": "8" } });
  const result = new Promise<number>((resolve) => {
    request.on("response", (response) => { response.resume(); resolve(response.statusCode ?? 0); });
    request.on("error", () => { resolve(0); });
  });
  request.write("part");
  return { request, result };
}

describe("startAssetUploadServer", () => {
  it("流式接收视频并放进当前内容文件夹", async () => {
    const folder = await temporaryFolder();
    const bytes = new TextEncoder().encode("video-content");
    const onImported = vi.fn();
    const upload = await startAssetUploadServer({
      folderPath: folder,
      kind: "video",
      name: "clip.mp4",
      expectedSize: bytes.byteLength,
      onImported,
    });

    const response = await fetch(upload.url, { method: "PUT", body: bytes });
    const result = await response.json() as { asset: { name: string; path: string } };

    expect(response.status).toBe(201);
    expect(result.asset).toEqual({ name: "clip.mp4", path: join(folder, "clip.mp4") });
    expect(await readFile(result.asset.path, "utf8")).toBe("video-content");
    expect(onImported).toHaveBeenCalledWith(result.asset);
  });

  it("不覆盖同名素材，并拒绝大小不符的上传", async () => {
    const folder = await temporaryFolder();
    await writeFile(join(folder, "clip.srt"), "original");
    const upload = await startAssetUploadServer({
      folderPath: folder,
      kind: "subtitle",
      name: "clip.srt",
      expectedSize: 4,
    });

    const response = await fetch(upload.url, { method: "PUT", body: "bad" });
    expect(response.status).toBe(400);
    expect(await readFile(join(folder, "clip.srt"), "utf8")).toBe("original");
    await expect(readFile(join(folder, "clip-2.srt"), "utf8")).rejects.toThrow();
  });

  it("并发重复请求被拒绝且不会删除正在写入的临时文件", async () => {
    const folder = await temporaryFolder();
    const onSettled = vi.fn();
    const onImported = vi.fn();
    const upload = await startAssetUploadServer({
      folderPath: folder, kind: "video", name: "clip.mp4", expectedSize: 8, onSettled, onImported,
    });
    const first = slowUpload(upload.url);
    try {
      await vi.waitFor(async () => expect((await readdir(folder)).some((name) => name.endsWith(".part"))).toBe(true));
      const duplicate = await fetch(upload.url, { method: "PUT", body: "12345678" });
      expect(duplicate.status).toBe(409);
      await duplicate.text();
      first.request.end("done");
      expect(await first.result).toBe(201);
      expect(await readFile(join(folder, "clip.mp4"), "utf8")).toBe("partdone");
      await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
      expect(onImported).toHaveBeenCalledOnce();
      expect(await readdir(folder)).toEqual(["clip.mp4"]);
    } finally { first.request.destroy(); upload.close(); }
  });

  it.each(["关闭", "超时", "客户端中断"])("%s正在传输的文件时清理残片且仅结算一次", async (reason) => {
    const folder = await temporaryFolder();
    const onSettled = vi.fn();
    const onImported = vi.fn();
    const upload = await startAssetUploadServer({
      folderPath: folder, kind: "video", name: "clip.mp4", expectedSize: 8,
      onSettled, onImported, timeoutMs: reason === "超时" ? 250 : 10000,
    });
    const active = slowUpload(upload.url);
    try {
      await vi.waitFor(async () => expect((await readdir(folder)).some((name) => name.endsWith(".part"))).toBe(true));
      if (reason === "关闭") upload.close();
      if (reason === "客户端中断") active.request.destroy();
      await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
      expect(await readdir(folder)).toEqual([]);
      expect(onImported).not.toHaveBeenCalled();
      expect(await active.result).toBe(0);
      upload.close();
      expect(onSettled).toHaveBeenCalledOnce();
    } finally { active.request.destroy(); upload.close(); }
  });


  it.each(["short", "too-long-body"])("分块传输大小不符时拒绝残缺素材：%s", async (body) => {
    const folder = await temporaryFolder();
    const onSettled = vi.fn();
    const onImported = vi.fn();
    const upload = await startAssetUploadServer({
      folderPath: folder, kind: "video", name: "clip.mp4", expectedSize: 8,
      onSettled, onImported,
    });
    try {
      const code = await new Promise<number>((resolve) => {
        const request = httpRequest(upload.url, {
          method: "PUT", headers: { "Transfer-Encoding": "chunked" },
        }, (response) => { response.resume(); resolve(response.statusCode ?? 0); });
        request.on("error", () => { resolve(0); });
        request.end(body);
      });
      expect([0, 400]).toContain(code);
      await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
      expect(onImported).not.toHaveBeenCalled();
      expect(await readdir(folder)).toEqual([]);
    } finally { upload.close(); }
  });

});
