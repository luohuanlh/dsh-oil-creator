interface SkillsContext {
  skills: {
    register: (skill: {
      name: string;
      description: string;
      source: "runtime";
      content: string;
      invocation: { modelInvocable: boolean; userInvocable: boolean };
    }) => () => void;
  };
}

export const CREATOR_WORKBENCH_SKILL = {
  name: "creator-workbench",
  description:
    "配置和使用 AI 内容分发工作台：选择本地素材、生成平台变体，并由 Ego Browser 只保存草稿。",
  source: "runtime" as const,
  invocation: { modelInvocable: true, userInvocable: true },
  content: `# 内容工作台

## 唯一流程

1. **内容管理与固定输入**：磁盘文件夹是原始素材的唯一真相来源。工作台会给出用户已经选择的视频 + 可选字幕，或 Markdown 文章 + 封面，以及目标平台。不得擅自替换文件。
2. **平台绑定**：使用 oil_platform_accounts 列出 24 个平台并打开或检查 Ego Browser 账号；能登录不代表平台已经有草稿适配器。
3. **Harness AI 适配**：先用 oil_distribution_source 读取固定输入。sourceText 来自所选文章/字幕；视频未选字幕时回退到同目录的 script.md 与 topic.md。根据 sourceText 和每个平台约束，生成每个平台恰好一个 title、summary、body、tags；保留原文事实，不虚构数据、功能或引语。
4. **冻结并建草稿**：用 oil_create_platform_drafts 提交同一组固定输入和全部 variants。工具先原子冻结内容，再交给 Ego Browser 上传、填表、保存和验证草稿。
5. **重试**：只有在用户要求重试已经冻结的内容时才用 oil_prepare_drafts；它复用同一份文案，不重新生成。

## Harness / Ego 边界

- Harness AI 负责理解字幕或文章、按平台适配字段并提交冻结分发包。
- Ego Browser 只负责登录会话、文件上传、页面/API 填写、保存草稿和回读验证；不得调用模型或自行改写文案。
- B站和抖音视频已通过真实远端保存与 id 回读。微信公众号和百家号图文已实现并通过模拟回归，可在同一次请求中使用独立任务空间并发运行、逐平台记录结果，但完成各自真实账号回归前不得称为远端已验证。小红书和视频号当前只准备已验证的投稿页，并明确返回“页面已备”；通过各自的远端保存回归前，不得报告草稿成功。其他平台只有真实适配器通过回归后才能使用。

## 工作台页面

- 概览只显示封面、状态和时间等预览信息，不承载选择或执行操作。
- 视频和图文页各自只有两步：先选择该类型的内容文件并预览，再选择平台并创建草稿。平台账号状态、平台选择、草稿状态和启动动作统一在第二步。

## 配置

- 首次使用或环境不明时调用 oil_creator_setup。第一次传配置字段保持 apply=false，展示精确变更；只有用户确认后才用同一组字段和 apply=true。
- 内容目录不存在时先展示准备创建的绝对路径，确认后再用文件工具创建。
- 设置页环境状态只包含内容目录、自动发布、图文草稿和 Ego Browser。

## 文件约定

- 一条内容对应一个子文件夹，推荐命名 YYYY-MM-DD_可读标题。
- 视频使用 MP4/MOV，字幕使用 SRT/ASS/VTT/TXT；文章使用 Markdown，封面使用 PNG/JPEG/WebP。
- 用户不需要手写发布包。oil_create_platform_drafts 会生成 .oil-distribution.json 作为可审计、可重试的冻结分发包。
- 不得移动、删除或改写用户选择的原始素材。

## 草稿安全

- 自动草稿不是最终发布。不得点击最终“发布 / 发表 / 立即投稿”控件。
- 只有用户本次明确确认，才能给 oil_create_platform_drafts 或 oil_prepare_drafts 传 confirmOriginalRights=true；不能从内容本身推断原创权。
- 如果平台没有真实适配器，明确返回“尚未接入”，不要手写草稿成功状态。
- 某个平台失败时如实报告该平台错误；不要覆盖其他平台已经验证成功的草稿。`,
};

export function registerCreatorWorkbenchSkill(ctx: SkillsContext): () => void {
  return ctx.skills.register(CREATOR_WORKBENCH_SKILL);
}
