import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  captureArticleDraftSnapshot,
  markdownToWechatHtml,
  parseArticleDraftOutput,
  prepareArticleDraftRun,
  startArticleDraftRun,
  type PreparedArticleDraftRun,
} from "../src/articleDraftRunner.ts";
import { freezeDistributionPackage } from "../src/distribution.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import type { ContentSummary } from "../src/types.ts";

function articleItem(folderPath: string, articlePath: string, coverPath: string): ContentSummary {
  return {
    id: "2026-08-21_图文",
    folderPath,
    title: "图文",
    recordedAt: 1,
    createdMs: 1,
    covers: {},
    subtitles: {},
    assets: {
      videos: [],
      subtitles: [],
      articles: [{ name: "article.md", path: articlePath }],
      covers: [{ name: "cover.png", path: coverPath }],
    },
    hasPublishPackage: false,
    hasDistributionPackage: true,
    hasArticle: true,
    articlePath,
    waitingForExport: false,
    tags: [],
    pipeline: "packaged",
    workflow: "publish",
    publish: emptyPublish(),
    burn: emptyBurn(),
    subtitleJob: emptyBurn(),
    coverJob: emptyBurn(),
  };
}

function preparedInput(): PreparedArticleDraftRun {
  return {
    input: {
      platform: "wechat-mp",
      id: "2026-08-27_资源测试",
      title: "资源测试",
      summary: "摘要",
      html: "<p>正文</p>",
      tags: [],
      coverMime: "image/png",
      coverBase64: "iVBORw0KGgo=",
      taskName: "oil-wechat-resource-test",
    },
  };
}

function spawnFixture(steps: Array<{
  stdout?: string;
  stderr?: string;
  code?: number;
  exitOnInput?: boolean;
  exitOnKill?: boolean;
}>): {
  spawnProcess: typeof import("node:child_process").spawn;
  inputs: string[];
  kills: Array<ReturnType<typeof vi.fn>>;
} {
  const inputs: string[] = [];
  const kills: Array<ReturnType<typeof vi.fn>> = [];
  let index = 0;
  const implementation = () => {
    const step = steps[index++] ?? {};
    const child = new EventEmitter();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const chunks: Buffer[] = [];
    let exited = false;
    const exit = (): void => {
      if (exited) return;
      exited = true;
      if (step.stdout !== undefined) stdout.write(step.stdout);
      if (step.stderr !== undefined) stderr.write(step.stderr);
      stdout.end();
      stderr.end();
      child.emit("exit", step.code ?? 0, null);
    };
    stdin.on("data", (chunk: Buffer) => { chunks.push(Buffer.from(chunk)); });
    stdin.on("finish", () => {
      inputs.push(Buffer.concat(chunks).toString("utf8"));
      if (step.exitOnInput !== false) queueMicrotask(exit);
    });
    const kill = vi.fn(() => {
      if (step.exitOnKill === true) queueMicrotask(exit);
      return true;
    });
    kills.push(kill);
    Object.assign(child, {
      pid: 7000 + index,
      stdin,
      stdout,
      stderr,
      kill,
      unref: vi.fn(),
    });
    return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
  };
  return {
    spawnProcess: vi.fn(implementation) as unknown as typeof import("node:child_process").spawn,
    inputs,
    kills,
  };
}

