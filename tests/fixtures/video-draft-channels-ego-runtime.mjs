import { readFile } from "node:fs/promises";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("video draft script path is required");

const expectedDescription = "视频号说明 #视频号标签";
const input = {
  platform: "channels",
  taskSpace: "23",
  expectedDescription,
};
const state = { savedNotice: false, networkDelivered: false, handedOff: [] };
function element(text, extra = {}) {
  return {
    innerText: text,
    textContent: text,
    disabled: false,
    className: "",
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 96, height: 36 }),
    getAttribute: () => null,
    ...extra,
  };
}
const editor = element(expectedDescription, { className: "input-editor", value: "" });
const saveButton = element("保存草稿");
const finalButton = element("发表");
const shadowRoot = {
  host: {
    get innerText() { return state.savedNotice ? "保存成功" : "视频管理 发表动态"; },
  },
  querySelectorAll(selector) {
    if (selector.includes("contenteditable") || selector.includes("textarea")) return [editor];
    if (selector.includes("button") || selector.includes("[role=\"button\"]")) return [saveButton, finalButton];
    return [];
  },
};
const host = { shadowRoot };
const document = {
  querySelectorAll(selector) {
    if (selector === "*") return [host];
    return [];
  },
  body: { innerText: "视频号助手" },
};
const window = {
  __VIDEO_PUBLISHER_FINAL_GUARD__: { armed: true, version: 2, blockedAttempts: [] },
};
const location = { href: "https://channels.weixin.qq.com/platform/post/create" };

async function runBrowserExpression(source) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "document",
    "window",
    "location",
    "getComputedStyle",
    `return await (${source});`,
  );
  return execute(document, window, location, () => ({ display: "block", visibility: "visible" }));
}

const source = await readFile(scriptPath, "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction(
  "OIL_VIDEO_DRAFT_INPUT",
  "cliLog",
  "useOrCreateTaskSpace",
  "pageInfo",
  "js",
  "click",
  "wait",
  "openOrReuseTab",
  "handOffTaskSpace",
  "cdp",
  "drainEvents",
  "process",
  source,
);

await execute(
  input,
  (value) => { console.log(value); },
  async () => ({ id: 23 }),
  async () => ({ url: location.href }),
  runBrowserExpression,
  async (target) => {
    if (Array.isArray(target)) state.savedNotice = true;
  },
  async () => undefined,
  async () => undefined,
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  async () => undefined,
  async () => {
    if (!state.savedNotice || state.networkDelivered) return [];
    state.networkDelivered = true;
    return [{
      method: "Network.responseReceived",
      params: {
        response: {
          url: "https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_draft?_rid=fixture",
          status: 201,
        },
      },
    }];
  },
  process,
);

console.log(JSON.stringify({ fixture: true, handedOff: state.handedOff }));
