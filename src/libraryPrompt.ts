import { PUBLISH_PLATFORM_DEFINITIONS, type PublishPlatform } from "./platforms.ts";

export interface LibraryPromptSource {
  libraryRoot: string;
  dataDir: string;
  cache?: { libraryRoot: string } | undefined;
  cachedEnabledPlatforms?: readonly string[] | undefined;
}

interface PromptSectionHost {
  systemPrompt: {
    section: (section: {
      name: string;
      order: number;
      text: string | (() => string);
    }) => () => void;
  };
}

export function resolvePromptLibraryRoot(source: LibraryPromptSource): string {
  return source.cache?.libraryRoot ?? source.libraryRoot;
}

function enabledPlatformNames(platforms: readonly string[]): string {
  return platforms.map((key) => {
    if (Object.hasOwn(PUBLISH_PLATFORM_DEFINITIONS, key)) {
      return PUBLISH_PLATFORM_DEFINITIONS[key as PublishPlatform].name;
    }
    return key;
  }).join("、");
}

export function libraryConventionText(
  libraryRoot: string,
  dataDir: string,
  enabledPlatforms?: readonly string[],
): string {
  const lines = [
    `创作者内容以磁盘文件为准，目录是 ${libraryRoot}。首次使用先调用 oil_creator_setup；需要完整说明时调用 oil_creator_guide。`,
    "一条内容对应一个子文件夹；视频/字幕或文章/封面由用户在工作台明确选择，不要求人工维护 publish-package.json。",
    `插件状态只保存目录、平台账号检查和草稿任务，位置是 ${dataDir}/overlay.json；AI 平台变体冻结在内容文件夹的 .oil-distribution.json。`,
    "平台登录使用 oil_platform_accounts。先用 oil_distribution_source 读取固定素材，再用 oil_create_platform_drafts 冻结分发包并交给 Ego；自动化必须停在最终发表之前。",
  ];
  if (enabledPlatforms !== undefined) {
    lines.push(enabledPlatforms.length === 0
      ? "当前没有启用自动草稿平台。"
      : `当前启用自动草稿平台：${enabledPlatformNames(enabledPlatforms)}。`);
  }
  return lines.join("\n");
}

export function registerLibraryPrompt(ctx: PromptSectionHost, source: LibraryPromptSource): () => void {
  return ctx.systemPrompt.section({
    name: "oil:library",
    order: 120,
    text: () => libraryConventionText(
      resolvePromptLibraryRoot(source),
      source.dataDir,
      source.cachedEnabledPlatforms,
    ),
  });
}