describe("WeChat article draft runner", () => {
  it("限制子进程运行时间与输出，并在远端草稿完成后回收 task space", () => {
    const source = readFileSync(
      join(process.cwd(), "src/articleDraftRunner.ts"),
      "utf8",
    );

    expect(source).toContain("ARTICLE_DRAFT_TIMEOUT_MS");
    expect(source).toContain("ARTICLE_DRAFT_OUTPUT_LIMIT_BYTES");
    expect(source).toContain("completeTaskSpace");
    expect(source).toContain("keep: false");
  });

  it("只保留有限输出尾部并用独立 Ego 进程关闭远端 task space", async () => {
    const remote = JSON.stringify({
      ok: true,
      platform: "wechat-mp",
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: "42",
      draftStorage: "remote",
      draftUrl: "https://mp.weixin.qq.com/draft/42",
      taskSpace: "7",
    });
    const fixture = spawnFixture([
      { stdout: `${"x".repeat(4_096)}\n${remote}\n` },
      { stdout: `${JSON.stringify({ done: true })}\n` },
    ]);

    const run = await startArticleDraftRun(preparedInput(), {
      spawnProcess: fixture.spawnProcess,
      timeoutMs: 1_000,
      cleanupTimeoutMs: 1_000,
      outputLimitBytes: 512,
    });

    await expect(run.completion).resolves.toMatchObject({
      ok: true,
      remoteId: "42",
      taskSpace: "7",
    });
    expect(fixture.spawnProcess).toHaveBeenCalledTimes(2);
    expect(fixture.inputs[1]).toContain('completeTaskSpace("7", { keep: false })');
    expect(fixture.kills[0]).not.toHaveBeenCalled();
  });

  it("运行超时后终止子进程并按 task name 回收空间", async () => {
    const fixture = spawnFixture([
      { exitOnInput: false, exitOnKill: true },
      { stdout: `${JSON.stringify({ done: true })}\n` },
    ]);

    const run = await startArticleDraftRun(preparedInput(), {
      spawnProcess: fixture.spawnProcess,
      timeoutMs: 5,
      cleanupTimeoutMs: 1_000,
      outputLimitBytes: 512,
    });

    await expect(run.completion).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("已终止"),
    });
    expect(fixture.kills[0]).toHaveBeenCalledWith("SIGTERM");
    expect(fixture.inputs[1]).toContain(
      'completeTaskSpace("oil-wechat-resource-test", { keep: false })',
    );
  });

  it("把冻结文章变体和用户选择的封面准备成纯机械 Ego 输入", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-article-runner-"));
    const article = join(folder, "article.md");
    const cover = join(folder, "cover.png");
    await writeFile(article, "# 原始文章\n\n原始正文");
    await writeFile(cover, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await freezeDistributionPackage({
      id: "2026-08-21_图文",
      folderPath: folder,
      selection: { mode: "article", articlePath: article, coverPath: cover },
      variants: [{
        platform: "wechat-mp",
        title: "公众号标题",
        summary: "公众号摘要",
        body: "# 平台正文\n\n这里是 **适配后** 的正文。",
        tags: ["AI"],
      }],
    });

    const prepared = await prepareArticleDraftRun(articleItem(folder, article, cover), "wechat-mp");

    expect(prepared.input).toMatchObject({
      platform: "wechat-mp",
      title: "公众号标题",
      summary: "公众号摘要",
      coverMime: "image/png",
    });
    expect(prepared.input.html).toContain('class="article-lead"');
    expect(prepared.input.html).toContain(">平台正文</div>");
    expect(prepared.input.html).toContain("<strong>适配后</strong>");
    expect(prepared.input.coverBase64).not.toBe("");
  });

  it("HTML 转换会转义原始标签，不让 AI 注入脚本", () => {
    const html = markdownToWechatHtml("# 标题\n\n<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("上传复用微信富文本框架并保留表格、实体与列表续段语义", () => {
    const html = markdownToWechatHtml([
      "| **AI算力投入** | **11 条** |",
      "| ------------------ | -------: |",
      "",
      "| **02** |   |",
      "| ------ | - |",
      "",
      "## 市场节奏",
      "",
      "- **关键时点：**&#x6309;时间顺序整理如下",
      "",
      "  **9月9-11日：**&#x4E2D;国国际光电博览会",
      "",
      "- **AI算力投入：**&#x963F;里巴巴启动大额配售",
      "",
      "  **事件背景：**&#x963F;里巴巴宣布拟配售新股",
    ].join("\n"));

    expect(html).toContain('data-wechat-draft="markdown-frame"');
    expect(html).toContain('class="signal-row"');
    expect(html).toContain('class="section-index"');
    expect(html).toContain('class="key-moments"');
    expect(html).toContain("<strong>9月9-11日：</strong>中国国际光电博览会");
    expect(html).toContain('class="list-detail"');
    expect(html).toContain("<strong>事件背景：</strong>阿里巴巴宣布拟配售新股");
    expect(html).not.toContain("&amp;#x");
    expect(html).not.toContain("| ------ |");
  });

  it("只接受经过页面回读验证的草稿结果", () => {
    expect(parseArticleDraftOutput([
      "noise",
      JSON.stringify({ ok: true, platform: "wechat-mp", status: "REMOTE_VERIFIED", verified: true, remoteId: "42", draftStorage: "remote", draftUrl: "https://mp.weixin.qq.com/draft/42", taskSpace: "7" }),
    ].join("\n"), "wechat-mp"))
      .toMatchObject({ ok: true, remoteId: "42", taskSpace: "7" });

    expect(() => parseArticleDraftOutput(
      JSON.stringify({ ok: true, verified: false }),
      "wechat-mp",
    ))
      .toThrow("未通过草稿页面验证");
  });

  it("为百家号准备独立的平台变体并校验对应输出平台", async () => {
    const folder = await mkdtemp(join(tmpdir(), "oil-baijiahao-runner-"));
    const article = join(folder, "article.md");
    const cover = join(folder, "cover.jpg");
    await writeFile(article, "# 原始文章\n\n原始正文");
    await writeFile(cover, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await freezeDistributionPackage({
      id: "2026-08-21_图文",
      folderPath: folder,
      selection: { mode: "article", articlePath: article, coverPath: cover },
      variants: [{
        platform: "baijiahao",
        title: "百家号标题",
        summary: "百家号摘要",
        body: "# 百家号正文\n\n这里是平台变体。",
        tags: ["AI"],
      }],
    });

    const prepared = await prepareArticleDraftRun(
      articleItem(folder, article, cover),
      "baijiahao",
    );

    expect(prepared.input).toMatchObject({
      platform: "baijiahao",
      title: "百家号标题",
      summary: "百家号摘要",
      coverMime: "image/jpeg",
    });
    expect(prepared.input.html).toContain("<h1>百家号正文</h1>");
    expect(prepared.input.taskName).toContain("oil-baijiahao-draft-");

    expect(parseArticleDraftOutput(JSON.stringify({
      ok: true,
      platform: "baijiahao",
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: "article-42",
      draftStorage: "remote",
      draftUrl: "https://baijiahao.baidu.com/builder/rc/edit?article_id=article-42",
      taskSpace: "9",
    }), "baijiahao")).toMatchObject({ platform: "baijiahao", remoteId: "article-42" });
    expect(() => parseArticleDraftOutput(JSON.stringify({
      ok: true,
      platform: "wechat-mp",
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: "42",
      draftStorage: "remote",
      draftUrl: "https://mp.weixin.qq.com/draft/42",
      taskSpace: "7",
    }), "baijiahao")).toThrow("图文草稿结果不完整");
  });

  it("小红书图文笔记只接受明确的浏览器本地草稿凭据", () => {
    expect(parseArticleDraftOutput(JSON.stringify({
      ok: true,
      platform: "xiaohongshu-note",
      status: "LOCAL_VERIFIED",
      verified: true,
      draftReceipt: "xiaohongshu-note:browser-local:local-42",
      draftStorage: "browser-local",
      draftUrl: "https://creator.xiaohongshu.com/publish/publish?target=image",
      taskSpace: "11",
    }), "xiaohongshu-note")).toMatchObject({
      status: "LOCAL_VERIFIED",
      draftReceipt: "xiaohongshu-note:browser-local:local-42",
      draftStorage: "browser-local",
    });

    expect(() => parseArticleDraftOutput(JSON.stringify({
      ok: true,
      platform: "xiaohongshu-note",
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: "local-42",
      draftStorage: "browser-local",
      draftUrl: "https://creator.xiaohongshu.com/publish/publish?target=image",
      taskSpace: "11",
    }), "xiaohongshu-note")).toThrow("图文草稿结果不完整");
  });
});


describe("图文批次快照", () => {
  it("排队期间替换文案、封面后仍使用入队时输入", async () => {
    const root = await mkdtemp(join(tmpdir(), "oil-article-snapshot-"));
    const article = join(root, "article.md");
    const cover = join(root, "cover.png");
    await writeFile(article, "原始正文");
    await writeFile(cover, "old-cover");
    const item = articleItem(root, article, cover);
    const freeze = (title: string) => freezeDistributionPackage({
      id: item.id, folderPath: root, selection: { mode: "article", articlePath: article, coverPath: cover },
      variants: [{ platform: "wechat-mp", title, summary: "摘要", body: title, tags: ["测试"] }],
    });
    await freeze("旧文案");
    const snapshot = await captureArticleDraftSnapshot(item);
    await writeFile(article, "新正文");
    await writeFile(cover, "new-cover");
    await freeze("新文案");
    const queued = await prepareArticleDraftRun(item, "wechat-mp", snapshot);
    expect(queued.input.title).toBe("旧文案");
    expect(queued.input.coverBase64).toBe(Buffer.from("old-cover").toString("base64"));
    const next = await prepareArticleDraftRun(item, "wechat-mp");
    expect(next.input.title).toBe("新文案");
  });
});
