# 实现说明

## 目标边界

本版本只有一条黄金路径：工作台选择本地素材 → 当前 Harness 会话生成平台变体 → 冻结分发包 → Ego Browser 平台草稿。原始素材以磁盘为准，AI 产物以冻结包为准，overlay 只保存设置、账号检查结果和逐平台任务状态。

设置页环境探测仅包含：内容目录、自动发布、图文草稿、Ego Browser。

## 模块

| 模块 | 责任 |
| --- | --- |
| `src/catalog.ts` | 创建内容目录、保存内容类型元数据并扫描文件产物 |
| `src/distribution.ts` | 枚举候选素材、校验固定选择、读取 AI 输入并原子冻结平台变体 |
| `src/platforms.ts` | 定义 25 个平台账号入口和草稿适配能力 |
| `src/articlePlatformProfiles.ts` | 定义 18 个图文平台各自的受众、目标、语气、结构、标签和安全边界 |
| `src/platformAccounts.ts` | 调用 Ego Browser 打开或检查平台会话 |
| `scripts/platform-account.mjs` | 浏览器内登录交接和登录状态检查 |
| `src/coverVariants.ts` | 使用 `sharp` 跨平台读取、居中裁切并缓存 3:4/4:3 视频封面派生文件 |
| `src/draftRunner.ts` | 从冻结包派生视频运行包，串联 `video-publisher` 页面准备与远端草稿保存 |
| `scripts/video-draft-runner.mjs` | 以一个稳定父进程覆盖页面准备和远端保存两阶段，避免状态核对误判中断 |
| `scripts/video-draft.mjs` | 在 B站精确执行“存草稿”并回读 `draftId`；在抖音执行“暂存离开”并从 draft 入口回读标题与 `video_id` |
| `src/articleDraftRunner.ts` | 从统一平台定义派生可运行的图文平台，准备文章、封面和 Ego 输入 |
| `scripts/article/core.mjs` | Article Adapter 注册表、去敏、错误与远端结果门禁 |
| `scripts/article/platforms/*.mjs` | 逐平台实现 `inspect`、`saveDraft`、`verify`，平台差异不得泄漏到 Dispatcher |
| `scripts/article/dispatch.mjs` | 统一执行三阶段契约、分类阻塞状态并交接任务空间 |
| `scripts/build-article-draft.mjs` | 把 core、平台 Adapter 和 Dispatcher 生成自包含的 `article-draft.mjs` Ego bundle |
| `src/service.ts` | 提供内容、设置、账号和草稿 RPC |
| `src/client/CreatorSettingsCard.tsx` | 四项环境状态、目录和平台绑定界面 |
| `src/client/ContentInspector.tsx` | 视频/字幕、文章/封面、平台选择与一键草稿界面 |
| `src/client/distributionPrompt.ts` | 把一次点击排入当前 Harness 会话，不增加插件专属模型配置 |

视频封面属于固定素材选择，不属于 AI 文案。工作台把可选 `coverPath` 与视频、字幕一起写入 `.oil-distribution.json`；生成运行包时先用 `sharp` 读取真实尺寸，按目标平台从原图中央派生最大内接的 3:4、4:3 或两种画幅，不拉伸、不放大，也不修改原图。派生文件以原图内容哈希、目标比例和算法版本为身份，稳定保存在插件数据目录的 `derived-covers/`，Mac 和 Windows 使用同一套 Node 实现。B站有封面时仍显式设置 `bilibiliCoverStrategy=custom`，没有封面时才设置 `bilibiliCoverStrategy=platform-ai`；实际上传或调用平台 AI、结果回读和幂等恢复都由 `video-publisher` 的平台适配器负责。

## 状态模型

平台账号记录包括平台标识、是否启用、是否存在自动化运行器、证据等级、最近检查状态和时间。证据等级分为 `remote-verified`、`local-verified`、`local-tested`、`page-ready`、`manual-handoff` 和 `unsupported`；登录状态不推导草稿能力。`local-verified` 表示平台官方只提供浏览器本地草稿且已真实保存回读，`local-tested` 只代表生产脚本通过本地契约与模拟回归。

新建内容的类型元数据位于内容文件夹的 `.oil-content.json`，值为 `video`、`audio` 或 `article`。界面默认选择 `video`；元数据仅用于记录用户意图，不接管用户的素材文件。旧目录没有该文件时保持兼容。

冻结分发包位于内容文件夹的 `.oil-distribution.json`，包含素材模式、精确文件路径、创建时间和逐平台 `title`、`summary`、`body`、`tags`。写入使用同目录临时文件 + rename；重试不得重新生成。

草稿运行记录位于 overlay，主要状态为：

