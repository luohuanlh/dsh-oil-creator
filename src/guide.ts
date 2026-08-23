import { PUBLISH_PLATFORM_DEFINITIONS } from "./platforms.ts";
import type { CreatorCapability, CreatorSetupStatus } from "./types.ts";

function stateMark(capability: CreatorCapability): string {
  if (capability.state === "ready") return "可用";
  if (capability.state === "unsupported") return "当前系统不支持";
  return "缺失";
}

function capabilityLine(label: string, capability: CreatorCapability): string {
  return `- ${label}：${stateMark(capability)}。${capability.detail}`;
}

export function creatorGuideText(status: CreatorSetupStatus): string {
  const { capabilities, settings } = status;
  const enabled = settings.profile.enabledPlatforms;
  const names = enabled.map((platform) =>
    `${PUBLISH_PLATFORM_DEFINITIONS[platform].name}（${platform}）`
  ).join("、");
  return [
    "# 内容工作台指引",
    "",
    "概览只展示预览信息；视频和图文页各自使用两步流程：选择内容文件 → 选择平台并创建草稿。Harness AI 与 Ego Browser 的内部协作被收进第二步。",
    "",
    "## 当前四项环境状态",
    capabilityLine("内容目录", capabilities.library),
    capabilityLine("自动发布", capabilities.autoPublish),
    capabilityLine("图文草稿", capabilities.article),
    capabilityLine("Ego Browser", capabilities.egoBrowser),
    "",
    "## 1. 选择内容文件",
    `- 当前目录：${settings.libraryRoot}` ,
    "- 概览只显示封面、状态和时间，不包含选择或执行控件。",
    "- 在视频页选择视频和可选字幕；在图文页选择 Markdown 和封面。两页都就地提供预览。",
    "- 不需要手写 publish-package.json。Harness AI 生成平台标题、摘要、正文和标签后，工作台把它们冻结为 .oil-distribution.json。",
    "",
    "## 2. 选择平台并创建草稿",
    "- 平台选择、Ego 登录状态、草稿状态和启动按钮位于同一个步骤。设置页提供 20 个可见账号入口；老虎财经、富途牛牛及两个音频平台暂时隐藏。",
    "- “已绑定”只来自一次真实 Ego Browser 检查；仅有平台入口不等于已经实现自动草稿适配器。",
    enabled.length === 0
      ? "- 当前没有启用自动草稿平台。先在设置中选择平台。"
      : `- 当前启用：${names}。`,
    "- B站、抖音和快手视频，以及微信公众号、百家号、企鹅号、知乎、雪球号、东方财富号、微博和顶端新闻文章已通过真实远端保存与 id 回读；各平台使用独立任务空间并分别记录结果。小红书和视频号当前只准备投稿页，并显示“页面已备”。所有任务都停在最终发表前。",
    "- Harness AI 先遵守共享事实规则，默认复用可用的正文并只做平台要求的最小调整；用户要求深度适配时才应用各平台的受众、语气和结构 profile。Ego Browser 只消费冻结字段、上传素材、保存并回读验证。每个平台独立记录成功或失败。",
    "",
    "## 安全边界",
    "- 自动草稿不等于最终发布。任何最终发表必须由用户在平台页面另行确认。",
    "- 原创/自制声明必须来自用户本次确认或 video-publisher 已配置的长期真实策略，不能从素材内容推断。",
    ...(status.recommendations.length === 0
      ? []
      : ["", "## 环境建议", ...status.recommendations.map((item) => `- ${item}`)]),
  ].join("\n");
}
