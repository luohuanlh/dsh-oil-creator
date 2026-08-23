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

    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength !== input.expectedSize) {
      sendJson(response, 400, { error: `${label}文件大小与选择时不一致` });
      finish();
      return;
    }

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

    void pipeline(request, counter, createWriteStream(temporaryPath, { flags: "wx" })).then(
      async () => {
        if (received !== input.expectedSize) {
          throw new Error(`${label}文件大小与选择时不一致`);
        }
        const asset = await commitTemporaryContentAsset(input.folderPath, name, temporaryPath);
        await input.onImported?.(asset);
        sendJson(response, 201, { asset });
        finish();
      },
      (cause: unknown) => {
        const message = cause instanceof Error ? cause.message : `${label}导入失败`;
        void unlink(temporaryPath).catch(() => undefined).finally(() => {
          if (!response.headersSent) sendJson(response, 400, { error: message });
          else response.destroy();
          finish();
        });
      },
    ).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : `${label}导入失败`;
      void unlink(temporaryPath).catch(() => undefined).finally(() => {
        if (!response.headersSent) sendJson(response, 500, { error: message });
        else response.destroy();
        finish();
      });
    });
  });

  const timeout = setTimeout(() => { finish(); }, UPLOAD_TIMEOUT_MS);
  timeout.unref();

  function finish(): void {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    server.close();
    void unlink(temporaryPath).catch(() => undefined);
    input.onSettled?.();
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  server.unref();
  return {
    url: `http://127.0.0.1:${port}/upload/${token}`,
    close: finish,
  };
}
