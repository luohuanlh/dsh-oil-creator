import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("视频平台远端草稿保存脚本", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts/video-draft.mjs"), "utf8");
  const runner = readFileSync(resolve(process.cwd(), "scripts/video-draft-runner.mjs"), "utf8");

  it("只点击精确的存草稿控件并回读 draftId", () => {
    expect(source).toContain("span.submit-draft");
    expect(source).toContain("draftId");
    expect(source).toContain("expectedTitle");
    expect(source).toContain("verified");
  });

  it("抖音只点击暂存离开并从 draft 入口回读 video_id", () => {
    expect(source).toContain("暂存离开");
    expect(source).toContain("继续编辑");
    expect(source).toContain("enter_from");
    expect(source).toContain("/web/api/media/video/transend/");
    expect(source).toContain("video_id");
  });

  it("快手从服务器 snapshot 回读 fileId、文件名与精确描述", () => {
    expect(source).toContain("KUAISHOU_SNAPSHOT_URL");
    expect(source).toContain("fileId");
    expect(source).toContain("expectedFileName");
    expect(source).toContain("expectedCaption");
    expect(source).toContain("photoStatus");
    expect(source).toContain("mediaId");
  });

  it("成功后把远端草稿页交给用户", () => {
    expect(source).toContain("handOffTaskSpace");
  });

  it("没有最终投稿动作", () => {
    expect(source).not.toMatch(/click\([^\n]*(立即投稿|发布|发表)/);
    expect(source).not.toContain("submit\/add");
  });

  it("用同一个父进程覆盖页面 READY 与远端保存两阶段", () => {
    expect(runner).toContain("publisherRunner");
    expect(runner).toContain('run("ego-browser", ["nodejs"]');
    expect(runner.indexOf("publisherRunner")).toBeLessThan(runner.indexOf('run("ego-browser"'));
  });

  it("父进程会把 publisher 的任务空间交给远端保存器", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "oil-video-draft-runner-"));
    const publisher = join(fixture, "publisher.sh");
    const ego = join(fixture, "ego-browser");
    writeFileSync(publisher, [
      "#!/bin/sh",
      "printf '%s\\n' '{\"ready\":true,\"platforms\":{\"bilibili\":{\"taskSpaceId\":12}}}'",
    ].join("\n"));
    writeFileSync(ego, [
      "#!/bin/sh",
      "cat >/dev/null",
      "printf '%s\\n' '{\"platform\":\"bilibili\",\"ok\":true,\"verified\":true,\"remoteId\":\"42\",\"draftUrl\":\"https://member.bilibili.com/draft/42\",\"taskSpace\":\"12\"}'",
    ].join("\n"), { mode: 0o755 });
    try {
      const result = await execFileAsync(process.execPath, [
        resolve(process.cwd(), "scripts/video-draft-runner.mjs"),
      ], {
        env: {
          ...process.env,
          PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
          OIL_VIDEO_DRAFT_RUN: JSON.stringify({
            publisherRunner: publisher,
            publisherCwd: fixture,
            packagePath: join(fixture, "package.json"),
            suffix: "fixture",
            runnerPlatforms: ["bilibili"],
            platform: "bilibili",
            expectedTitle: "测试标题",
            saverScript: resolve(process.cwd(), "scripts/video-draft.mjs"),
            confirmOriginalRights: true,
          }),
        },
      });
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        ok: true,
        verified: true,
        remoteId: "42",
        taskSpace: "12",
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("父进程把抖音 READY 任务空间交给远端保存器", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "oil-douyin-draft-runner-"));
    const publisher = join(fixture, "publisher.sh");
    const ego = join(fixture, "ego-browser");
    writeFileSync(publisher, [
      "#!/bin/sh",
      "printf '%s\\n' '{\"ready\":true,\"platforms\":{\"douyin\":{\"taskSpaceId\":5}}}'",
    ].join("\n"));
    writeFileSync(ego, [
      "#!/bin/sh",
      "cat >/dev/null",
      "printf '%s\\n' '{\"platform\":\"douyin\",\"ok\":true,\"verified\":true,\"remoteId\":\"v0200demo\",\"draftUrl\":\"https://creator.douyin.com/creator-micro/content/post/video?enter_from=draft\",\"taskSpace\":\"5\"}'",
    ].join("\n"), { mode: 0o755 });
    try {
      const result = await execFileAsync(process.execPath, [
        resolve(process.cwd(), "scripts/video-draft-runner.mjs"),
      ], {
        env: {
          ...process.env,
          PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
          OIL_VIDEO_DRAFT_RUN: JSON.stringify({
            publisherRunner: publisher,
            publisherCwd: fixture,
            packagePath: join(fixture, "package.json"),
            suffix: "fixture",
            runnerPlatforms: ["douyin"],
            platform: "douyin",
            expectedTitle: "测试标题",
            saverScript: resolve(process.cwd(), "scripts/video-draft.mjs"),
            confirmOriginalRights: true,
          }),
        },
      });
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        platform: "douyin",
        ok: true,
        verified: true,
        remoteId: "v0200demo",
        taskSpace: "5",
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("抖音重试从 draft 入口幂等回读标题和 video_id", async () => {
    const result = await execFileAsync(process.execPath, [
      resolve(process.cwd(), "tests/fixtures/video-draft-ego-runtime.mjs"),
      resolve(process.cwd(), "scripts/video-draft.mjs"),
    ]);
    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.find((line) => line.platform === "douyin")).toMatchObject({
      ok: true,
      verified: true,
      remoteId: "v0200fg10000fixture",
      draftUrl: "https://creator.douyin.com/creator-micro/content/post/video?enter_from=draft",
      taskSpace: "5",
      handedOff: true,
    });
    expect(lines.find((line) => line.fixture === true)).toMatchObject({
      handedOff: ["5"],
    });
  });

  it("快手幂等回读同一份服务器草稿", async () => {
    const result = await execFileAsync(process.execPath, [
      resolve(process.cwd(), "tests/fixtures/video-draft-kuaishou-ego-runtime.mjs"),
      resolve(process.cwd(), "scripts/video-draft.mjs"),
    ]);
    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.find((line) => line.platform === "kuaishou")).toMatchObject({
      ok: true,
      verified: true,
      remoteId: "3931743938",
      draftUrl: "https://cp.kuaishou.com/article/publish/video",
      taskSpace: "17",
      handedOff: true,
    });
    expect(lines.find((line) => line.fixture === true)).toMatchObject({ handedOff: ["17"] });
  });
});
