import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "sohu",
  id: "2026-08-23_搜狐集成测试",
  title: "Harness 生成的搜狐号标题",
  summary: "Harness 生成的搜狐号摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-sohu-contract-test",
};

const state = {
  href: "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  cookie: "mp-cv=fixture-sp-cm",
  body: {
    get innerText() {
      if (scenario === "login") return "账号登录 手机登录 注册账号";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "搜狐号图文编辑器";
    },
  },
  querySelectorAll() {
    if (!state.draftOpened) return [];
    return [{
      value: scenario === "verification-failure" ? "不匹配的标题" : input.title,
      textContent: "",
    }];
  },
};

const location = {
  get href() {
    return state.href;
  },
  set href(value) {
    state.href = String(value);
  },
  get pathname() {
    return new URL(state.href).pathname;
  },
  get search() {
    return new URL(state.href).search;
  },
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

async function fetch(url, options = {}) {
  const requestUrl = String(url);
  if (requestUrl.includes("/mpbp/bp/account/list")) {
    state.requests.push({ kind: "account", method: options.method || "GET", url: requestUrl });
    return response({
      code: 2000000,
      data: { data: [{ accounts: [{ id: "7", nickName: "测试搜狐号", avatar: "" }] }] },
    });
  }
  if (requestUrl.includes("/mpbp/bp/news/v4/news/draft/v2")) {
    const body = JSON.parse(options.body);
    state.requests.push({
      kind: "save",
      method: options.method,
      accountId: body.accountId,
      title: body.title,
      content: body.content,
      declareOriginal: body.declareOriginal,
      headers: options.headers,
      url: requestUrl,
    });
    if (scenario === "save-failure") return response({ success: false, msg: "save rejected" });
    return response({ success: true, data: "sohu-draft-42" });
  }
  throw new Error(`unexpected request: ${requestUrl}`);
}

async function runBrowserExpression(source) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "document",
    "location",
    "fetch",
    "URL",
    "URLSearchParams",
    "Math",
    `return await (${source});`,
  );
  return execute(document, location, fetch, URL, URLSearchParams, Math);
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
  "handOffTaskSpace",
  "process",
  source,
);

await execute(
  input,
  (value) => { console.log(value); },
  async () => ({ id: 13 }),
  async (url) => {
    state.href = scenario === "login"
      ? "https://mp.sohu.com/mpfe/v4/login"
      : String(url);
    state.draftOpened = state.href.includes("contentStatus=2") && state.href.includes("id=sohu-draft-42");
    return { url: state.href };
  },
  async () => undefined,
  async () => ({ url: state.href }),
  async () => document.body.innerText,
  runBrowserExpression,
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  process,
);

console.log(JSON.stringify({
  fixture: true,
  handedOff: state.handedOff,
  openedDraft: state.draftOpened,
  requests: state.requests,
}));
