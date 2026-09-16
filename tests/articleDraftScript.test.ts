import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runtimeFixture = resolve(process.cwd(), "tests/fixtures/article-draft-ego-runtime.mjs");
const baijiahaoRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/baijiahao-article-draft-ego-runtime.mjs",
);
const zhihuRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/zhihu-article-draft-ego-runtime.mjs",
);
const sohuRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/sohu-article-draft-ego-runtime.mjs",
);
const xueqiuRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/xueqiu-article-draft-ego-runtime.mjs",
);
const eastmoneyRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/eastmoney-article-draft-ego-runtime.mjs",
);
const weiboRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/weibo-article-draft-ego-runtime.mjs",
);
const extendedPlatformsRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/extended-platforms-article-draft-ego-runtime.mjs",
);
const toutiaoXhsNoteRuntimeFixture = resolve(
  process.cwd(),
  "tests/fixtures/toutiao-xhs-note-article-draft-ego-runtime.mjs",
);
const articleDraftScript = resolve(process.cwd(), "scripts/article-draft.mjs");

type ExtendedArticlePlatform =
  | "penguin"
  | "netease"
  | "yidian"
  | "dayu"
  | "dingduan"
  | "10jqka"
  | "ofweek"
  | "laohu"
  | "futu";

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

async function runBaijiahaoFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      baijiahaoRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runZhihuFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      zhihuRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runSohuFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      sohuRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runXueqiuFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      xueqiuRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runEastmoneyFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      eastmoneyRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runWeiboFixture(
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      weiboRuntimeFixture,
      articleDraftScript,
      scenario,
    ]);
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

async function runExtendedPlatformFixture(
  platform: ExtendedArticlePlatform,
  scenario: "success" | "login" | "verification-failure" | "save-failure" | "cover-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      extendedPlatformsRuntimeFixture,
      articleDraftScript,
      platform,
      scenario,
    ]);
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

async function runToutiaoXhsNoteFixture(
  platform: "toutiao" | "xiaohongshu-note",
  scenario: "success" | "login" | "verification-failure" | "save-failure",
): Promise<FixtureRun> {
  try {
    const result = await execFileAsync(process.execPath, [
      toutiaoXhsNoteRuntimeFixture,
      articleDraftScript,
      platform,
      scenario,
    ]);
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

describe("Article Publisher 统一契约", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("通过平台注册表分派 inspect、saveDraft 和 verify", () => {
    expect(source).toContain("registerArticleAdapter");
    expect(source).toContain("adapter.inspect");
    expect(source).toContain("adapter.saveDraft");
    expect(source).toContain("adapter.verify");
    expect(source).not.toContain('if (input.platform === "baijiahao")');
  });

  it("统一输出明确的远端验证或阻塞状态", () => {
    expect(source).toContain('status: browserLocal ? "LOCAL_VERIFIED" : "REMOTE_VERIFIED"');
    expect(source).toContain('status: "BLOCKED_AUTH"');
    expect(source).toContain('status: "REMOTE_UNVERIFIED"');
  });

  it("浏览器表达式不以会被 Ego 误判的块注释开头", () => {
    expect(source).not.toContain("String.raw`/* OIL_");
  });
});

describe("头条号 Article Adapter", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/article/platforms/toutiao.mjs"),
    "utf8",
  );

  it("只观察 save=0 自动保存并回读草稿列表", () => {
    expect(source).toContain("OIL_TOUTIAO_SAVE");
    expect(source).toContain("save=0");
    expect(source).toContain("creator_center/draft_list");
    expect(source).toContain("exclusiveDisabled");
    expect(source).not.toContain(".click();\n        const publish");
  });

  it("完成远端草稿 ID、封面、标题与非首发回读", async () => {
    const result = await runToutiaoXhsNoteFixture("toutiao", "success");
    const lines = jsonLines(result.stdout);
    expect(result.code, result.stderr).toBe(0);
    expect(lines.find((line) => line.platform === "toutiao")).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      remoteId: "toutiao-draft-42",
      draftStorage: "remote",
      taskSpace: "31",
      handedOff: false,
    });
  });

  it("登录、保存与回读失败保持准确状态", async () => {
    const login = await runToutiaoXhsNoteFixture("toutiao", "login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "toutiao"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH" });

    const saveFailure = await runToutiaoXhsNoteFixture("toutiao", "save-failure");
    expect(saveFailure.code).toBe(3);

    const verificationFailure = await runToutiaoXhsNoteFixture("toutiao", "verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "toutiao"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("小红书图文笔记 Article Adapter", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/article/platforms/xiaohongshu-note.mjs"),
    "utf8",
  );

  it("只点击关闭 Shadow DOM 中的暂存离开并回读 IndexedDB", () => {
    expect(source).toContain("暂存离开");
    expect(source).toContain("draft-database-v1");
    expect(source).toContain("image-draft");
    expect(source).toContain('draftStorage: "browser-local"');
    expect(source).not.toContain("submit-text");
  });

  it("返回浏览器本地草稿凭据，不伪装成远端 ID", async () => {
    const result = await runToutiaoXhsNoteFixture("xiaohongshu-note", "success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "xiaohongshu-note");
    const trace = lines.find((line) => line.fixture === true);
    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "LOCAL_VERIFIED",
      verified: true,
      draftReceipt: "xiaohongshu-note:browser-local:xhs-local-draft-42",
      draftStorage: "browser-local",
      taskSpace: "31",
      handedOff: true,
    });
    expect(draft).not.toHaveProperty("remoteId");
    expect(trace).toMatchObject({
      cdpCalls: expect.arrayContaining([
        "Accessibility.getFullAXTree",
        "DOM.getBoxModel",
        "Input.dispatchMouseEvent",
      ]),
    });
  });

  it("登录、填写与本地回读失败均不误报远端成功", async () => {
    const login = await runToutiaoXhsNoteFixture("xiaohongshu-note", "login");
    expect(login.code).toBe(2);

    const saveFailure = await runToutiaoXhsNoteFixture("xiaohongshu-note", "save-failure");
    expect(saveFailure.code).toBe(3);

    const verificationFailure = await runToutiaoXhsNoteFixture(
      "xiaohongshu-note",
      "verification-failure",
    );
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) =>
      line.platform === "xiaohongshu-note"
    )).toMatchObject({ ok: false, status: "LOCAL_UNVERIFIED" });
  });
});

