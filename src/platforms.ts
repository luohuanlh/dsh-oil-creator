/**
 * 平台目录参考 dsh-context-flow 的 22 平台清单，并补充网易云音乐、喜马拉雅听音频入口。
 *
 * `draftRunner` 只标记已经实现生产运行器的平台；账号入口和自动草稿能力
 * 必须分开，避免把“可以登录”误报成“已经支持自动草稿”。真实上线仍需页面回归。
 */
export const PUBLISH_PLATFORM_DEFINITIONS = {
  bilibili: {
    name: "B站",
    kind: "video",
    loginUrl: "https://passport.bilibili.com/login",
    workspaceUrl: "https://member.bilibili.com/platform/home",
    draftRunner: "video-publisher",
  },
  douyin: {
    name: "抖音",
    kind: "video",
    loginUrl: "https://creator.douyin.com/",
    workspaceUrl: "https://creator.douyin.com/creator-micro/home",
    draftRunner: "video-publisher",
  },
  xiaohongshu: {
    name: "小红书",
    kind: "video",
    loginUrl: "https://creator.xiaohongshu.com/",
    workspaceUrl: "https://creator.xiaohongshu.com/new/home",
    draftRunner: "video-publisher",
  },
  channels: {
    name: "视频号",
    kind: "video",
    loginUrl: "https://channels.weixin.qq.com/login.html",
    workspaceUrl: "https://channels.weixin.qq.com/platform",
    draftRunner: "video-publisher",
  },
  kuaishou: {
    name: "快手",
    kind: "video",
    loginUrl: "https://cp.kuaishou.com/",
    workspaceUrl: "https://cp.kuaishou.com/article/publish/video",
    draftRunner: "video-publisher",
  },
  toutiao: {
    name: "头条号",
    kind: "article",
    loginUrl: "https://mp.toutiao.com/",
    workspaceUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
    draftRunner: null,
  },
  baijiahao: {
    name: "百家号",
    kind: "article",
    loginUrl: "https://baijiahao.baidu.com/",
    workspaceUrl: "https://baijiahao.baidu.com/builder/rc/edit",
    draftRunner: null,
  },
  penguin: {
    name: "企鹅号",
    kind: "article",
    loginUrl: "https://om.qq.com/",
    workspaceUrl: "https://om.qq.com/userAuth/index",
    draftRunner: null,
  },
  netease: {
    name: "网易号",
    kind: "article",
    loginUrl: "https://mp.163.com/",
    workspaceUrl: "https://mp.163.com/",
    draftRunner: null,
  },
  yidian: {
    name: "一点号",
    kind: "article",
    loginUrl: "https://mp.yidianzixun.com/",
    workspaceUrl: "https://mp.yidianzixun.com/",
    draftRunner: null,
  },
  dayu: {
    name: "大鱼号",
    kind: "article",
    loginUrl: "https://mp.dayu.com/",
    workspaceUrl: "https://mp.dayu.com/",
    draftRunner: null,
  },
  dingduan: {
    name: "顶端新闻",
    kind: "article",
    loginUrl: "https://www.topnews.cn/",
    workspaceUrl: "https://www.topnews.cn/",
    draftRunner: null,
  },
  xueqiu: {
    name: "雪球号",
    kind: "article",
    loginUrl: "https://xueqiu.com/",
    workspaceUrl: "https://xueqiu.com/",
    draftRunner: null,
  },
  eastmoney: {
    name: "东方财富号",
    kind: "article",
    loginUrl: "https://mp.eastmoney.com/",
    workspaceUrl: "https://mp.eastmoney.com/",
    draftRunner: null,
  },
  "10jqka": {
    name: "同顺号",
    kind: "article",
    loginUrl: "https://t.10jqka.com.cn/",
    workspaceUrl: "https://t.10jqka.com.cn/",
    draftRunner: null,
  },
  sohu: {
    name: "搜狐号",
    kind: "article",
    loginUrl: "https://mp.sohu.com/",
    workspaceUrl: "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle",
    draftRunner: null,
  },
  weibo: {
    name: "微博",
    kind: "article",
    loginUrl: "https://weibo.com/",
    workspaceUrl: "https://weibo.com/",
    draftRunner: null,
  },
  zhihu: {
    name: "知乎",
    kind: "article",
    loginUrl: "https://www.zhihu.com/signin",
    workspaceUrl: "https://zhuanlan.zhihu.com/write",
    draftRunner: null,
  },
  ofweek: {
    name: "维科网",
    kind: "article",
    loginUrl: "https://mp.ofweek.com/",
    workspaceUrl: "https://mp.ofweek.com/",
    draftRunner: null,
  },
  laohu: {
    name: "老虎财经",
    kind: "article",
    loginUrl: "https://www.laohu8.com/",
    workspaceUrl: "https://www.laohu8.com/",
    draftRunner: null,
  },
  futu: {
    name: "富途牛牛",
    kind: "article",
    loginUrl: "https://www.futunn.com/",
    workspaceUrl: "https://www.futunn.com/",
    draftRunner: null,
  },
  "wechat-mp": {
    name: "微信公众号",
    kind: "article",
    loginUrl: "https://mp.weixin.qq.com/",
    workspaceUrl: "https://mp.weixin.qq.com/",
    draftRunner: "wechat-article-ego",
  },
  "netease-music": {
    name: "网易云音乐",
    kind: "audio",
    loginUrl: "https://music.163.com/#/login",
    workspaceUrl: "https://music.163.com/musician/artist/home",
    draftRunner: null,
  },
  ximalaya: {
    name: "喜马拉雅听",
    kind: "audio",
    loginUrl: "https://studio.ximalaya.com/",
    workspaceUrl: "https://studio.ximalaya.com/",
    draftRunner: null,
  },
} as const;

