import { readFile } from "node:fs/promises";

const [scriptPath, platform, scenario = "success"] = process.argv.slice(2);
if (!scriptPath || !platform) {
  throw new Error("article draft script path and platform are required");
}

const platformNames = {
  penguin: "企鹅号",
  netease: "网易号",
  yidian: "一点号",
  dayu: "大鱼号",
  dingduan: "顶端新闻",
  "10jqka": "同顺号",
  ofweek: "维科网",
  laohu: "老虎财经",
  futu: "富途牛牛",
};
if (!platformNames[platform]) throw new Error(`unsupported fixture platform: ${platform}`);

const input = {
  platform,
  id: `2026-08-23_${platformNames[platform]}集成测试`,
  title: `Harness 生成的${platformNames[platform]}标题`,
  summary: `Harness 生成的${platformNames[platform]}摘要`,
  html: "<section><h1>平台正文</h1><p>仅用于本地契约测试。</p></section>",
  tags: ["AI"],
  coverMime: "image/png",
  coverBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  taskName: `oil-${platform}-contract-test`,
};

const workspaceUrls = {
  penguin: "https://om.qq.com/main/creation/article",
  netease: "https://mp.163.com/index.html#/post/article",
  yidian: "https://mp.yidianzixun.com/#/Writing",
  dayu: "https://mp.dayu.com/dashboard/article/write",
  dingduan: "https://mp.topnews.cn/#/scriptWrite",
  "10jqka": "https://t.10jqka.com.cn/newcircle/creation/adviserEnterGuide/",
  ofweek: "https://mp.ofweek.com/article/publish.html",
  laohu: "https://www.laohu8.com/",
  futu: "https://www.futunn.com/",
};

const draftUrls = {
  penguin: "https://om.qq.com/main/creation/article?articleId=penguin-draft-42",
  netease: "https://mp.163.com/index.html#/edit/article/netease-draft-42?wemediaId=media-7",
  yidian: "https://mp.yidianzixun.com/#/Writing/yidian-draft-42",
  dayu: "https://mp.dayu.com/dashboard/article/write?draft_id=dayu-draft-42",
  dingduan: "https://mp.topnews.cn/#/scriptWrite?draftId=dingduan-draft-42",
  "10jqka": "https://t.10jqka.com.cn/newcircle/creation/editor?draftId=10jqka-draft-42",
  ofweek: "https://mp.ofweek.com/article/edit/id/ofweek-draft-42.html",
  laohu: "https://www.laohu8.com/editor?draftId=laohu-draft-42",
  futu: "https://www.futunn.com/community/editor?draftId=futu-draft-42",
};

const loginStates = {
  penguin: { url: "https://om.qq.com/userAuth/index", text: "QQ登录 微信登录 立即登录" },
  netease: { url: "https://mp.163.com/login.html", text: "登录 / 注册 立即注册网易邮箱账号" },
  yidian: { url: "https://mp.yidianzixun.com/", text: "注册登录 注册一点号" },
  dayu: { url: "https://mp.dayu.com/?redirect_url=%2Fdashboard%2Findex", text: "扫码登录 密码登录" },
  dingduan: { url: "https://mp.topnews.cn/#/login", text: "扫码登录 扫描二维码登录" },
  "10jqka": { url: workspaceUrls["10jqka"], text: "未登录 登录" },
  ofweek: { url: "https://mp.ofweek.com/index/login_member.html", text: "账号密码登录 入驻维科号" },
  laohu: { url: "https://www.laohu8.com/login", text: "登录后可发布" },
  futu: { url: "https://www.futunn.com/login", text: "登录/注册" },
};

const state = {
  href: scenario === "login" ? loginStates[platform].url : workspaceUrls[platform],
  text: scenario === "login"
    ? loginStates[platform].text
    : `${platformNames[platform]}图文编辑器`,
  openedDraft: false,
  handedOff: [],
  stages: [],
};

async function js(source) {
  const stage = [
    "OIL_BROWSER_FORM_INSPECT",
    "OIL_BROWSER_FORM_SAVE",
    "OIL_BROWSER_FORM_VERIFY",
    "OIL_PENGUIN_SAVE",
    "OIL_PENGUIN_VERIFY",
    "OIL_NETEASE_INSPECT",
    "OIL_NETEASE_SAVE",
    "OIL_NETEASE_VERIFY",
    "OIL_YIDIAN_INSPECT",
    "OIL_YIDIAN_SAVE",
    "OIL_YIDIAN_VERIFY",
    "OIL_DAYU_INSPECT",
    "OIL_DAYU_SAVE",
    "OIL_DAYU_VERIFY",
    "OIL_DINGDUAN_INSPECT",
    "OIL_DINGDUAN_SAVE",
    "OIL_DINGDUAN_VERIFY",
    "OIL_OFWEEK_INSPECT",
    "OIL_OFWEEK_SAVE",
    "OIL_OFWEEK_VERIFY",
  ].find((marker) => source.includes(marker));
  if (!stage) throw new Error(`unexpected browser expression for ${platform}`);
  state.stages.push(stage);

  if (stage.endsWith("INSPECT")) {
    if (stage === "OIL_BROWSER_FORM_INSPECT") {
      if (scenario === "login") return { titleSelector: "", contentSelector: "", url: state.href };
      return { titleSelector: "#title", contentSelector: "#content", url: state.href };
    }
    if (platform === "ofweek") {
      return scenario === "login"
        ? { ok: false, draftControlReady: false, url: state.href }
        : { ok: true, draftControlReady: true, url: state.href };
    }
    if (platform === "netease") {
      return { ok: true, wemediaId: "media-7", categoryPath: "1/2" };
    }
    if (platform === "yidian") return { ok: true, userId: "user-7", mediaName: "Harness" };
    if (platform === "dayu") {
      return { ok: true, utoken: "secret-token", mediaId: "media-7", mediaName: "Harness" };
    }
    return { ok: true };
  }

  if (stage.endsWith("SAVE")) {
    if (scenario === "save-failure") {
      return { ok: false, error: `${platformNames[platform]}保存草稿失败` };
    }
    return {
      ok: true,
      remoteId: `${platform}-draft-42`,
      draftUrl: draftUrls[platform],
      evidence: {
        finalPublishBlocked: true,
        fixtureProtocol: stage,
      },
    };
  }

  return {
    verified: scenario !== "verification-failure",
    titleMatched: scenario !== "verification-failure",
    idMatched: true,
    loggedOut: false,
    url: state.href,
  };
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
  async () => ({ id: 23 }),
  async (url) => {
    if (scenario === "login") {
      state.href = loginStates[platform].url;
      state.text = loginStates[platform].text;
    } else {
      state.href = String(url);
      state.text = state.href === draftUrls[platform]
        ? `${platformNames[platform]}草稿 ${input.title}`
        : `${platformNames[platform]}图文编辑器`;
    }
    state.openedDraft = state.href === draftUrls[platform];
    return { url: state.href };
  },
  async () => undefined,
  async () => ({ url: state.href }),
  async () => state.text,
  js,
  async (id) => {
    state.handedOff.push(String(id));
    return { done: true };
  },
  process,
);

console.log(JSON.stringify({
  fixture: true,
  platform,
  handedOff: state.handedOff,
  openedDraft: state.openedDraft,
  stages: state.stages,
}));