describe("微信公众号 Ego 草稿脚本", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts/article-draft.mjs"), "utf8");

  it("上传所选封面并调用草稿创建接口", () => {
    expect(source).toContain("coverBase64");
    expect(source).toContain("filetransfer?action=upload_material");
    expect(source).toContain("operate_appmsg?t=ajax-response&sub=create");
    expect(source).toContain("digest0");
    expect(source).toContain("content0");
  });

  it("创建后回读标题，只有浏览器本地草稿才把页面交给用户", () => {
    expect(source).toContain("verified");
    expect(source).toContain("expectedTitle");
    expect(source).toContain("handOffTaskSpace");
    expect(source).toContain("browserLocal ? await handOffTaskSpace(task.id)");
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
      handedOff: false,
    });
    expect(String(draft?.draftUrl)).toContain("appmsgid=appmsg-42");
    expect(String(draft?.draftUrl)).not.toContain("token=");
    expect(trace).toMatchObject({
      fixture: true,
      handedOff: [],
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
    expect(JSON.stringify(draft)).not.toContain("auth-secret-456");
  });
});

describe("百家号 Ego 草稿脚本", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("只保存草稿并包含登录、封面、保存和回读门禁", () => {
    expect(source).toContain("builder/app/appinfo");
    expect(source).toContain("pcui/picture/uploadproxy");
    expect(source).toContain("pcui/article/save?callback=bjhdraft");
    expect(source).toContain("article_id");
    expect(source).not.toMatch(/click\([^\n]*(发表|发布)/);
  });

  it("在模拟已登录页面中保存草稿并回读标题与 article_id", async () => {
    const result = await runBaijiahaoFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "baijiahao");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      verified: true,
      remoteId: "article-42",
      taskSpace: "9",
      handedOff: false,
      evidence: {
        coverUploaded: true,
        coverUsedAsFirstImage: true,
      },
    });
    expect(draft?.draftUrl).toBe(
      "https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id=article-42",
    );
    expect(trace).toMatchObject({
      fixture: true,
      handedOff: [],
      openedDraft: true,
      requests: [
        { kind: "auth", method: "GET" },
        { kind: "credential", method: "GET" },
        { kind: "cover", method: "POST", hasFile: true, articleType: "news" },
        {
          kind: "save",
          method: "POST",
          token: "auth-token-7",
          title: "Harness 生成的百家号标题",
          summary: "Harness 生成的百家号摘要",
          originalStatus: "0",
        },
      ],
    });
    expect(String((trace?.requests as Array<Record<string, unknown>>)?.[3]?.body))
      .toContain("https://pic.rmb.bdstatic.com/cover-7.png");
    expect(JSON.stringify(trace)).not.toMatch(/publish|发表|发布/i);
  });

  it("登录失效时交接页面且不上传或保存", async () => {
    const result = await runBaijiahaoFixture("login");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "baijiahao");

    expect(result.code).toBe(2);
    expect(draft).toMatchObject({
      ok: false,
      handedOff: true,
      taskSpace: "9",
      evidence: { authRequired: true, status: 401 },
    });
    expect(draft?.error).toContain("登录态已失效");
  });

  it("保存失败或页面回读不一致时拒绝报告成功", async () => {
    const saveFailure = await runBaijiahaoFixture("save-failure");
    const saveDraft = jsonLines(saveFailure.stdout).find((line) => line.platform === "baijiahao");
    expect(saveFailure.code).toBe(3);
    expect(saveDraft).toMatchObject({ ok: false, error: "百家号保存草稿失败" });

    const verificationFailure = await runBaijiahaoFixture("verification-failure");
    const verificationDraft = jsonLines(verificationFailure.stdout)
      .find((line) => line.platform === "baijiahao");
    expect(verificationFailure.code).toBe(4);
    expect(verificationDraft).toMatchObject({ ok: false, error: "百家号未通过草稿页面验证" });
  });
});

