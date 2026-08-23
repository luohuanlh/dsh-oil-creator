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
    draftCapability: "remote-verified",
  },
  douyin: {
    name: "抖音",
    kind: "video",
    loginUrl: "https://creator.douyin.com/",
    workspaceUrl: "https://creator.douyin.com/creator-micro/home",
    draftRunner: "video-publisher",
    draftCapability: "remote-verified",
  },
  xiaohongshu: {
    name: "小红书",
    kind: "video",
    loginUrl: "https://creator.xiaohongshu.com/",
    workspaceUrl: "https://creator.xiaohongshu.com/new/home",
    draftRunner: "video-publisher",
    draftCapability: "page-ready",
  },
  channels: {
    name: "视频号",
    kind: "video",
    loginUrl: "https://channels.weixin.qq.com/login.html",
    workspaceUrl: "https://channels.weixin.qq.com/platform",
    draftRunner: "video-publisher",
    draftCapability: "page-ready",
  },
  kuaishou: {
    name: "快手",
    kind: "video",
    loginUrl: "https://cp.kuaishou.com/",
    workspaceUrl: "https://cp.kuaishou.com/article/publish/video",
    draftRunner: "video-publisher",
    draftCapability: "remote-verified",
  },
  toutiao: {
    name: "头条号",
    kind: "article",
    loginUrl: "https://mp.toutiao.com/",
    workspaceUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
    draftRunner: null,
    draftCapability: "manual-handoff",
  },
  baijiahao: {
    name: "百家号",
    kind: "article",
    loginUrl: "https://baijiahao.baidu.com/",
    workspaceUrl: "https://baijiahao.baidu.com/builder/rc/edit",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  penguin: {
    name: "企鹅号",
    kind: "article",
    loginUrl: "https://om.qq.com/",
    workspaceUrl: "https://om.qq.com/main/creation/article",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  netease: {
    name: "网易号",
    kind: "article",
    loginUrl: "https://mp.163.com/",
    workspaceUrl: "https://mp.163.com/index.html#/post/article",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  yidian: {
    name: "一点号",
    kind: "article",
    loginUrl: "https://mp.yidianzixun.com/",
    workspaceUrl: "https://mp.yidianzixun.com/#/Writing",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  dayu: {
    name: "大鱼号",
    kind: "article",
    loginUrl: "https://mp.dayu.com/",
    workspaceUrl: "https://mp.dayu.com/dashboard/article/write",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  dingduan: {
    name: "顶端新闻",
    kind: "article",
    loginUrl: "https://mp.topnews.cn/#/login",
    workspaceUrl: "https://mp.topnews.cn/#/scriptWrite",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  xueqiu: {
    name: "雪球号",
    kind: "article",
    loginUrl: "https://xueqiu.com/",
    workspaceUrl: "https://mp.xueqiu.com/writeV2",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  eastmoney: {
    name: "东方财富号",
    kind: "article",
    loginUrl: "https://mp.eastmoney.com/",
    workspaceUrl: "https://mp.eastmoney.com/collect/pc_article/index.html#/",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  "10jqka": {
    name: "同顺号",
    kind: "article",
    loginUrl: "https://t.10jqka.com.cn/",
    workspaceUrl: "https://t.10jqka.com.cn/newcircle/creation/adviserEnterGuide/",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  sohu: {
    name: "搜狐号",
    kind: "article",
    loginUrl: "https://mp.sohu.com/",
    workspaceUrl: "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  weibo: {
    name: "微博",
    kind: "article",
    loginUrl: "https://weibo.com/",
    workspaceUrl: "https://card.weibo.com/article/v5/editor",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  zhihu: {
    name: "知乎",
    kind: "article",
    loginUrl: "https://www.zhihu.com/signin",
    workspaceUrl: "https://zhuanlan.zhihu.com/write",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  ofweek: {
    name: "维科网",
    kind: "article",
    loginUrl: "https://mp.ofweek.com/",
    workspaceUrl: "https://mp.ofweek.com/article/publish.html",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  laohu: {
    name: "老虎财经",
    kind: "article",
    loginUrl: "https://www.laohu8.com/",
    workspaceUrl: "https://www.laohu8.com/",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  futu: {
    name: "富途牛牛",
    kind: "article",
    loginUrl: "https://www.futunn.com/",
    workspaceUrl: "https://www.futunn.com/",
    draftRunner: null,
    draftCapability: "local-tested",
  },
  "wechat-mp": {
    name: "微信公众号",
    kind: "article",
    loginUrl: "https://mp.weixin.qq.com/",
    workspaceUrl: "https://mp.weixin.qq.com/",
    draftRunner: "article-ego",
    draftCapability: "remote-verified",
  },
  "netease-music": {
    name: "网易云音乐",
    kind: "audio",
    loginUrl: "https://music.163.com/#/login",
    workspaceUrl: "https://music.163.com/musician/artist/home",
    draftRunner: null,
    draftCapability: "unsupported",
  },
  ximalaya: {
    name: "喜马拉雅听",
    kind: "audio",
    loginUrl: "https://studio.ximalaya.com/",
    workspaceUrl: "https://studio.ximalaya.com/",
    draftRunner: null,
    draftCapability: "unsupported",
  },
} as const;

export type PublishPlatform = keyof typeof PUBLISH_PLATFORM_DEFINITIONS;
export type PlatformKind = (typeof PUBLISH_PLATFORM_DEFINITIONS)[PublishPlatform]["kind"];
type PlatformWithDraftRunner<Runner extends string> = {
  [Platform in PublishPlatform]:
    (typeof PUBLISH_PLATFORM_DEFINITIONS)[Platform]["draftRunner"] extends Runner
      ? Platform
      : never;
}[PublishPlatform];
export type ArticleDraftPlatform = PlatformWithDraftRunner<"article-ego">;
export type DraftCapability =
  | "remote-verified"
  | "local-tested"
  | "page-ready"
  | "manual-handoff"
  | "unsupported";

export const PUBLISH_PLATFORMS = Object.freeze(
  Object.keys(PUBLISH_PLATFORM_DEFINITIONS) as [PublishPlatform, ...PublishPlatform[]],
);

// 底层目录保留全部平台；设置页隐藏音频入口和当前境内 Web 不可用的平台。
export const ACCOUNT_SETTINGS_PLATFORMS = Object.freeze(
  PUBLISH_PLATFORMS.filter((platform) =>
    !["netease-music", "ximalaya", "laohu", "futu"].includes(platform)
  ),
);

export const AUTO_DRAFT_PLATFORMS = Object.freeze(
  PUBLISH_PLATFORMS.filter((platform) =>
    PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner !== null
  ) as PublishPlatform[],
);

export const ARTICLE_DRAFT_PLATFORMS = Object.freeze(
  PUBLISH_PLATFORMS.filter((platform): platform is ArticleDraftPlatform =>
    PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner === "article-ego"
  ),
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

export function isArticleDraftPlatform(
  platform: PublishPlatform,
): platform is ArticleDraftPlatform {
  return PUBLISH_PLATFORM_DEFINITIONS[platform].draftRunner === "article-ego";
}

export function draftCapability(platform: PublishPlatform): DraftCapability {
  return PUBLISH_PLATFORM_DEFINITIONS[platform].draftCapability;
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
    baijiahao: { titleMax: 30, summaryMax: 120, tagsMax: 5 },
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
