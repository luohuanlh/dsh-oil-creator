import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "zhihu",
  id: "2026-08-23_知乎集成测试",
  title: "Harness 生成的知乎标题",
  summary: "Harness 生成的知乎摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-zhihu-contract-test",
};

const state = {
  href: "https://zhuanlan.zhihu.com/write",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  body: {
    get innerText() {
      if (scenario === "login") return "验证码登录 密码登录 登录/注册";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "知乎文章编辑器";
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
  if (requestUrl.endsWith("/api/articles/drafts")) {
    const body = JSON.parse(options.body);
    state.requests.push({
      kind: "create",
      method: options.method,
      title: body.title,
      content: body.content,
      url: requestUrl,
    });
    if (scenario === "save-failure") return response("create rejected", 403);
    return response({ id: "draft-42" });
  }
  if (requestUrl.endsWith("/api/articles/draft-42/draft")) {
    const body = JSON.parse(options.body);
    state.requests.push({
      kind: "update",
      method: options.method,
      title: body.title,
      content: body.content,
      url: requestUrl,
    });
    return response({}, 204);
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
    `return await (${source});`,
  );
  return execute(document, location, fetch, URL);
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
  async () => ({ id: 11 }),
  async (url) => {
    state.href = scenario === "login"
      ? "https://www.zhihu.com/signin?next=https%3A%2F%2Fzhuanlan.zhihu.com%2Fwrite"
      : String(url);
    state.draftOpened = state.href.includes("/p/draft-42/edit");
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
