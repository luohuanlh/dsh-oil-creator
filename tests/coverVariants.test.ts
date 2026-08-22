import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { prepareCoverVariant } from "../src/coverVariants.ts";

async function dimensions(path: string): Promise<{ width?: number; height?: number }> {
  const metadata = await sharp(path).metadata();
  return { width: metadata.width, height: metadata.height };
}

describe("prepareCoverVariant", () => {
  it("把方形封面居中裁成精确 4:3，同时保留原图", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-variant-"));
    const sourcePath = join(root, "方形封面.png");
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 30, g: 80, b: 160, alpha: 1 },
      },
    }).png().toFile(sourcePath);

    const result = await prepareCoverVariant(root, sourcePath, "4:3");

    expect(result.path).not.toBe(sourcePath);
    expect(result.cropped).toBe(true);
    expect(result.source).toEqual({ width: 1024, height: 1024 });
    expect(result.output).toEqual({ width: 1024, height: 768 });
    await expect(dimensions(sourcePath)).resolves.toEqual({ width: 1024, height: 1024 });
    await expect(dimensions(result.path)).resolves.toEqual({ width: 1024, height: 768 });
  });

  it("相同原图与比例复用同一个稳定派生文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-cache-"));
    const sourcePath = join(root, "cover.png");
    await sharp({
      create: {
        width: 900,
        height: 900,
        channels: 3,
        background: { r: 220, g: 120, b: 40 },
      },
    }).png().toFile(sourcePath);

    const first = await prepareCoverVariant(root, sourcePath, "3:4");
    const firstStat = await stat(first.path);
    const second = await prepareCoverVariant(root, sourcePath, "3:4");
    const secondStat = await stat(second.path);

    expect(second.path).toBe(first.path);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    expect(second.output).toEqual({ width: 675, height: 900 });
  });

  it("派生缓存损坏时重新生成有效图片", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-cache-repair-"));
    const sourcePath = join(root, "cover.png");
    await sharp({
      create: {
        width: 900,
        height: 900,
        channels: 3,
        background: { r: 60, g: 100, b: 140 },
      },
    }).png().toFile(sourcePath);

    const first = await prepareCoverVariant(root, sourcePath, "4:3");
    await writeFile(first.path, "broken-cache");
    const repaired = await prepareCoverVariant(root, sourcePath, "4:3");

    expect(repaired.path).toBe(first.path);
    await expect(dimensions(repaired.path)).resolves.toEqual({ width: 900, height: 675 });
  });

  it("已经符合比例的 PNG 直接复用原文件", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-reuse-"));
    const sourcePath = join(root, "cover-4x3.png");
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    }).png().toFile(sourcePath);

    const result = await prepareCoverVariant(root, sourcePath, "4:3");

    expect(result.path).toBe(sourcePath);
    expect(result.cropped).toBe(false);
    expect(result.output).toEqual({ width: 1200, height: 900 });
  });

  it("把预检无法直接识别的 WebP 转为相同比例的 PNG", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-webp-"));
    const sourcePath = join(root, "cover-4x3.webp");
    await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 90, g: 120, b: 150 },
      },
    }).webp().toFile(sourcePath);

    const result = await prepareCoverVariant(root, sourcePath, "4:3");
    const outputMetadata = await sharp(result.path).metadata();

    expect(result.path).not.toBe(sourcePath);
    expect(result.path.endsWith(".png")).toBe(true);
    expect(result.cropped).toBe(false);
    expect({
      format: outputMetadata.format,
      width: outputMetadata.width,
      height: outputMetadata.height,
    }).toEqual({ format: "png", width: 1200, height: 900 });
  });

  it("损坏图片给出可执行的中文错误", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-cover-invalid-"));
    const sourcePath = join(root, "broken.png");
    await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    }).png().toFile(sourcePath);
    await writeFile(sourcePath, "not-an-image");

    await expect(prepareCoverVariant(root, sourcePath, "4:3"))
      .rejects.toThrow("无法读取封面图片");
  });
});
