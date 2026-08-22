import { readFile } from "node:fs/promises";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("video draft script path is required");

const input = {
  platform: "xiaohongshu",
  taskSpace: "21",
  expectedTitle: "小红书草稿验证",
};
const state = {
  href: "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video",
  editorVisible: true,
  handedOff: [],
};
function element(text, extra = {}) {
  return {
    innerText: text,
    textContent: text,
    disabled: false,
    id: "",
    children: [],
    getBoundingClientRect: () => ({ width: 96, height: 36 }),
    getAttribute: () => null,
    scrollIntoView() {},
    ...extra,
  };
}
const titleInput = element("", { placeholder: "填写标题", value: input.expectedTitle });
const saveButton = element("暂存离开");
const finalButton = element("发布笔记");
const continueButton = element("继续发布");
const document = {
  querySelectorAll(selector) {
    if (selector.includes("input") || selector.includes("textarea")) {
      return state.editorVisible ? [titleInput] : [];
    }
    if (selector.includes("button") || selector.includes("div") || selector.includes("span")) {
      return state.editorVisible ? [saveButton, finalButton] : [continueButton];
    }
    return [];
  },
};
const window = {
  __VIDEO_PUBLISHER_FINAL_GUARD__: { armed: true, version: 2, blockedAttempts: [] },
};
const location = {
  get href() { return state.href; },
  set href(value) { state.href = String(value); },
};

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
  "process",
  source,
);

await execute(
  input,
  (value) => { console.log(value); },
  async () => ({ id: 21 }),
  async () => ({ url: state.href }),
  runBrowserExpression,
  async (selector) => {
    if (String(selector).includes("oil-save-xiaohongshu-draft")) {
      state.editorVisible = false;
      state.href = "https://creator.xiaohongshu.com/publish/publish";
    }
  },
  async () => undefined,
  async (url) => { state.href = String(url); },
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  process,
);

console.log(JSON.stringify({ fixture: true, handedOff: state.handedOff }));
