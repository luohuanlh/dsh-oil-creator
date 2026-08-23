import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "eastmoney",
  id: "2026-08-23_东方财富集成测试",
  title: "Harness 生成的东方财富标题",
  summary: "Harness 生成的东方财富摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-eastmoney-contract-test",
};

const state = {
  href: "https://mp.eastmoney.com/collect/pc_article/index.html#/",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  cookie: "ct=ctoken-7; ut=utoken-9",
  body: {
    get innerText() {
      if (scenario === "login") return "加入我们 解锁创作者专属权益";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "东方财富图文编辑器";
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
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

async function fetch(url, options = {}) {
  const requestUrl = String(url);
  if (requestUrl.includes("/apifront/Tran/GetData")) {
    const requestBody = JSON.parse(options.body);
    const parm = JSON.parse(requestBody.parm);
    const values = Object.fromEntries(parm.flatMap((entry) => Object.entries(entry)));
    const kind = values.draftid ? "update" : "create";
    state.requests.push({
      kind,
      method: options.method,
      credentials: options.credentials,
      title: decodeURIComponent(values.title),
      text: decodeURIComponent(values.text),
      ctoken: values.ctoken,
      utoken: values.utoken,
      draftId: values.draftid,
      url: requestUrl,
    });
    if (scenario === "save-failure") {
      return response({ RRquestSuccess: false, RCode: 500, RMsg: "save rejected", RData: "{}" });
    }
    return response({
      RRquestSuccess: true,
      RCode: 200,
      RMsg: "ok",
      RData: JSON.stringify({ error_code: 0, draft_id: "eastmoney-draft-42" }),
    });
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
    "crypto",
    "Uint8Array",
    `return await (${source});`,
  );
  return execute(document, location, fetch, URL, crypto, Uint8Array);
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
  async () => ({ id: 17 }),
  async (url) => {
    state.href = scenario === "login"
      ? "https://mp.eastmoney.com/collect/pc_writer/usercenter.html#/"
      : String(url);
    state.draftOpened = state.href.includes("id=eastmoney-draft-42");
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
