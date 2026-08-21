import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { importContentAsset } from "../src/assetImport.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "oil-asset-import-"));
  temporaryDirectories.push(folder);
  return folder;
}

describe("importContentAsset", () => {
  it("把 Markdown 文件写入当前内容文件夹", async () => {
    const folder = await temporaryFolder();
    const imported = await importContentAsset(folder, {
      kind: "article",
      name: "article.md",
      base64: Buffer.from("# 标题\n", "utf8").toString("base64"),
    });

    expect(imported).toEqual({
      name: "article.md",
      path: join(folder, "article.md"),
    });
    expect(await readFile(imported.path, "utf8")).toBe("# 标题\n");
  });

  it("文件重名时保留原文件并生成递增名称", async () => {
    const folder = await temporaryFolder();
    const input = {
      kind: "cover" as const,
      name: "cover.png",
      base64: Buffer.from("image").toString("base64"),
    };

    const first = await importContentAsset(folder, input);
    const second = await importContentAsset(folder, input);

    expect(first.name).toBe("cover.png");
    expect(second.name).toBe("cover-2.png");
  });

  it("支持导入 HTML 文章", async () => {
    const folder = await temporaryFolder();
    const imported = await importContentAsset(folder, {
      kind: "article",
      name: "article.html",
      base64: Buffer.from("<h1>标题</h1>", "utf8").toString("base64"),
    });

    expect(imported.name).toBe("article.html");
    expect(await readFile(imported.path, "utf8")).toBe("<h1>标题</h1>");
  });

  it("拒绝目录穿越、错误扩展名和无效内容", async () => {
    const folder = await temporaryFolder();

    await expect(importContentAsset(folder, {
      kind: "article",
      name: "../article.md",
      base64: "eA==",
    })).rejects.toThrow("文件名无效");
    await expect(importContentAsset(folder, {
      kind: "cover",
      name: "cover.svg",
      base64: "eA==",
    })).rejects.toThrow("文件类型不受支持");
    await expect(importContentAsset(folder, {
      kind: "article",
      name: "article.md",
      base64: "not base64",
    })).rejects.toThrow("文件内容无效");
  });
});
