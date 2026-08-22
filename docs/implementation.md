# 实现说明

## 目标边界

本版本只有一条黄金路径：工作台选择本地素材 → 当前 Harness 会话生成平台变体 → 冻结分发包 → Ego Browser 平台草稿。原始素材以磁盘为准，AI 产物以冻结包为准，overlay 只保存设置、账号检查结果和逐平台任务状态。

设置页环境探测仅包含：内容目录、自动发布、公众号图文、Ego Browser。

## 模块

| 模块 | 责任 |
| --- | --- |
| `src/catalog.ts` | 创建内容目录、保存内容类型元数据并扫描文件产物 |
| `src/distribution.ts` | 枚举候选素材、校验固定选择、读取 AI 输入并原子冻结平台变体 |
| `src/platforms.ts` | 定义 24 个平台账号入口和草稿适配能力 |
| `src/platformAccounts.ts` | 调用 Ego Browser 打开或检查平台会话 |
| `scripts/platform-account.mjs` | 浏览器内登录交接和登录状态检查 |
| `src/draftRunner.ts` | 从冻结包派生视频运行包，串联 `video-publisher` 页面准备与远端草稿保存 |
| `scripts/video-draft-runner.mjs` | 以一个稳定父进程覆盖页面准备和远端保存两阶段，避免状态核对误判中断 |
| `scripts/video-draft.mjs` | 在 B站精确执行“存草稿”并回读 `draftId`；在抖音执行“暂存离开”并从 draft 入口回读标题与 `video_id` |
| `src/articleDraftRunner.ts` | 准备微信公众号文章、封面和 Ego 运行输入 |
| `scripts/article-draft.mjs` | 上传公众号封面、保存草稿、回读验证并交接页面 |
| `src/service.ts` | 提供内容、设置、账号和草稿 RPC |
| `src/client/CreatorSettingsCard.tsx` | 四项环境状态、目录和平台绑定界面 |
| `src/client/ContentInspector.tsx` | 视频/字幕、文章/封面、平台选择与一键草稿界面 |
| `src/client/distributionPrompt.ts` | 把一次点击排入当前 Harness 会话，不增加插件专属模型配置 |

视频封面属于固定素材选择，不属于 AI 文案。工作台把可选 `coverPath` 与视频、字幕一起写入 `.oil-distribution.json`；为 B站派生运行包时，有封面就显式设置 `bilibiliCoverStrategy=custom` 和 4:3 路径，没有封面就设置 `bilibiliCoverStrategy=platform-ai`。实际上传或调用平台 AI、结果回读和幂等恢复都由 `video-publisher` 的 B站适配器负责，Harness 提示词不包含页面点击策略。

## 状态模型

平台账号记录包括平台标识、是否启用、是否存在自动化运行器、证据等级、最近检查状态和时间。证据等级分为 `remote-verified`、`implemented-simulated`、`page-ready` 和 `unsupported`；登录状态不推导草稿能力。

新建内容的类型元数据位于内容文件夹的 `.oil-content.json`，值为 `video`、`audio` 或 `article`。界面默认选择 `video`；元数据仅用于记录用户意图，不接管用户的素材文件。旧目录没有该文件时保持兼容。

冻结分发包位于内容文件夹的 `.oil-distribution.json`，包含素材模式、精确文件路径、创建时间和逐平台 `title`、`summary`、`body`、`tags`。写入使用同目录临时文件 + rename；重试不得重新生成。

草稿运行记录位于 overlay，主要状态为：

- `running`：外部运行器正在执行；
- `ready`：投稿页已准备并通过安全检查，但尚无远端保存证据；
- `draft`：平台草稿已远端保存，并取得标题与远端 id 回读证据；
- `error`：运行失败，保存错误摘要；
- `published`：仅兼容历史手工标记，新的自动化不会写入该状态。

插件重启时会核对残留进程号，把已经不存在的 `running` 任务标记为中断，避免永久假运行。

## 草稿运行

视频 `draftRunner` 读取冻结分发包，把通用平台变体映射为 `video-publisher` 的 `bilibiliTitle`、`douyinDescription`、`xhsTopics` 等兼容字段，在插件数据目录创建临时运行包，再调用稳定父运行器。用户不需要维护兼容包。

`video-publisher` 返回 `READY` 只证明上传和投稿页字段已经完成，不代表平台已保存远端草稿。B站继续点击精确的“存草稿”控件，进入草稿箱并核对标题与 `draftId`；抖音继续点击唯一“暂存离开”，重新打开 draft 入口并核对标题与唯一 `video_id`。只有回读成功才写入 `draft`。稳定父进程覆盖两个阶段，避免插件在阶段切换的短暂 PID 空窗中把任务误判为中断。小红书和视频号尚未完成远端保存回归，因此当前只写入 `ready`，界面明确显示“页面已备，尚未远端保存”。

目前验证通过的映射为：

| 工作台平台 | 运行器平台 |
| --- | --- |
| 小红书 | `xiaohongshu` |
| 抖音 | `douyin` |
| B站 | `bilibili` |
| 视频号 | `wechat_channels` |

每个平台单独启动一个运行句柄并单独更新状态；一个页面失败不会把其他平台已经验证成功的草稿改写为失败。

## Harness AI 编排

详情页不会直接调用固定模型，也不保存 API Key。它把结构化固定输入排入当前 Harness 会话：

1. Agent 调用 `oil_distribution_source`，插件校验文件确实属于当前内容目录并返回正文/字幕与平台长度约束；
2. Agent 生成逐平台变体；
3. Agent 调用 `oil_create_platform_drafts`，插件先冻结，再启动 Ego；
4. 已冻结内容的纯重试使用 `oil_prepare_drafts`。

这样模型选择、凭据和上下文都继承当前 Harness 会话；Ego 运行器拿不到自由生成权。

## 微信公众号图文

微信公众号适配器只接受文章 + 封面冻结包。Host 把 Markdown 安全转为基础 HTML，并把所选封面编码为机械执行输入。Ego 在已登录的同源页面中上传封面、调用草稿创建接口，随后打开返回的草稿编辑 URL，核对 `appmsgid` 和标题；只有回读验证成功才写入 `draft`。返回 Host 的 URL 会移除会话 token，避免凭据进入 overlay。该实现已通过模拟生产脚本回归，尚待真实账号验证；脚本中不存在群发或最终发表调用。

## Ego Browser 会话

每个平台账号使用独立任务空间。`open` 模式打开登录页并调用 `handOffTaskSpace`；`check` 模式在用户点击“检查”后恢复该空间，通过当前 URL 与页面文本判断登录态，然后关闭检查任务。实际草稿运行使用新的独立空间并继承登录状态；公众号草稿验证后把草稿页交给用户。

账号密码、二维码和验证码都由用户在浏览器中处理，插件不保存凭据。

## 打包与发布

`pnpm build` 先由 `tsdown` 生成三个 JavaScript 入口，再将账号、公众号草稿、视频远端保存和视频父运行器脚本原地写入 `lib/`。原地写入用于兼容 profile 中可能存在的硬链接，同时写入目标被限制在当前仓库 `lib/`。

插件生命周期由 npm 包中的 `dsh.bundle.patch` 管理。`pnpm check` 执行类型检查、测试和构建；`pnpm release:check` 额外检查 Git、npm tarball 和关键运行文件。