export type PublishPlatform = keyof typeof PUBLISH_PLATFORM_DEFINITIONS;
export type PlatformKind = (typeof PUBLISH_PLATFORM_DEFINITIONS)[PublishPlatform]["kind"];
export type DraftCapability =
  | "remote-verified"
  | "implemented-simulated"
  | "page-ready"
  | "unsupported";

export const PUBLISH_PLATFORMS = Object.freeze(
  Object.keys(PUBLISH_PLATFORM_DEFINITIONS) as [PublishPlatform, ...PublishPlatform[]],
);

// 账号设置展示完整平台清单；具体出现在哪个内容分组由客户端配置决定。
export const ACCOUNT_SETTINGS_PLATFORMS = PUBLISH_PLATFORMS;

export const AUTO_DRAFT_PLATFORMS = Object.freeze(
  PUBLISH_PLATFORMS.filter((platform) =>
    PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner !== null
  ) as PublishPlatform[],
);

export function isPublishPlatform(value: unknown): value is PublishPlatform {
  return typeof value === "string" && value in PUBLISH_PLATFORM_DEFINITIONS;
}

export function normalizeEnabledPlatforms(value: unknown): PublishPlatform[] {
  if (!Array.isArray(value)) return [...AUTO_DRAFT_PLATFORMS];
  const migrated = value.map((platform) => platform === "wechat" ? "channels" : platform);
  const enabled = new Set(migrated.filter(isPublishPlatform));
  return PUBLISH_PLATFORMS.filter((platform) => enabled.has(platform));
}

export function supportsAutoDraft(platform: PublishPlatform): boolean {
  return PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner !== null;
}

export function draftCapability(platform: PublishPlatform): DraftCapability {
  if (platform === "bilibili" || platform === "douyin" || platform === "kuaishou") return "remote-verified";
  if (platform === "wechat-mp"
    || platform === "xiaohongshu"
    || platform === "channels") return "implemented-simulated";
  return "unsupported";
}

export interface PlatformGenerationRule {
  platform: PublishPlatform;
  name: string;
  kind: PlatformKind;
  titleMax: number;
  summaryMax: number;
  tagsMax: number;
  guidance: string;
}

export function platformGenerationRule(platform: PublishPlatform): PlatformGenerationRule {
  const definition = PUBLISH_PLATFORM_DEFINITIONS[platform];
  const limits: Partial<Record<PublishPlatform, Pick<PlatformGenerationRule, "titleMax" | "summaryMax" | "tagsMax">>> = {
    xiaohongshu: { titleMax: 20, summaryMax: 100, tagsMax: 10 },
    douyin: { titleMax: 30, summaryMax: 100, tagsMax: 5 },
    bilibili: { titleMax: 80, summaryMax: 200, tagsMax: 10 },
    channels: { titleMax: 16, summaryMax: 120, tagsMax: 5 },
    kuaishou: { titleMax: 64, summaryMax: 380, tagsMax: 4 },
  };
  const limit = limits[platform] ?? { titleMax: 64, summaryMax: 120, tagsMax: 5 };
  return {
    platform,
    name: definition.name,
    kind: definition.kind,
    ...limit,
    guidance: definition.kind === "video"
      ? "body 是视频说明；tags 不带 #，不得虚构视频中不存在的事实。"
      : definition.kind === "audio"
      ? "body 是音频说明；保留原始音频事实，不得编造曲目、作者或版权信息。"
      : "body 是适配该平台的完整文章；保留原文事实，不得编造数据或引语。",
  };
}

export function toVideoPublisherPlatform(platform: PublishPlatform): string | undefined {
  if (PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner !== "video-publisher") return undefined;
  return platform === "channels" ? "wechat_channels" : platform;
}
