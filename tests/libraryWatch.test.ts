import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createDebounced,
  shouldIgnoreWatchName,
  startLibraryWatch,
} from "../src/libraryWatch.ts";

describe("shouldIgnoreWatchName", () => {
  it("keeps real library files", () => {
    expect(shouldIgnoreWatchName("2026-08-16_demo/cover_3x4.png")).toBe(false);
    expect(shouldIgnoreWatchName("2026-08-16_demo/publish-package.json")).toBe(false);
    expect(shouldIgnoreWatchName("2026-08-16_demo/script.md")).toBe(false);
    expect(shouldIgnoreWatchName("2026-08-16_demo/topic.md")).toBe(false);
    expect(shouldIgnoreWatchName(null)).toBe(false);
  });

  it("drops finder and export noise", () => {
    expect(shouldIgnoreWatchName(".DS_Store")).toBe(true);
    expect(shouldIgnoreWatchName("2026-08-16_demo/.DS_Store")).toBe(true);
    expect(shouldIgnoreWatchName("clip.mp4.part")).toBe(true);
    expect(shouldIgnoreWatchName("demo.screenstudio/project.json")).toBe(true);
    expect(shouldIgnoreWatchName("._cover.png")).toBe(true);
  });
});

describe("createDebounced", () => {
  it("collapses a burst into one call", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const debounce = createDebounced(run, 100);
    debounce.trigger();
    debounce.trigger();
    debounce.trigger();
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    debounce.cancel();
    vi.useRealTimers();
  });
});

describe("startLibraryWatch", () => {
  it("原生监听分别通知素材和状态变化", async () => {
    vi.useFakeTimers();
    const listeners: Array<(event: string, name: string) => void> = [];
    const watchFileSystem = vi.fn((_path, _options, listener) => {
      listeners.push(listener);
      return { on: vi.fn(), close: vi.fn() };
    }) as unknown as typeof import("node:fs").watch;
    const onChange = vi.fn();
    const onOverlayChange = vi.fn();
    const handle = startLibraryWatch({
      libraryRoot: "/library", overlayPath: "/data/overlay.json",
      onChange, onOverlayChange, watchFileSystem,
      fingerprint: async () => "same", debounceMs: 20,
    });
    try {
      await handle.ready;
      listeners[2]!("rename", "overlay.json");
      await vi.advanceTimersByTimeAsync(20);
      expect(onOverlayChange).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
      listeners[0]!("change", "demo/video.mp4");
      listeners[2]!("rename", "overlay.json");
      await vi.advanceTimersByTimeAsync(20);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onOverlayChange).toHaveBeenCalledTimes(2);
    } finally { handle.close(); vi.useRealTimers(); }
  });

  it("轮询兜底也不会将 overlay 更新视为素材变化", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-watch-overlay-"));
    const libraryRoot = join(root, "library");
    await mkdir(libraryRoot);
    const overlayPath = join(root, "overlay.json");
    await writeFile(overlayPath, "{}");
    const onChange = vi.fn();
    const onOverlayChange = vi.fn();
    const handle = startLibraryWatch({
      libraryRoot, overlayPath, onChange, onOverlayChange,
      watchFileSystem: (() => { throw new Error("unsupported"); }) as typeof import("node:fs").watch,
      debounceMs: 10, fallbackMs: 30,
    });
    try {
      await handle.ready;
      await writeFile(overlayPath, '{"items":{}}');
      await vi.waitFor(() => expect(onOverlayChange).toHaveBeenCalled());
      expect(onChange).not.toHaveBeenCalled();
    } finally { handle.close(); }
  });

  it("stops polling after the startup safety check when recursive watching is available", async () => {
    vi.useFakeTimers();
    const watcher = {
      on: vi.fn().mockReturnThis(),
      close: vi.fn(),
    };
    const watchFileSystem = vi.fn(() => watcher) as unknown as typeof import("node:fs").watch;
    const fingerprint = vi.fn(async () => "unchanged");
    const handle = startLibraryWatch({
      libraryRoot: "/library",
      overlayPath: "/data/overlay.json",
      onChange: vi.fn(),
      fallbackMs: 100,
      watchFileSystem,
      fingerprint,
    });

    await handle.ready;
    await vi.advanceTimersByTimeAsync(300);
    expect(watchFileSystem).toHaveBeenCalledTimes(3);
    expect(fingerprint).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(fingerprint).toHaveBeenCalledTimes(2);
    handle.close();
    vi.useRealTimers();
  });

  it("polls as a fallback when recursive watching is unavailable", async () => {
    vi.useFakeTimers();
    const watchFileSystem = vi.fn(() => {
      throw new Error("watch unavailable");
    }) as unknown as typeof import("node:fs").watch;
    const fingerprint = vi.fn()
      .mockResolvedValueOnce("before")
      .mockResolvedValue("after");
    const onChange = vi.fn();
    const handle = startLibraryWatch({
      libraryRoot: "/library",
      overlayPath: "/data/overlay.json",
      onChange,
      debounceMs: 20,
      fallbackMs: 100,
      watchFileSystem,
      fingerprint,
    });

    await handle.ready;
    await vi.advanceTimersByTimeAsync(120);
    expect(fingerprint).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    handle.close();
    vi.useRealTimers();
  });

  it("notifies after a library file change", async () => {
    const root = join(tmpdir(), `oil-watch-${Date.now()}`);
    const dataDir = join(root, "data");
    const libraryRoot = join(root, "library");
    await mkdir(libraryRoot, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    const overlayPath = join(dataDir, "overlay.json");
    await writeFile(overlayPath, "{}\n");

    const seen: number[] = [];
    const handle = startLibraryWatch({
      libraryRoot,
      overlayPath,
      onChange: () => {
        seen.push(Date.now());
      },
      debounceMs: 80,
      fallbackMs: 100,
    });
    await handle.ready;
    await writeFile(join(libraryRoot, "note.md"), "hello\n");
    // Poll instead of a fixed sleep: macOS fs.watch delivery latency varies.
    await expect.poll(() => seen.length, { timeout: 4000 }).toBeGreaterThan(0);
    handle.close();
  });

  it("notifies after a script.md change in an episode folder", async () => {
    const root = join(tmpdir(), `oil-watch-script-${Date.now()}`);
    const dataDir = join(root, "data");
    const libraryRoot = join(root, "library");
    const episodeDir = join(libraryRoot, "2026-08-16_demo");
    await mkdir(episodeDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    const overlayPath = join(dataDir, "overlay.json");
    await writeFile(overlayPath, "{}\n");

    const seen: number[] = [];
    const handle = startLibraryWatch({
      libraryRoot,
      overlayPath,
      onChange: () => {
        seen.push(Date.now());
      },
      debounceMs: 80,
      fallbackMs: 100,
    });
    await handle.ready;
    // Regression: agent-written scripts must reach onChange, not be filtered as noise.
    await writeFile(join(episodeDir, "script.md"), "# 口播脚本\n");
    await expect.poll(() => seen.length, { timeout: 4000 }).toBeGreaterThan(0);
    handle.close();
  });
});
