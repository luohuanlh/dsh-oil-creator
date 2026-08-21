import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
});
