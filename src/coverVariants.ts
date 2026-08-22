import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import sharp from "sharp";

export type CoverRatio = "3:4" | "4:3";

export interface PreparedCoverVariant {
  path: string;
  ratio: CoverRatio;
  cropped: boolean;
  source: { width: number; height: number };
  output: { width: number; height: number };
}

const COVER_VARIANT_VERSION = "center-crop-v1";
const RATIO_TOLERANCE = 0.01;

function ratioParts(ratio: CoverRatio): readonly [number, number] {
  return ratio === "3:4" ? [3, 4] : [4, 3];
}

function ratioMatches(width: number, height: number, ratio: CoverRatio): boolean {
  const [ratioWidth, ratioHeight] = ratioParts(ratio);
  return Math.abs(width / height - ratioWidth / ratioHeight) < RATIO_TOLERANCE;
}

function cropSize(width: number, height: number, ratio: CoverRatio): {
  width: number;
  height: number;
} {
  const [ratioWidth, ratioHeight] = ratioParts(ratio);
  const unit = Math.floor(Math.min(width / ratioWidth, height / ratioHeight));
  if (unit < 1) throw new Error(`封面尺寸过小，无法裁切为 ${ratio}`);
  return { width: unit * ratioWidth, height: unit * ratioHeight };
}

async function cachedVariantIsValid(
  path: string,
  expected: { width: number; height: number },
): Promise<boolean> {
  if (!(await stat(path).then((info) => info.isFile(), () => false))) return false;
  try {
    const metadata = await sharp(path).metadata();
    return metadata.format === "png"
      && metadata.width === expected.width
      && metadata.height === expected.height;
  } catch {
    return false;
  }
}

async function moveVariantIntoPlace(
  temporaryPath: string,
  targetPath: string,
  expected: { width: number; height: number },
): Promise<void> {
  try {
    await rename(temporaryPath, targetPath);
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause
      ? String(cause.code)
      : "";
    if (code !== "EEXIST" && code !== "EPERM") throw cause;
    if (await cachedVariantIsValid(targetPath, expected)) return;
    await rm(targetPath, { force: true });
    await rename(temporaryPath, targetPath);
  }
}

export async function prepareCoverVariant(
  dataDir: string,
  sourcePath: string,
  ratio: CoverRatio,
): Promise<PreparedCoverVariant> {
  let sourceBytes: Buffer;
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    sourceBytes = await readFile(sourcePath);
    metadata = await sharp(sourceBytes).metadata();
  } catch (cause) {
    throw new Error(`无法读取封面图片：${sourcePath}`, { cause });
  }

  const source = {
    width: metadata.autoOrient.width,
    height: metadata.autoOrient.height,
  };
  if (source.width < 1 || source.height < 1) {
    throw new Error(`封面图片缺少有效尺寸：${sourcePath}`);
  }

  const cropped = !ratioMatches(source.width, source.height, ratio);
  const output = cropped ? cropSize(source.width, source.height, ratio) : source;
  const orientationNormalized = metadata.orientation !== undefined && metadata.orientation !== 1;
  const publisherReadableFormat = metadata.format === "png" || metadata.format === "jpeg";
  if (!cropped && !orientationNormalized && publisherReadableFormat) {
    return { path: sourcePath, ratio, cropped: false, source, output };
  }

  const digest = createHash("sha256")
    .update(COVER_VARIANT_VERSION)
    .update("\0")
    .update(ratio)
    .update("\0")
    .update(sourceBytes)
    .digest("hex")
    .slice(0, 24);
  const targetDir = join(dataDir, "derived-covers");
  const targetPath = join(targetDir, `${digest}-${ratio.replace(":", "x")}.png`);
  await mkdir(targetDir, { recursive: true });
  if (!(await cachedVariantIsValid(targetPath, output))) {
    const temporaryPath = join(
      targetDir,
      `.${basename(targetPath)}.${process.pid}-${randomUUID()}.tmp.png`,
    );
    try {
      const left = Math.floor((source.width - output.width) / 2);
      const top = Math.floor((source.height - output.height) / 2);
      const info = await sharp(sourceBytes)
        .autoOrient()
        .extract({ left, top, width: output.width, height: output.height })
        .png()
        .toFile(temporaryPath);
      if (info.width !== output.width || info.height !== output.height) {
        throw new Error(
          `封面裁切结果尺寸异常：期望 ${output.width}x${output.height}，实际 ${info.width}x${info.height}`,
        );
      }
      await moveVariantIntoPlace(temporaryPath, targetPath, output);
    } catch (cause) {
      throw new Error(`无法把封面裁切为 ${ratio}：${sourcePath}`, { cause });
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  return { path: targetPath, ratio, cropped, source, output };
}
