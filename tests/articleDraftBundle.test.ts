import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sourceFiles = [
  "core.mjs",
  "platforms/wechat-mp.mjs",
  "platforms/baijiahao.mjs",
  "platforms/penguin.mjs",
  "platforms/netease.mjs",
  "platforms/yidian.mjs",
  "platforms/dayu.mjs",
  "platforms/dingduan.mjs",
  "platforms/xueqiu.mjs",
  "platforms/eastmoney.mjs",
  "platforms/10jqka.mjs",
  "platforms/sohu.mjs",
  "platforms/weibo.mjs",
  "platforms/zhihu.mjs",
  "platforms/ofweek.mjs",
  "platforms/laohu.mjs",
  "platforms/futu.mjs",
  "dispatch.mjs",
] as const;

describe("Article Publisher Ego bundle", () => {
  it("生成文件与 core、平台 Adapter 和 dispatch 源文件完全一致", async () => {
    const articleDir = resolve(process.cwd(), "scripts/article");
    const sources = await Promise.all(sourceFiles.map((path) =>
      readFile(resolve(articleDir, path), "utf8")
    ));
    const expected = sources.map((source) => source.trim()).join("\n\n") + "\n";
    const bundle = await readFile(resolve(process.cwd(), "scripts/article-draft.mjs"), "utf8");
    expect(bundle).toBe(expected);
  });

  it("每个平台文件独立注册完整三阶段契约", async () => {
    const articleDir = resolve(process.cwd(), "scripts/article");
    for (const path of sourceFiles.filter((value) => value.startsWith("platforms/"))) {
      const source = await readFile(resolve(articleDir, path), "utf8");
      expect(source.match(/registerArticleAdapter\(/g)).toHaveLength(1);
      expect(source).toContain("async inspect(");
      expect(source).toContain("async saveDraft(");
      expect(source).toContain("async verify(");
    }
  });

  it("core 与 dispatch 不包含平台分支", async () => {
    const articleDir = resolve(process.cwd(), "scripts/article");
    const source = await Promise.all([
      readFile(resolve(articleDir, "core.mjs"), "utf8"),
      readFile(resolve(articleDir, "dispatch.mjs"), "utf8"),
    ]).then((parts) => parts.join("\n"));
    expect(source).not.toMatch(
      /wechat-mp|baijiahao|penguin|netease|yidian|dayu|dingduan|xueqiu|eastmoney|10jqka|sohu|weibo|zhihu|ofweek|laohu|futu/,
    );
    expect(source).not.toMatch(/if\s*\(input\.platform/);
  });
});
