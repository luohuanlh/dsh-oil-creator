import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import { normalizeEnabledPlatforms } from "./overlay.ts";
import { PUBLISH_PLATFORMS, isPublishPlatform } from "./platforms.ts";
import type { OilCreatorService } from "./service.ts";
import type {
  AssetSelection,
  CreatorProfile,
  PlatformVariant,
  PublishPlatform,
} from "./types.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

function signalOf(exec: { signal: AbortSignal }): AbortSignal {
  return exec.signal;
}

function renderCanonicalJson(_args: unknown, value: unknown): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function present(title: string, rawInput: unknown) {
  return { card: "generic" as const, title, kind: "other" as const, rawInput };
}

const JSON_VALUE = { type: "json" } as const;

function selectionFromArgs(args: {
  mode?: string;
  videoPath?: string;
  subtitlePath?: string;
  articlePath?: string;
  coverPath?: string;
  articleTitle?: string;
  articleSummary?: string;
}): AssetSelection {
  if (args.mode === "video") {
    if (typeof args.videoPath !== "string" || args.videoPath.trim() === "") {
      throw new Error("videoPath is required for video mode");
    }
    return {
      mode: "video",
      videoPath: args.videoPath,
      ...(typeof args.subtitlePath === "string" && args.subtitlePath.trim() !== ""
        ? { subtitlePath: args.subtitlePath }
        : {}),
    };
  }
  if (args.mode === "article") {
    if (typeof args.articlePath !== "string" || args.articlePath.trim() === "") {
      throw new Error("articlePath is required for article mode");
    }
    if (typeof args.coverPath !== "string" || args.coverPath.trim() === "") {
      throw new Error("coverPath is required for article mode");
    }
    const articleTitle = typeof args.articleTitle === "string" ? args.articleTitle.trim() : "";
    const articleSummary = typeof args.articleSummary === "string" ? args.articleSummary.trim() : "";
    if (articleTitle.length > 120) throw new Error("articleTitle must be at most 120 characters");
    if (articleSummary.length > 120) throw new Error("articleSummary must be at most 120 characters");
    return {
      mode: "article",
      articlePath: args.articlePath,
      coverPath: args.coverPath,
      ...(articleTitle === "" ? {} : { articleTitle }),
      ...(articleSummary === "" ? {} : { articleSummary }),
    };
  }
  throw new Error("mode must be video or article");
}

const distributionParameters = {
  id: { type: "string", required: true, description: "内容文件夹 id。" },
  mode: { type: "string", required: true, enum: ["video", "article"], description: "所选素材模式。" },
  videoPath: { type: "string", description: "video 模式必填的本地视频绝对路径。" },
  subtitlePath: { type: "string", description: "video 模式可选的本地字幕绝对路径。" },
  articlePath: { type: "string", description: "article 模式必填的本地 Markdown 或 HTML 绝对路径。" },
  coverPath: { type: "string", description: "article 模式必填的本地封面绝对路径。" },
  articleTitle: { type: "string", description: "article 模式可选的标题参考，最多 120 字。" },
  articleSummary: { type: "string", description: "article 模式可选的摘要参考，最多 120 字。" },
  platforms: {
    type: "array",
    required: true,
    items: { type: "string", enum: PUBLISH_PLATFORMS },
    description: "本次目标平台，必须与素材模式匹配。",
  },
} as const;

