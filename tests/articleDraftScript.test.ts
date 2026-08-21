import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runtimeFixture = resolve(process.cwd(), "tests/fixtures/article-draft-ego-runtime.mjs");
const articleDraftScript = resolve(process.cwd(), "scripts/article-draft.mjs");

interface FixtureRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runFixture(scenario: "success" | "login" | "verification-failure" | "open-error"): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [runtimeFixture, articleDraftScript, scenario]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (cause) {
    const failure = cause as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

function jsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("微信公众号 Ego 草稿脚本", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts/article-draft.mjs"), "utf8");

  it("上传所选封面并调用草稿创建接口", () => {
    expect(source).toContain("coverBase64");
    expect(source).toContain("filetransfer?action=upload_material");
    expect(source).toContain("operate_appmsg?t=ajax-response&sub=create");
    expect(source).toContain("digest0");
    expect(source).toContain("content0");
  });

  it("创建后回读标题并把草稿页交给用户", () => {
    expect(source).toContain("verified");
    expect(source).toContain("expectedTitle");
    expect(source).toContain("handOffTaskSpace");
  });

  it("没有最终发表动作", () => {
    expect(source).not.toMatch(/click\([^\n]*(发表|发布|群发)/);
    expect(source).not.toContain("sub=send");
  });

  it("在模拟已登录页面中真实执行封面上传、草稿保存和页面回读", async () => {
    const result = await runFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "wechat-mp");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      verified: true,
      remoteId: "appmsg-42",
      taskSpace: "7",
      handedOff: true,
    });
    expect(String(draft?.draftUrl)).toContain("appmsgid=appmsg-42");
    expect(String(draft?.draftUrl)).not.toContain("token=");
    expect(trace).toMatchObject({
      fixture: true,
      handedOff: ["7"],
      openedDraft: true,
      requests: [
        { kind: "cover", method: "POST", hasFile: true },
        {
          kind: "save",
          method: "POST",
          title: "Harness 生成的公众号标题",
          summary: "Harness 生成的摘要",
          fileId: "cover-file-9",
          showCover: "1",
        },
      ],
    });
    expect(JSON.stringify(trace)).not.toMatch(/sub=send|masssend|publish/i);
  });

  it("登录失效时只交接任务空间，不调用草稿接口", async () => {
    const result = await runFixture("login");
    const draft = jsonLines(result.stdout).find((line) => line.platform === "wechat-mp");

    expect(result.code).toBe(2);
    expect(draft).toMatchObject({
      ok: false,
      handedOff: true,
      taskSpace: "7",
    });
    expect(draft?.error).toContain("登录态已失效");
  });

  it("标题或草稿 id 回读不一致时拒绝报告成功", async () => {
    const result = await runFixture("verification-failure");
    const draft = jsonLines(result.stdout).find((line) => line.platform === "wechat-mp");

    expect(result.code).toBe(4);
    expect(draft).toMatchObject({ ok: false, error: "微信公众号未通过草稿页面验证" });
    expect(JSON.stringify(draft)).not.toContain("token=");
  });

  it("浏览器异常消息包含编辑 URL 时也会移除会话 token", async () => {
    const result = await runFixture("open-error");
    const draft = jsonLines(result.stdout).find((line) => line.platform === "wechat-mp");

    expect(result.code).toBe(5);
    expect(draft).toMatchObject({ ok: false });
    expect(String(draft?.error)).toContain("[REDACTED]");
    expect(JSON.stringify(draft)).not.toContain("token-123");
  });
});
