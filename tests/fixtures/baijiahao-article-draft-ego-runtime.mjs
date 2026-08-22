import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "baijiahao",
  id: "2026-08-23_集成测试",
  title: "Harness 生成的百家号标题",
  summary: "Harness 生成的百家号摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-baijiahao-contract-test",
};

const state = {
  href: "https://baijiahao.baidu.com/builder/rc/edit",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  body: {
    get innerText() {
      if (scenario === "login") return "登录百家号";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "百家号工作台";
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
      return typeof body === "string" ? JSON.parse(body) : body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

async function fetch(url, options = {}) {
  const requestUrl = String(url);
  if (requestUrl.includes("/builder/app/appinfo")) {
    state.requests.push({ kind: "auth", method: options.method || "GET", url: requestUrl });
    if (scenario === "login") return response({ errno: 100, errmsg: "not login" }, 401);
    return response({
      errno: 0,
      errmsg: "success",
      data: { user: { userid: "user-7", name: "测试作者" } },
    });
  }
  if (requestUrl.endsWith("/builder/rc/edit")) {
    state.requests.push({ kind: "credential", method: options.method || "GET", url: requestUrl });
    return response("<script>window.__BJH__INIT__AUTH__ = 'auth-token-7'</script>");
  }
  if (requestUrl.includes("/pcui/picture/uploadproxy")) {
    const entries = [...options.body.entries()];
    state.requests.push({
      kind: "cover",
      method: options.method,
      hasFile: entries.some(([name, value]) => name === "media" && value instanceof Blob),
      articleType: entries.find(([name]) => name === "article_type")?.[1],
      url: requestUrl,
    });
    return response({
      errno: 0,
      errmsg: "success",
      ret: { https_url: "https://pic.rmb.bdstatic.com/cover-7.png" },
    });
  }
  if (requestUrl.includes("/pcui/article/save?callback=bjhdraft")) {
    const form = options.body;
    state.requests.push({
      kind: "save",
      method: options.method,
      token: options.headers?.token,
      title: form.get("title"),
      summary: form.get("subtitle"),
      body: form.get("content"),
      originalStatus: form.get("original_status"),
      url: requestUrl,
    });
    if (scenario === "save-failure") {
      return response("bjhdraft({\"errno\":500,\"errmsg\":\"save rejected\"})");
    }
    return response("bjhdraft({\"errno\":0,\"errmsg\":\"success\",\"ret\":{\"article_id\":\"article-42\"}})");
  }
  throw new Error(`unexpected request: ${requestUrl}`);
}

async function runBrowserExpression(source) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "document",
    "location",
    "fetch",
    "FormData",
    "Blob",
    "atob",
    "URL",
    "URLSearchParams",
    "Uint8Array",
    `return await (${source});`,
  );
  return execute(
    document,
    location,
    fetch,
    FormData,
    Blob,
    atob,
    URL,
    URLSearchParams,
    Uint8Array,
  );
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
  async () => ({ id: 9 }),
  async (url) => {
    state.href = String(url);
    state.draftOpened = state.href.includes("article_id=");
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