export function registerCreatorTools(ctx: ToolsContext, service: OilCreatorService): void {
  ctx.tools.register(defineTool({
    name: "oil_creator_guide",
    description:
      "返回内容目录、Ego Browser 平台绑定、公众号图文和自动草稿的实时使用指引。",
    parameters: {},
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Creator guide", args),
    execute: (_args, exec) => service.getCreatorGuide(signalOf(exec)).then(asJson),
  }));

  ctx.tools.register(defineTool({
    name: "oil_creator_setup",
    description:
      "检查四项环境状态并预览内容目录、启用平台的配置变更。只有用户确认后才传 apply=true。",
    parameters: {
      apply: { type: "boolean", description: "False 只预览；True 保存用户已经确认的变更。" },
      libraryRoot: { type: "string", description: "已存在的绝对内容目录，或以 ~/ 开头的路径。" },
      enabledPlatforms: {
        type: "array",
        items: { type: "string", enum: PUBLISH_PLATFORMS },
        description: "完整的平台选择；空数组表示不启用自动草稿。",
      },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Creator setup", args),
    execute: async (args, exec) => asJson(await service.configureCreator({
      apply: args.apply === true,
      ...(typeof args.libraryRoot === "string" ? { libraryRoot: args.libraryRoot } : {}),
      ...(Array.isArray(args.enabledPlatforms)
        ? { enabledPlatforms: normalizeEnabledPlatforms(args.enabledPlatforms) }
        : {}),
    }, signalOf(exec))),
  }));

  ctx.tools.register(defineTool({
    name: "oil_create_content",
    description: "在内容目录新建一个 YYYY-MM-DD_标题 文件夹；素材仍由用户在文件夹中管理。",
    parameters: {
      title: { type: "string", required: true, description: "内容标题。" },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Create content", args),
    execute: (args, exec) => {
      if (args.title.trim() === "") throw new Error("title is required");
      return service.createContent({ title: args.title }, signalOf(exec)).then(asJson);
    },
  }));

  ctx.tools.register(defineTool({
    name: "oil_creator_profile",
    description: "读取或替换启用的平台列表。平台入口不等于已经支持自动草稿。",
    parameters: {
      enabledPlatforms: {
        type: "array",
        items: { type: "string", enum: PUBLISH_PLATFORMS },
        description: "完整的平台列表；省略表示只读。",
      },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Creator profile", args),
    async execute(args, exec) {
      const signal = signalOf(exec);
      const current = (await service.getSettings({}, signal)).profile;
      if (!Array.isArray(args.enabledPlatforms)) return asJson(current);
      const profile: CreatorProfile = {
        enabledPlatforms: normalizeEnabledPlatforms(args.enabledPlatforms),
      };
      return asJson((await service.setProfile({ profile }, signal)).profile);
    },
  }));

  ctx.tools.register(defineTool({
    name: "oil_platform_accounts",
    description:
      "列出 24 个平台账号状态，或让 Ego Browser 打开/检查一个平台。open 会把浏览器控制权交给用户登录；check 只检查登录态。",
    parameters: {
      action: {
        type: "string",
        enum: ["list", "open", "check"],
        description: "默认 list；open 打开登录页；check 检查登录态。",
      },
      platform: {
        type: "string",
        enum: PUBLISH_PLATFORMS,
        description: "open/check 必填的平台 id。",
      },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Platform accounts", args),
    async execute(args, exec) {
      const signal = signalOf(exec);
      const action = args.action ?? "list";
      if (action === "list") return asJson(await service.getPlatformAccounts({}, signal));
      if (!isPublishPlatform(args.platform)) throw new Error("platform is required");
      if (action === "open") {
        return asJson(await service.openPlatformAccount({ platform: args.platform }, signal));
      }
      return asJson(await service.checkPlatformAccount({ platform: args.platform }, signal));
    },
  }));

  ctx.tools.register(defineTool({
    name: "oil_distribution_source",
    description:
      "读取工作台中用户明确选择的视频/字幕或文章/封面，并返回原文与各目标平台的生成约束。只读取文件，不写入也不启动浏览器。",
    parameters: distributionParameters,
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Read selected source", args),
    async execute(args, exec) {
      const platforms = (args.platforms ?? []).filter(isPublishPlatform) as PublishPlatform[];
      if (platforms.length !== (args.platforms ?? []).length) throw new Error("invalid platform");
      return asJson(await service.getDistributionSource({
        id: args.id,
        selection: selectionFromArgs(args),
        platforms,
      }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "oil_create_platform_drafts",
    description:
      "提交 Harness AI 已按平台生成的标题、摘要、正文和标签，原子冻结后立即交给 Ego Browser 建立草稿。永远不得最终发表。",
    parameters: {
      ...distributionParameters,
      variants: {
        type: "array",
        required: true,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            platform: { type: "string", required: true, enum: PUBLISH_PLATFORMS },
            title: { type: "string", required: true },
            summary: { type: "string", required: true },
            body: { type: "string", required: true },
            tags: { type: "array", required: true, items: { type: "string" } },
          },
        },
        description: "每个目标平台恰好一个变体，字段必须符合 oil_distribution_source 返回的约束。",
      },
      confirmOriginalRights: {
        type: "boolean",
        description: "仅当用户明确确认本条内容拥有原创/自制发布权时传 true。",
      },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Create platform drafts", args),
    async execute(args, exec) {
      const signal = signalOf(exec);
      const platforms = (args.platforms ?? []).filter(isPublishPlatform) as PublishPlatform[];
      if (platforms.length !== (args.platforms ?? []).length) throw new Error("invalid platform");
      const variants = (args.variants ?? []).map((variant) => {
        if (!isPublishPlatform(variant.platform)) throw new Error("invalid variant platform");
        return {
          platform: variant.platform,
          title: variant.title,
          summary: variant.summary,
          body: variant.body,
          tags: variant.tags,
        } satisfies PlatformVariant;
      });
      const expected = new Set(platforms);
      if (variants.length !== expected.size
        || variants.some((variant) => !expected.has(variant.platform))) {
        throw new Error("variants 必须与目标平台一一对应");
      }
      const frozen = await service.commitDistribution({
        id: args.id,
        selection: selectionFromArgs(args),
        variants,
      }, signal);
      const drafts = await service.startDrafts({
        id: args.id,
        platforms,
        ...(args.confirmOriginalRights === true ? { confirmOriginalRights: true } : {}),
      }, signal);
      return asJson({ frozen, drafts });
    },
  }));

  ctx.tools.register(defineTool({
    name: "oil_prepare_drafts",
    description:
      "重试已经存在的 Harness 冻结分发包，把同一份内容再次交给 Ego Browser 建草稿。不会重新生成文案，也永远不点击最终发表。",
    parameters: {
      id: { type: "string", required: true, description: "内容文件夹 id。" },
      platforms: {
        type: "array",
        required: true,
        items: { type: "string", enum: PUBLISH_PLATFORMS },
        description: "目标平台；必须已经在设置中启用。",
      },
      confirmOriginalRights: {
        type: "boolean",
        description: "仅当用户明确确认本条内容拥有原创/自制发布权时传 true。",
      },
    },
    output: {
      schema: JSON_VALUE,
      render: renderCanonicalJson,
    },
    presentCall: (args) => present("Prepare drafts", args),
    async execute(args, exec) {
      if (args.id.trim() === "") throw new Error("id is required");
      const platforms = (args.platforms ?? []).filter(isPublishPlatform) as PublishPlatform[];
      return asJson(await service.startDrafts({
        id: args.id,
        platforms,
        ...(args.confirmOriginalRights === true ? { confirmOriginalRights: true } : {}),
      }, signalOf(exec)));
    },
  }));
}
