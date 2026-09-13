import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scan = vi.hoisted(() => vi.fn());
vi.mock("../src/catalog.ts", async (original) => ({
  ...await original<typeof import("../src/catalog.ts")>(),
  scanLibrary: scan,
}));
import { OilCreatorService } from "../src/service.ts";
import { emptyOverlay, saveOverlay } from "../src/overlay.ts";

const actual = await vi.importActual<typeof import("../src/catalog.ts")>("../src/catalog.ts");
const request = { query: "", filter: "all" as const };
const signal = new AbortController().signal;

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "oil-cache-"));
  const libraryRoot = join(root, "library");
  const folder = join(libraryRoot, "2026-09-13_demo");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "video.mp4"), "video");
  const service = Object.create(OilCreatorService.prototype) as OilCreatorService;
  Object.assign(service, {
    dataDir: join(root, "data"), libraryRoot, catalogRevision: 0,
    draftStarts: new Set(), ensureWatch: vi.fn(),
  });
  return { service, folder };
}

beforeEach(() => { scan.mockReset().mockImplementation(actual.scanLibrary); });

describe("目录扫描缓存", () => {
  it("状态更新复用磁盘扫描，移除覆盖值后恢复文件真相", async () => {
    const { service } = await setup();
    const initial = await service.listContents(request, signal);
    const id = initial.items[0]!.id;
    await service.patchDraftRows(id, ["bilibili"], (row) => ({
      ...row, status: "draft", url: "https://example.com/draft/1", remoteId: "1",
    }));
    const updated = await service.listContents(request, signal);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(updated.items[0]?.publish.bilibili.status).toBe("draft");
    expect(updated.items[0]?.workflow).toBe("live");
    expect(updated.revision).toBeGreaterThan(initial.revision);
    await saveOverlay(service.dataDir, emptyOverlay());
    service.notifyCatalogChanged();
    const restored = await service.listContents(request, signal);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(restored.items[0]?.publish.bilibili.status).toBe("unpublished");
    expect(restored.items[0]?.workflow).toBe("idle");
  });

  it("慢扫描不阻塞状态写回，并发读取共用扫描且取得最新状态", async () => {
    const { service } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    scan.mockImplementationOnce(async (...args: Parameters<typeof actual.scanLibrary>) => {
      await gate;
      return actual.scanLibrary(...args);
    });
    const first = service.listContents(request, signal);
    const second = service.listContents(request, signal);
    try {
      await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
      const write = service.patchDraftRows("2026-09-13_demo", ["bilibili"], (row) => ({
        ...row, status: "draft", remoteId: "2", url: "https://example.com/draft/2",
      }));
      let written = false;
      void write.then(() => { written = true; });
      await vi.waitFor(() => expect(written).toBe(true));
      await write;
    } finally {
      release();
    }
    for (const result of await Promise.all([first, second])) {
      expect(result.items[0]?.publish.bilibili.remoteId).toBe("2");
    }
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("扫描途中素材变更会丢弃旧快照", async () => {
    const { service, folder } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let captured = false;
    scan.mockImplementationOnce(async (...args: Parameters<typeof actual.scanLibrary>) => {
      const old = await actual.scanLibrary(...args);
      captured = true;
      await gate;
      return old;
    });
    const pending = service.listContents(request, signal);
    try {
      await vi.waitFor(() => expect(captured).toBe(true));
      await writeFile(join(folder, "new.srt"), "subtitle");
      service.invalidateCatalog();
    } finally { release(); }
    const result = await pending;
    expect(scan).toHaveBeenCalledTimes(2);
    expect(result.items[0]?.assets.subtitles[0]?.name).toBe("new.srt");
  });

  it("切换内容目录时不会返回旧目录的扫描结果", async () => {
    const { service } = await setup();
    const next = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    scan.mockImplementationOnce(async (...args: Parameters<typeof actual.scanLibrary>) => {
      await gate;
      return actual.scanLibrary(...args);
    });
    const pending = service.listContents(request, signal);
    try {
      await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
      await service.setLibraryRoot({ path: next.service.libraryRoot }, signal);
    } finally { release(); }
    const result = await pending;
    expect(result.settings.libraryRoot).toBe(next.service.libraryRoot);
    expect(result.items[0]?.folderPath).toBe(next.folder);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("扫描失败不会永久缓存被拒绝的 Promise", async () => {
    const { service } = await setup();
    scan.mockRejectedValueOnce(new Error("临时读取失败"));
    await expect(service.listContents(request, signal)).rejects.toThrow("临时读取失败");
    expect((await service.listContents(request, signal)).items).toHaveLength(1);
    expect(scan).toHaveBeenCalledTimes(2);
  });

});
