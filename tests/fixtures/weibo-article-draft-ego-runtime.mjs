import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "weibo",
  id: "2026-08-23_微博集成测试",
  title: "Harness 生成的微博文章标题",
  summary: "Harness 生成的微博摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-weibo-contract-test",
};

const state = {
  href: "https://card.weibo.com/article/v5/editor",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  body: {
    get innerText() {
      if (scenario === "login") return "随时随地发现新鲜事 登录/注册";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "微博文章编辑器";
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
  get hash() {
    return new URL(state.href).hash;
  },
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

async function fetch(url, options = {}) {
  const requestUrl = String(url);
  if (requestUrl === "https://card.weibo.com/article/v5/editor") {
    state.requests.push({ kind: "account", method: options.method || "GET", url: requestUrl });
    return response("<script>window.page={config: JSON.parse('{\"uid\":\"uid-7\",\"nick\":\"测试微博\"}')}</script>");
  }
  if (requestUrl.includes("/draft/create")) {
    state.requests.push({ kind: "create", method: options.method, url: requestUrl });
    return response({ code: 100000, data: { id: "weibo-draft-42" } });
  }
  if (requestUrl.includes("/draft/save")) {
    const form = options.body;
    state.requests.push({
      kind: "save",
      method: options.method,
      title: form.get("title"),
      content: form.get("content"),
      save: form.get("save"),
      action: form.get("action"),
      status: form.get("status"),
      url: requestUrl,
    });
    if (scenario === "save-failure") return response({ code: 500001, msg: "save rejected" });
    return response({ code: 100000, msg: "ok" });
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
    "btoa",
    "Math",
    `return await (${source});`,
  );
  return execute(document, location, fetch, URL, URLSearchParams, btoa, Math);
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
  async () => ({ id: 19 }),
  async (url) => {
    state.href = scenario === "login"
      ? "https://weibo.com/newlogin?tabtype=weibo"
      : String(url);
    state.draftOpened = state.href.includes("#/draft/weibo-draft-42");
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
