import { readFile } from "node:fs/promises";

const [scriptPath, scenario = "success"] = process.argv.slice(2);
if (!scriptPath) throw new Error("article draft script path is required");

const input = {
  platform: "wechat-mp",
  id: "2026-08-21_集成测试",
  title: "Harness 生成的公众号标题",
  summary: "Harness 生成的摘要",
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: "oil-wechat-contract-test",
};

const state = {
  href: "https://mp.weixin.qq.com/?token=token-123",
  draftOpened: false,
  handedOff: [],
  requests: [],
};

const document = {
  documentElement: {
    get innerHTML() {
      return "<script>window.wx={data:{t:'token-123'},ticket:'ticket-7',user_name:'user-9',time:'1787250000'}</script>";
    },
  },
  body: {
    get innerText() {
      if (scenario === "login") return "请使用微信扫描二维码";
      if (scenario === "verification-failure" && state.draftOpened) return "草稿编辑 不匹配的标题";
      return state.draftOpened ? `草稿编辑 ${input.title}` : "微信公众号工作台";
    },
  },
  querySelectorAll() {
    if (!state.draftOpened) return [];
    return [{ value: scenario === "verification-failure" ? "不匹配的标题" : input.title }];
  },
};

const location = {
  get href() {
    return state.href;
  },
  set href(value) {
    state.href = String(value);
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
  if (requestUrl.includes("filetransfer?action=upload_material")) {
    const entries = [...options.body.entries()];
    state.requests.push({
      kind: "cover",
      method: options.method,
      hasFile: entries.some(([name, value]) => name === "file" && value instanceof Blob),
      url: requestUrl,
    });
    return response({
      base_resp: { err_msg: "ok", ret: 0 },
      cdn_url: "https://mmbiz.qpic.cn/cover-9",
      content: JSON.stringify({ file_id: "cover-file-9" }),
    });
  }
  if (requestUrl.includes("operate_appmsg?t=ajax-response&sub=create")) {
    const form = options.body;
    state.requests.push({
      kind: "save",
      method: options.method,
      title: form.get("title0"),
      summary: form.get("digest0"),
      body: form.get("content0"),
      fileId: form.get("fileid0"),
      coverUrl: form.get("cdn_url0"),
      showCover: form.get("show_cover_pic0"),
      url: requestUrl,
    });
    return response({ appMsgId: "appmsg-42", base_resp: { ret: 0, err_msg: "ok" } });
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
  async () => ({ id: 7 }),
  async (url) => {
    if (scenario === "open-error" && String(url).includes("appmsgid=")) {
      throw new Error(`failed to open ${String(url)}`);
    }
    state.href = String(url);
    state.draftOpened = state.href.includes("appmsgid=");
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
