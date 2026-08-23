import { readFile } from "node:fs/promises";

const [scriptPath, platform, scenario = "success"] = process.argv.slice(2);
if (!scriptPath || !["toutiao", "xiaohongshu-note"].includes(platform)) {
  throw new Error("article draft script path and supported platform are required");
}

const names = {
  toutiao: "头条号",
  "xiaohongshu-note": "小红书图文笔记",
};
const workspaceUrls = {
  toutiao: "https://mp.toutiao.com/profile_v4/graphic/publish",
  "xiaohongshu-note": "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image",
};
const loginUrls = {
  toutiao: "https://mp.toutiao.com/auth/page/login",
  "xiaohongshu-note": "https://creator.xiaohongshu.com/login",
};
const input = {
  platform,
  id: `2026-08-23_${names[platform]}集成测试`,
  title: "测试文章 001",
  summary: "测试摘要",
  html: "<section><p>本地契约测试正文。</p></section>",
  tags: ["AI", "内容分发"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: `oil-${platform}-contract-test`,
};
const state = {
  href: scenario === "login" ? loginUrls[platform] : workspaceUrls[platform],
  text: scenario === "login" ? "扫码登录 手机号登录" : `${names[platform]}编辑器 草稿将自动保存 上传图文`,
  stages: [],
  cdpCalls: [],
  handedOff: [],
};

async function js(source) {
  const stage = [
    "OIL_TOUTIAO_INSPECT",
    "OIL_TOUTIAO_SAVE",
    "OIL_TOUTIAO_VERIFY",
    "OIL_XHS_NOTE_INSPECT",
    "OIL_XHS_NOTE_FILL",
    "OIL_XHS_NOTE_SAVED",
    "OIL_XHS_NOTE_VERIFY",
  ].find((marker) => source.includes(marker));
  if (!stage) throw new Error(`unexpected browser expression for ${platform}`);
  state.stages.push(stage);

  if (stage.endsWith("INSPECT")) {
    return platform === "xiaohongshu-note"
      ? { ok: true, uploadReady: true, draftIds: [], url: state.href }
      : { ok: true, titleReady: true, editorReady: true, autosaveReady: true, url: state.href };
  }
  if (stage === "OIL_TOUTIAO_SAVE") {
    if (scenario === "save-failure") return { ok: false, error: "头条号自动保存失败" };
    return {
      ok: true,
      remoteId: "toutiao-draft-42",
      draftUrl: `${workspaceUrls.toutiao}?pgc_id=toutiao-draft-42`,
      evidence: { saveFlag: 0, coverUploaded: true, exclusiveDisabled: true },
    };
  }
  if (stage === "OIL_XHS_NOTE_FILL") {
    if (scenario === "save-failure") return { ok: false, error: "小红书图文笔记填写失败" };
    return {
      ok: true,
      expectedBody: "本地契约测试正文。\n\n#AI #内容分发",
      titleMatched: true,
      bodyMatched: true,
    };
  }
  if (stage === "OIL_XHS_NOTE_SAVED") {
    return {
      ok: true,
      localDraftId: "xhs-local-draft-42",
      titleMatched: true,
      bodyMatched: true,
      imageStored: true,
      localNotice: true,
    };
  }
  return {
    verified: scenario !== "verification-failure",
    idMatched: true,
    titleMatched: scenario !== "verification-failure",
    draftMatched: true,
    coverMatched: true,
    exclusiveDisabled: true,
    imageMatched: true,
    cardMatched: true,
    localNotice: true,
    loggedOut: false,
    url: state.href,
  };
}

async function cdp(method) {
  state.cdpCalls.push(method);
  if (method === "Accessibility.getFullAXTree") {
    return { nodes: [{ role: { value: "button" }, name: { value: "暂存离开" }, backendDOMNodeId: 42 }] };
  }
  if (method === "DOM.getBoxModel") {
    return { model: { content: [740, 800, 860, 800, 860, 850, 740, 850] } };
  }
  return {};
}

const source = await readFile(scriptPath, "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction(
  "OIL_ARTICLE_INPUT",
  "cliLog",
  "useOrCreateTaskSpace",
  "openOrReuseTab",
  "wait",
  "pageInfo",
  "snapshotText",
  "js",
  "cdp",
  "handOffTaskSpace",
  "process",
  source,
);

await execute(
  input,
  (value) => { console.log(value); },
  async () => ({ id: 31 }),
  async (url) => {
    state.href = scenario === "login" ? loginUrls[platform] : String(url);
    state.text = scenario === "login"
      ? "扫码登录 手机号登录"
      : `${names[platform]}编辑器 草稿将自动保存 上传图文`;
    return { url: state.href };
  },
  async () => undefined,
  async () => ({ url: state.href }),
  async () => state.text,
  js,
  cdp,
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  process,
);

console.log(JSON.stringify({
  fixture: true,
  platform,
  stages: state.stages,
  cdpCalls: state.cdpCalls,
  handedOff: state.handedOff,
}));
