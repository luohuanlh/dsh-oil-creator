import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  commitTemporaryContentAsset,
  type AssetUploadKind,
  validateAssetImport,
} from "./assetImport.ts";
import { findFreePort } from "./ports.ts";

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function responseHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Content-Length",
    "Cache-Control": "no-store",
    "Connection": "close",
  };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    ...responseHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

export async function startAssetUploadServer(input: {
  folderPath: string;
  kind: AssetUploadKind;
  name: string;
  expectedSize: number;
  onImported?: (asset: { name: string; path: string }) => void | Promise<void>;
  onSettled?: () => void;
  timeoutMs?: number;
}): Promise<{ url: string; close: () => void }> {
  const { name, maxBytes, label } = validateAssetImport(
    input.kind,
    input.name,
    input.expectedSize,
  );
  const token = randomUUID();
  const temporaryPath = join(input.folderPath, `.oil-upload-${token}.part`);
  const port = await findFreePort(9100, 9199);
  let settled = false;
  let claimed = false;
  let notified = false;
  const controller = new AbortController();

  const server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, responseHeaders());
      response.end();
      return;
    }
    if (request.method !== "PUT" || request.url !== `/upload/${token}` || settled) {
      sendJson(response, settled ? 410 : 404, { error: "上传地址无效或已失效" });
      return;
    }

    if (claimed) {
      sendJson(response, 409, { error: "该上传地址已有文件正在传输" });
      return;
    }

    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength !== input.expectedSize) {
      sendJson(response, 400, { error: `${label}文件大小与选择时不一致` });
      finish();
      return;
    }

    claimed = true;
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        if (received > maxBytes || received > input.expectedSize) {
          callback(new Error(`${label}文件大小与选择时不一致`));
          return;
        }
        callback(null, chunk);
      },
    });

    void (async () => {
      let failureStatus = 400;
      try {
        await pipeline(request, counter, createWriteStream(temporaryPath, { flags: "wx" }), {
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (received !== input.expectedSize) {
          throw new Error(`${label}文件大小与选择时不一致`);
        }
        failureStatus = 500;
        const asset = await commitTemporaryContentAsset(input.folderPath, name, temporaryPath);
        await input.onImported?.(asset);
        if (!settled && !response.destroyed) sendJson(response, 201, { asset });
      } catch (cause) {
        if (!settled && !response.destroyed) {
          const message = cause instanceof Error ? cause.message : `${label}导入失败`;
          if (!response.headersSent) sendJson(response, failureStatus, { error: message });
          else response.destroy();
        }
      } finally {
        // 等待流关闭后再清理，避免取消时文件尚未创建、清理先于写入发生。
        await unlink(temporaryPath).catch(() => undefined);
        finish();
        notifySettled();
      }
    })();
  });

  const timeout = setTimeout(() => { finish(true); }, input.timeoutMs ?? UPLOAD_TIMEOUT_MS);
  timeout.unref();

  function notifySettled(): void {
    if (notified) return;
    notified = true;
    input.onSettled?.();
  }

  function finish(cancel = false): void {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    server.close();
    if (cancel) {
      controller.abort();
      server.closeAllConnections();
    }
    if (!claimed) notifySettled();
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (cause) {
    finish(true);
    throw cause;
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${port}/upload/${token}`,
    close: () => { finish(true); },
  };
}
