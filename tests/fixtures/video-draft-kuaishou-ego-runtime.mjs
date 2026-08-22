import { readFile } from "node:fs/promises";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("video draft script path is required");

const expectedCaption = "快手标题\n快手正文\n#AI工具 #自动化测试";
const input = {
  platform: "kuaishou",
  taskSpace: "17",
  expectedTitle: "快手标题",
  expectedCaption,
  expectedFileName: "demo.mp4",
};
const state = { handedOff: [] };
const editor = {
  innerText: expectedCaption,
  getBoundingClientRect: () => ({ width: 521, height: 167 }),
};
const finalButton = {
  innerText: "发布",
  textContent: "发布",
  className: "_button_3a3lq_1 _button-primary_3a3lq_60",
  disabled: false,
  getBoundingClientRect: () => ({ width: 96, height: 36 }),
  getAttribute: () => null,
};
const document = {
  querySelector(selector) {
    return selector.includes("work-description-edit") ? editor : null;
  },
  querySelectorAll(selector) {
    if (selector.includes("work-description-edit")) return [editor];
    return [finalButton];
  },
};
const window = {
  __VIDEO_PUBLISHER_FINAL_GUARD__: { armed: true, version: 2, blockedAttempts: [] },
};
const location = { href: "https://cp.kuaishou.com/article/publish/video" };

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
  "browserFetch",
  "process",
  source,
);

await execute(
  input,
  (value) => { console.log(value); },
  async () => ({ id: 17 }),
  async () => ({ url: "https://cp.kuaishou.com/article/publish/video" }),
  runBrowserExpression,
  async () => undefined,
  async () => undefined,
  async () => undefined,
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  async () => JSON.stringify({
    result: 1,
    data: {
      fileId: 3931743938,
      fileName: "demo.mp4",
      caption: "快手标题<div>快手正文</div><div>#AI工具 #自动化测试</div>",
      photoStatus: 1,
      mediaId: "12767245217797416225892206",
      videoDuration: 3000,
    },
  }),
  process,
);

console.log(JSON.stringify({ fixture: true, handedOff: state.handedOff }));
