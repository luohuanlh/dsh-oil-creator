import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "xueqiu",
  id: "2026-08-23_雪球集成测试",
  title: "Harness 生成的雪球号标题",
  summary: "Harness 生成的雪球号摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-xueqiu-contract-test",
};

const state = {
  href: "https://mp.xueqiu.com/writeV2",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  body: {
    get innerText() {
      if (scenario === "login") return "未登录 首页 发布长文 草稿箱";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "测试用户 发布长文 草稿箱";
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
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

async function fetch(url, options = {}) {
  const requestUrl = String(url);
  if (requestUrl.includes("/xq/statuses/draft/save.json")) {
    const form = options.body;
    state.requests.push({
      kind: "save",
      method: options.method,
      title: form.get("title"),
      content: form.get("text"),
      isPrivate: form.get("is_private"),
      url: requestUrl,
    });
    if (scenario === "save-failure") return response({ error_description: "save rejected" });
    return response({ id: "xueqiu-draft-42" });
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
    `return await (${source});`,
  );
  return execute(document, location, fetch, URL, URLSearchParams);
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
  async () => ({ id: 15 }),
  async (url) => {
    state.href = String(url);
    state.draftOpened = state.href.includes("/writeV2/draft/xueqiu-draft-42");
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