- `running`：外部运行器正在执行；
- `ready`：投稿页已准备并通过安全检查，但尚无远端保存证据；
- `draft`：平台草稿已保存并取得可回读凭据；`draftStorage` 进一步区分 `remote` 与 `browser-local`；
- `error`：运行失败，保存错误摘要；
- `published`：仅兼容历史手工标记，新的自动化不会写入该状态。

插件重启时会核对残留进程号，把已经不存在的 `running` 任务标记为中断，避免永久假运行。

## 草稿运行

视频 `draftRunner` 读取冻结分发包，把通用平台变体映射为 `video-publisher` 的 `bilibiliTitle`、`douyinDescription`、`xhsTopics`、`kuaishouDescription` 等兼容字段，在插件数据目录创建临时运行包，再调用稳定父运行器。用户不需要维护兼容包。

开发环境可通过 `VIDEO_PUBLISHER_SKILL_DIR` 显式选择本地 fork；运行器先检查该路径，再回退到 `~/.claude`、`~/.codex`、`~/.agents` 和 `~/.grok` 的标准 Skill 目录，避免本地改动被旧的全局安装副本遮蔽。

`video-publisher` 返回 `READY` 只证明上传和投稿页字段已经完成，不代表平台已保存远端草稿。B站继续点击精确的“存草稿”控件，进入草稿箱并核对标题与 `draftId`；抖音继续点击唯一“暂存离开”，重新打开 draft 入口并核对标题与唯一 `video_id`；快手从服务器 `snapshot/info` 精确核对文件名、组合描述、`photoStatus`、`mediaId` 与时长，并回读稳定 `fileId`。只有回读成功才写入 `draft`。稳定父进程覆盖两个阶段，避免插件在阶段切换的短暂 PID 空窗中把任务误判为中断。小红书和视频号尚未完成远端保存回归，因此当前只写入 `ready`，界面明确显示“页面已备，尚未远端保存”。

目前验证通过的映射为：

| 工作台平台 | 运行器平台 |
| --- | --- |
| 小红书 | `xiaohongshu` |
| 抖音 | `douyin` |
| B站 | `bilibili` |
| 视频号 | `wechat_channels` |
| 快手 | `kuaishou` |

一次视频草稿请求只启动一个稳定父进程和一个 `video-publisher` orchestrator，所选的 B站、抖音、小红书、视频号、快手共享同一份冻结包与作业锁。页面检查、视频上传和最终核验按配置最多五平台并发；标题、标签、原创声明、封面及远端“存草稿”继续串行操作共享 Ego 输入通道。父进程把 publisher 汇总结果拆回逐平台 overlay 状态，一个页面失败不会把其他平台已经验证成功的草稿改写为失败；任一任务空间出现 `USER_CONTROL` 时停止整批后续浏览器动作，等待用户明确继续。

## Harness AI 编排

详情页不会直接调用固定模型，也不保存 API Key。它把结构化固定输入排入当前 Harness 会话：

1. Agent 调用 `oil_distribution_source`，插件校验文件确实属于当前内容目录，并返回正文/字幕、共享事实规则，以及本次目标平台各自的长度约束和 `contentProfile`；
2. Agent 先应用共享规则，默认复用可用正文并只做平台硬限制所需的最小调整；只有用户明确要求深度适配或正文不适合目标平台时，才按 `contentProfile` 重写；
3. Agent 调用 `oil_create_platform_drafts`，插件先冻结，再启动 Ego；
4. 已冻结内容的纯重试使用 `oil_prepare_drafts`。

这样模型选择、凭据和上下文都继承当前 Harness 会话；Ego 运行器拿不到自由生成权。

## 微信公众号图文

微信公众号适配器只接受文章 + 封面冻结包。Host 把 Markdown 安全转为基础 HTML，并把所选封面编码为机械执行输入。Ego 在已登录的同源页面中上传封面、调用草稿创建接口，随后打开返回的草稿编辑 URL，核对 `appmsgid` 和标题；只有回读验证成功才写入 `draft`。返回 Host 的 URL 会移除会话 token，避免凭据进入 overlay。2026-08-23 真实回归得到 `appmsgid=503330667`，标题回读一致；脚本中不存在群发或最终发表调用。

## 百家号图文

百家号 P0 复用同一份文章 + 封面冻结输入。Ego 在百家号编辑页同源检查账号、读取页面提供的请求 token、上传所选封面并将其作为正文首图，然后只调用草稿保存接口。保存响应必须返回非空 `article_id`；运行器随后重新打开对应编辑页，精确核对 URL 中的 `article_id` 和页面标题，全部通过后才写入 `draft`。2026-08-23 真实回归得到 `article_id=1874282284679284233`，封面、ID 与标题回读一致。