describe("知乎 Article Adapter", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/article/platforms/zhihu.mjs"),
    "utf8",
  );

  it("只创建和更新草稿，不包含最终发布请求", () => {
    expect(source).toContain('platform: "zhihu"');
    expect(source).toContain("zhuanlan.zhihu.com/api/articles/drafts");
    expect(source).toContain("/draft");
    expect(source).not.toContain("/publish");
  });

  it("在模拟已登录页面中创建、更新并回读知乎草稿", async () => {
    const result = await runZhihuFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "zhihu");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: "draft-42",
      draftUrl: "https://zhuanlan.zhihu.com/p/draft-42/edit",
      taskSpace: "11",
      handedOff: false,
    });
    expect(trace).toMatchObject({
      fixture: true,
      handedOff: [],
      openedDraft: true,
      requests: [
        { kind: "create", method: "POST", title: "Harness 生成的知乎标题", content: "" },
        { kind: "update", method: "PATCH", title: "Harness 生成的知乎标题" },
      ],
    });
    expect(JSON.stringify(trace)).not.toMatch(/publish|发布|发表/i);
  });

  it("登录失效、保存拒绝或回读不一致时返回准确状态", async () => {
    const login = await runZhihuFixture("login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "zhihu"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runZhihuFixture("save-failure");
    expect(saveFailure.code).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === "zhihu"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runZhihuFixture("verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "zhihu"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("搜狐号 Article Adapter", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("只调用搜狐号草稿接口且不声明原创", () => {
    expect(source).toContain('platform: "sohu"');
    expect(source).toContain("/mpbp/bp/account/list");
    expect(source).toContain("/news/draft/v2");
    expect(source).toContain("declareOriginal: false");
  });

  it("在模拟已登录页面中保存并回读搜狐号草稿", async () => {
    const result = await runSohuFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "sohu");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      remoteId: "sohu-draft-42",
      taskSpace: "13",
      handedOff: false,
    });
    expect(trace).toMatchObject({
      fixture: true,
      openedDraft: true,
      requests: [
        { kind: "account", method: "GET" },
        {
          kind: "save",
          method: "POST",
          accountId: 7,
          title: "Harness 生成的搜狐号标题",
          declareOriginal: false,
        },
      ],
    });
    expect(JSON.stringify(trace)).not.toMatch(/publish|发表|发布/i);
  });

  it("登录、保存和回读失败均不误报草稿成功", async () => {
    const login = await runSohuFixture("login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "sohu"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runSohuFixture("save-failure");
    expect(saveFailure.code).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === "sohu"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runSohuFixture("verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "sohu"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("雪球号 Article Adapter", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("只调用雪球草稿保存接口", () => {
    expect(source).toContain('platform: "xueqiu"');
    expect(source).toContain("/xq/statuses/draft/save.json");
    expect(source).toContain("/writeV2/draft/");
  });

  it("在模拟已登录页面中保存并回读雪球草稿", async () => {
    const result = await runXueqiuFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "xueqiu");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      remoteId: "xueqiu-draft-42",
      draftUrl: "https://mp.xueqiu.com/writeV2/draft/xueqiu-draft-42",
      taskSpace: "15",
    });
    expect(trace).toMatchObject({
      fixture: true,
      openedDraft: true,
      requests: [{
        kind: "save",
        method: "POST",
        title: "Harness 生成的雪球号标题",
        isPrivate: "false",
      }],
    });
    expect(JSON.stringify(trace)).not.toMatch(/publish|发表|发布/i);
  });

  it("登录、保存和回读失败均返回独立阻塞状态", async () => {
    const login = await runXueqiuFixture("login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "xueqiu"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runXueqiuFixture("save-failure");
    expect(saveFailure.code).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === "xueqiu"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runXueqiuFixture("verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "xueqiu"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("东方财富号 Article Adapter", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("通过东方财富草稿代理创建和更新草稿", () => {
    expect(source).toContain('platform: "eastmoney"');
    expect(source).toContain("apifront/Tran/GetData");
    expect(source).toContain("draft/api/Article/SaveDraft");
  });

  it("在模拟已登录页面中完成创建、更新和回读", async () => {
    const result = await runEastmoneyFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "eastmoney");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      remoteId: "eastmoney-draft-42",
      taskSpace: "17",
    });
    expect(trace).toMatchObject({
      fixture: true,
      openedDraft: true,
      requests: [
        {
          kind: "create",
          method: "POST",
          credentials: "omit",
          title: "Harness 生成的东方财富标题",
        },
        {
          kind: "update",
          method: "POST",
          credentials: "omit",
          title: "Harness 生成的东方财富标题",
          draftId: "eastmoney-draft-42",
        },
      ],
    });
    expect(JSON.stringify(trace)).not.toMatch(/publish|发表|发布/i);
  });

  it("登录、草稿 API 和回读失败均不会升级远端状态", async () => {
    const login = await runEastmoneyFixture("login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "eastmoney"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runEastmoneyFixture("save-failure");
    expect(saveFailure.code).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === "eastmoney"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runEastmoneyFixture("verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "eastmoney"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("微博 Article Adapter", () => {
  const source = readFileSync(articleDraftScript, "utf8");

  it("只调用微博文章草稿创建和保存接口", () => {
    expect(source).toContain('platform: "weibo"');
    expect(source).toContain("/editor/draft/create");
    expect(source).toContain("/editor/draft/save");
    expect(source).not.toContain("/editor/publish");
  });

  it("在模拟已登录页面中创建、保存并回读微博文章草稿", async () => {
    const result = await runWeiboFixture("success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === "weibo");
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      remoteId: "weibo-draft-42",
      draftUrl: "https://card.weibo.com/article/v5/editor#/draft/weibo-draft-42",
      taskSpace: "19",
    });
    expect(trace).toMatchObject({
      fixture: true,
      openedDraft: true,
      requests: [
        { kind: "account", method: "GET" },
        { kind: "create", method: "POST" },
        {
          kind: "save",
          method: "POST",
          title: "Harness 生成的微博文章标题",
          save: "1",
          action: "1",
          status: "0",
        },
      ],
    });
    expect(JSON.stringify(trace)).not.toMatch(/publish|发表|发布/i);
  });

  it("登录、保存和回读失败均保留准确状态", async () => {
    const login = await runWeiboFixture("login");
    expect(login.code).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === "weibo"))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runWeiboFixture("save-failure");
    expect(saveFailure.code).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === "weibo"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runWeiboFixture("verification-failure");
    expect(verificationFailure.code).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === "weibo"))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

const extendedPlatformCases = [
  {
    platform: "penguin",
    name: "企鹅号",
    markers: [
      "om.qq.com/main/creation/article",
      "/marticlepublish/omSave",
      "无需标注",
      "/main/creation/article?articleId=",
    ],
  },
  {
    platform: "netease",
    name: "网易号",
    markers: ["/wemedia/article/status/api/publish.do", "operation: 'saveDraft'", "/wemedia/content/manage/list.do"],
  },
  {
    platform: "yidian",
    name: "一点号",
    markers: ["mp.yidianzixun.com/model/Article", "status: '0'", "/#/Writing/"],
  },
  {
    platform: "dayu",
    name: "大鱼号",
    markers: ["mp.dayu.com/dashboard/save-draft", "article_type: '1'", "draft_id="],
  },
  {
    platform: "dingduan",
    name: "顶端新闻",
    markers: ["resource.topnews.cn/api/article/add", "save_type: 1", "/api/draft/show?id="],
  },
  {
    platform: "10jqka",
    name: "同顺号",
    markers: [
      "mp.10jqka.com.cn/creation-editor/editor/",
      "/newupload/base64upload/",
      "/lgt/article_publish/auth/api/draft/v1/save",
      "/lgt/article_publish/auth/api/draft/v1/detail",
      "is_original: 0",
      "draft_status_desc === '草稿'",
    ],
  },
  {
    platform: "ofweek",
    name: "维科网",
    markers: [
      "mp.ofweek.com/article/publish.html",
      "/home/news/ajax_add",
      "/article/ajax_articles.html",
      "isDraft: 1",
      "edit_url",
      "OIL_OFWEEK_VERIFY",
    ],
  },
  {
    platform: "laohu",
    name: "老虎财经",
    markers: ["www.laohu8.com", "saveBrowserDraftForm", "保存草稿"],
  },
  {
    platform: "futu",
    name: "富途牛牛",
    markers: ["www.futunn.com", "saveBrowserDraftForm", "保存草稿"],
  },
] as const satisfies ReadonlyArray<{
  platform: ExtendedArticlePlatform;
  name: string;
  markers: readonly string[];
}>;

describe.each(extendedPlatformCases)("$name Article Adapter", ({ platform, name, markers }) => {
  const adapterSource = readFileSync(
    resolve(process.cwd(), `scripts/article/platforms/${platform}.mjs`),
    "utf8",
  );

  it("编码了草稿入口、保存协议和回读门禁", () => {
    expect(adapterSource).toContain(`platform: "${platform}"`);
    for (const marker of markers) expect(adapterSource).toContain(marker);
    expect(adapterSource).not.toContain("operation: 'publish'");
    expect(adapterSource).not.toContain("save_type: 2");
  });

  it("在模拟远端中完成 inspect、saveDraft 和 verify", async () => {
    const result = await runExtendedPlatformFixture(platform, "success");
    const lines = jsonLines(result.stdout);
    const draft = lines.find((line) => line.platform === platform);
    const trace = lines.find((line) => line.fixture === true);

    expect(result.code, result.stderr).toBe(0);
    expect(draft).toMatchObject({
      ok: true,
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: `${platform}-draft-42`,
      taskSpace: "23",
      handedOff: false,
      evidence: { finalPublishBlocked: true },
    });
    expect(trace).toMatchObject({
      fixture: true,
      platform,
      handedOff: [],
      openedDraft: true,
    });
    expect(JSON.stringify(trace)).not.toMatch(/operation.?publish|save_type.?2|群发/);
  });

  it("登录、保存和回读失败均不会误报成功", async () => {
    const login = await runExtendedPlatformFixture(platform, "login");
    expect(login.code, login.stderr).toBe(2);
    expect(jsonLines(login.stdout).find((line) => line.platform === platform))
      .toMatchObject({ ok: false, status: "BLOCKED_AUTH", handedOff: true });

    const saveFailure = await runExtendedPlatformFixture(platform, "save-failure");
    expect(saveFailure.code, saveFailure.stderr).toBe(3);
    expect(jsonLines(saveFailure.stdout).find((line) => line.platform === platform))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });

    const verificationFailure = await runExtendedPlatformFixture(platform, "verification-failure");
    expect(verificationFailure.code, verificationFailure.stderr).toBe(4);
    expect(jsonLines(verificationFailure.stdout).find((line) => line.platform === platform))
      .toMatchObject({ ok: false, status: "REMOTE_UNVERIFIED" });
  });
});

describe("同顺号封面与原创安全门禁", () => {
  it("封面上传失败时拒绝标记远端草稿", async () => {
    const result = await runExtendedPlatformFixture("10jqka", "cover-failure");
    expect(result.code).toBe(3);
    expect(jsonLines(result.stdout).find((line) => line.platform === "10jqka"))
      .toMatchObject({ ok: false, status: "BLOCKED_PLATFORM" });
  });

  it("生产 Adapter 不调用最终发布端点", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/article/platforms/10jqka.mjs"), "utf8");
    expect(source).toContain("is_original: 0");
    expect(source).toContain("info_source: JSON.stringify({ none: {} })");
    expect(source).not.toContain("/draft/v1/publish");
    expect(source).not.toContain("定时发布");
  });
});
