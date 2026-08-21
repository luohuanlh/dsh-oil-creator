import { readFile } from "node:fs/promises";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("video draft script path is required");

const input = {
  platform: "douyin",
  taskSpace: "5",
  expectedTitle: "RC草稿流程验证：本地测试画面",
};
const state = {
  href: "https://creator.douyin.com/creator-micro/content/post/video?enter_from=draft",
  handedOff: [],
};
const document = {
  querySelectorAll(selector) {
    if (selector === "input") {
      return [{ placeholder: "作品标题", value: input.expectedTitle }];
    }
    return [];
  },
};
const location = {
  get href() { return state.href; },
  set href(value) { state.href = String(value); },
};
const performance = {
  getEntriesByType() {
    return [{
      name: "https://creator.douyin.com/web/api/media/video/transend/?video_id=v0200fg10000fixture",
    }];
  },
  clearResourceTimings() {},
};

async function runBrowserExpression(source) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    "document",
    "location",
    "performance",
    "URL",
    `return await (${source});`,
  );
  return execute(document, location, performance, URL);
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
  async () => ({ id: 5 }),
  async () => ({ url: state.href }),
  runBrowserExpression,
  async () => undefined,
  async () => undefined,
  async (url) => { state.href = String(url); },
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  process,
);

console.log(JSON.stringify({ fixture: true, handedOff: state.handedOff }));