多图文平台请求进入 Host 内的有界队列，全局最多同时运行两个 Ego 图文进程；其余平台先写入运行中状态但不分配 PID，前一任务完成并写回结果后才启动下一项。每个平台仍拥有独立任务空间、PID、远端 ID 和完成回调，一个平台失败不会取消、覆盖或误报其他平台。单个运行器最长执行 10 分钟，stdout/stderr 各只保留最后 512 KiB；超时会先终止子进程，再尝试回收对应 task space。远端草稿验证成功后由独立 Ego 清理进程关闭 task space；只有浏览器本地草稿或登录阻塞需要用户接管时保留页面。

## 统一 Article Publisher

Ego 图文运行器由轻量平台注册表驱动。每个平台注册一个且仅一个 Adapter，必须同时提供 `inspect`、`saveDraft` 和 `verify`；Dispatcher 不包含平台名称或平台分支。远端成功必须具备远端 ID、编辑 URL、任务空间和 `verified: true`；浏览器本地成功必须具备独立草稿凭据、`draftStorage=browser-local` 和 IndexedDB 回读，二者分别标记 `REMOTE_VERIFIED` 与 `LOCAL_VERIFIED`。

源文件在构建时拼成单个自包含 Ego bundle，避免 stdin 执行环境依赖相对模块解析。bundle 一致性、每个 Adapter 的三阶段契约、core/dispatch 不含平台分支均有自动回归。

微信公众号、百家号、企鹅号、知乎、雪球号、东方财富号、微博、顶端新闻和头条号已在 2026-08-23 用“测试文章 001”完成真实远端保存、ID 和标题回读；维科网在 2026-08-24、搜狐号在 2026-08-26 审核通过后完成同一闭环。头条号观察官方 `save=0` 自动保存回执并从草稿列表核对封面、`is_draft` 和非首发状态；搜狐号调用官方 draft v2 接口并固定 `declareOriginal=false`；维科网只调用 `/home/news/ajax_add` 的 `is_draf=1`，从 `/article/ajax_articles.html` 取草稿 ID，再打开编辑页核对标题与必填字段；小红书图文笔记使用独立平台目标，执行“上传图片 → 填写标题正文 → 暂存离开”，再从 `draft-database-v1/image-draft` 回读本地草稿。其余六个 Adapter 继续为 `local-tested` 且 `draftRunner=null`。

平台定义中的 `draftCapability` 是 UI 与账号接口共享的证据真相来源：B站、抖音、快手和十一个已验证图文平台为 `remote-verified`；小红书图文笔记为 `local-verified`；小红书视频和视频号为 `page-ready`；六个未开放 Adapter 为 `local-tested`；两个音频入口为 `unsupported`。是否可以自动勾选仍由非空 `draftRunner` 独立决定。

## Ego Browser 会话

每个平台账号使用独立任务空间。`open` 模式打开登录页并调用 `handOffTaskSpace`；`check` 模式在用户点击“检查”后恢复该空间，通过当前 URL 与页面文本判断登录态，然后关闭检查任务。实际草稿运行使用新的独立空间并继承登录状态；公众号草稿验证后把草稿页交给用户。

账号密码、二维码和验证码都由用户在浏览器中处理，插件不保存凭据。

## 打包与发布

`pnpm build` 先由 `tsdown` 生成三个 JavaScript 入口，再将账号、公众号草稿、视频远端保存和视频父运行器脚本原地写入 `lib/`。原地写入用于兼容 profile 中可能存在的硬链接，同时写入目标被限制在当前仓库 `lib/`。

插件生命周期由 npm 包中的 `dsh.bundle.patch` 管理。`pnpm check` 执行类型检查、测试和构建；`pnpm release:check` 额外检查 Git、npm tarball 和关键运行文件。

## 编辑保护、分发批次与部署一致性

所有内容选择入口通过 `setSelectedContentId` 调用当前文章的离开检查；取消后不改变选择及持久化状态。关闭面板、侧栏切换、删除当前内容和设置中更换内容目录都复用该检查。文章内部切换文件仍使用编辑器已有的丢弃确认。

每次图文分发在入队前读取一次冻结包和封面字节，批次内所有平台共享快照。排队期间替换磁盘分发包或封面，不影响已接收的批次；后续新请求读取新的冻结包。快照保留在当前 Host 内存中，进程重启不自动恢复未完成队列。

发布门禁校验当前生成器构建命令、生成器源码以及 npm 打包文件；完整检查和构建后再次确认工作树干净。本地 Web 插件继续链接本仓库，统一提交后构建并重启，使已部署内容可追溯到提交。原有公众号默认原创声明补丁保存在 `docs/deferred/wechat-originality.patch.json`，在明确授权流程和真实草稿回归完成前不参与运行。
