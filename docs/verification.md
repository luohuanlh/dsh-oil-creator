# 验证记录

本文区分“本地可重复验证”与“需要真实账号写入授权”的证据，避免把模拟测试误写成平台实测。

## 需求与证据

| 项目简报要求 | 当前证据 | 状态 |
|---|---|---|
| 工作台列出并固定选择视频/字幕或文章/封面 | `distribution.test.ts`、`contentInspector.test.ts` | 已证明 |
| 工作台可导入本地素材且不覆盖同名文件 | `assetImport.test.ts`、`assetUpload.test.ts`、2026-08-22 真实 DSH Web 导入回归 | 已证明 |
| 复用当前 Harness 会话生成平台变体 | `distributionPrompt.test.ts` 验证当前 session 的 queued prompt | 已证明 |
| 选择与平台字段原子冻结、重试不改写 | `distribution.test.ts`、`.oil-distribution.json` 契约 | 已证明 |
| Ego 只消费已验证的本地冻结包 | 消费端重新校验 schema、realpath、目录边界和扩展名 | 已证明 |
| 无远端证据不得标记草稿 | `service.test.ts`、旧 `READY` sidecar 降级回归 | 已证明 |
| 不包含最终发表动作 | Ego 可执行契约断言没有发送/群发接口；视频继续使用 safe runner | 已证明 |
| 单个平台失败不污染其他平台 | `service.test.ts`、按平台隔离的临时包测试 | 已证明 |
| 视频封面比例不符时跨平台派生正确画幅 | `coverVariants.test.ts`、`draftRunner.test.ts`、真实 1024×1024 B站封面预检 | 已证明 |
| 至少一个真实平台创建草稿 | B站草稿 `draftId=3779145`、本地导入回归草稿 `draftId=3782858`，标题均与冻结包一致 | 已证明 |
| Harness 主按钮到 UI 回显的完整黄金路径 | 主按钮、AI、冻结、Ego READY、远端保存、overlay 与 UI 回显全链路 | 已证明 |
| 多图文平台资源边界 | 服务级并发固定为 2；三平台契约测试证明第三项等待前项完成；运行器测试覆盖 512 KiB 输出尾部、10 分钟超时终止、远端 task space 独立关闭及本地/登录页面保留 | 已证明 |
| 微信公众号远端草稿与 id 回读 | 真实 `appmsgid=503330667`，重新打开草稿后标题“测试文章 001”一致 | 已证明 |
| 百家号远端草稿与 id 回读 | 真实 `article_id=1874282284679284233`，封面上传、编辑 URL 与标题回读一致 | 已证明 |
| 维科网远端草稿与 id 回读 | 真实 `id=2186865`，必填关键字/行业、草稿列表与编辑页标题回读一致 | 已证明 |
| 第二个视频平台远端草稿闭环 | 抖音 `READY` → “暂存离开” → draft 标题与 `video_id` 回读 | 已证明 |

## 2026-08-23 五平台单作业并发调度

- 真实失败记录中，视频号与快手在同一次点击后相隔 3 毫秒返回 `JobBusyError`；错误发生在 publisher 全局锁入口，尚未进入任何平台适配器。根因是 Host 把一个五平台请求拆成多个独立 orchestrator。
- `OilCreatorService.startDrafts` 现在把 B站、抖音、小红书、视频号、快手合并为一份冻结运行包和一个父进程；服务层回归明确要求五个平台只调用一次 `prepareDraftRun` 和一次 `startVideoDraftRun`。
- 父进程回归证明同一个 publisher 汇总结果能分别写回远端草稿与页面 `READY`；若任一平台返回 `USER_CONTROL`，即使其他平台已 READY，也不会调用任何远端保存器。
- Video Publisher 账号配置已确认五个平台均为 available，检查和上传并发显式设置为 `5/5`；共享 Ego 输入上的元数据、封面和远端保存仍保持串行。

## 平台证据等级

| 平台 | 当前等级 | 证据 |
|---|---|---|
| B站 | `REMOTE_VERIFIED` | 真实草稿 `draftId=3779145`；本地导入黄金路径再次回归 `draftId=3782858`，标题与冻结包一致 |
| 微信公众号 | `REMOTE_VERIFIED` | 真实草稿 `appmsgid=503330667`；封面上传、草稿创建、编辑页 ID 与标题回读一致 |
| 百家号 | `REMOTE_VERIFIED` | 真实草稿 `article_id=1874282284679284233`；封面作为正文首图，编辑页 ID 与标题回读一致 |
| 企鹅号 | `REMOTE_VERIFIED` | 补选自主声明并上传封面后，正式 `/marticlepublish/omSave` 返回 `articleId=20260823A09F1Z`；草稿库、编辑 URL、标题、封面和“作者声明：无需标注”回读一致 |
| 网易号 | `LOCAL_TESTED + BLOCKED_ONBOARDING` | 已登录但页面明确提示未完成实名认证；未调用草稿保存，认证后复测 `operation=saveDraft` |
| 一点号 | `LOCAL_TESTED + BLOCKED_ONBOARDING` | 新注册账号审核中；Adapter 使用 `POST /model/Article`、`status=0` 和 `#/Writing/{id}`，审核通过后复测 |
| 大鱼号 | `LOCAL_TESTED + BLOCKED_ONBOARDING` | 新注册账号审核中；Adapter 使用 `globalConfig.utoken`、`/dashboard/save-draft` 和 `draft_id`，审核通过后复测 |
| 顶端新闻 | `REMOTE_VERIFIED` | 真实 `save_type=1` 草稿 `nd_id=3204434`；`/api/draft/show`、编辑 URL 与标题回读一致 |
| 同顺号 | `REMOTE_VERIFIED` | 审核通过后新站点正式草稿 `131fa72e1b9b48f2a3b94597a14964f3`；封面、标题、正文、摘要、`draft_status=0` 和 `is_original=0` 从详情与编辑页回读一致 |
| 维科网 | `REMOTE_VERIFIED` | 审核通过后专用 Adapter 调用页面官方 `/home/news/ajax_add` 且固定 `is_draf=1`；草稿列表返回 `id=2186865`，编辑页标题、ID、关键字、行业和正文回读一致 |
| 老虎财经 | `LOCAL_TESTED + WEB_LIMITED` | 境内 Web 端只展示服务调整页，没有登录、创作或草稿入口；不绕过地区限制 |
| 富途牛牛 | `LOCAL_TESTED + WEB_LIMITED` | 境内 Web 页面明确暂停服务，仅提供存量客户 App 通道；没有 Web 创作或草稿入口 |
| 知乎 | `REMOTE_VERIFIED` | 真实草稿 `2074817313006793960`；draft create/PATCH 与 `/p/{id}/edit` 标题回读一致 |
| 搜狐号 | `REMOTE_VERIFIED` | 审核通过后真实 draft v2 草稿 `1068016625`；子账号、`sp-cm`、编辑 URL、标题与 ID 回读一致，且 `declareOriginal=false` |
| 雪球号 | `REMOTE_VERIFIED` | 真实草稿 `29832025`；标题和新版 `/writeV2/draft/{id}` 回读一致 |
| 东方财富号 | `REMOTE_VERIFIED` | 真实草稿 `6a8a6b95f679cbf2d23b9079`；两阶段 SaveDraft、hash ID 与标题回读一致，跨域请求不携带 Cookie |
| 微博 | `REMOTE_VERIFIED` | 真实草稿 `3984870`；draft create/save、`#/draft/{id}` 与标题回读一致 |
| 抖音 | `REMOTE_VERIFIED` | 真实草稿标题一致，远端 `video_id=v0200fg10000da438evog65gkcsbelp0`，draft 入口回读通过 |
| 快手 | `REMOTE_VERIFIED` | 真实 3 秒 MP4 冷启动首轮 `READY`，服务器快照回读稳定 `fileId=3931762113`、文件名、精确描述、`mediaId` 与时长 |
| 小红书 | `PAGE_READY` | 已接入 `video-publisher`，本仓库没有逐平台远端保存或 id 回读证据 |
| 小红书图文笔记 | `LOCAL_VERIFIED` | 独立 `xiaohongshu-note` Adapter 上传图片、填写标题正文并点击“暂存离开”；IndexedDB 草稿 `372ceedf-6807-43e2-9ecb-8fc7de785774` 的图片、标题和正文回读一致，官网明确提示草稿只存当前浏览器本地 |
| 视频号 | `PAGE_READY` | 已接入 `video-publisher`，本仓库没有逐平台远端保存或 id 回读证据 |
| 头条号 | `REMOTE_VERIFIED` | 官方 `save=0` 自动保存得到 `pgc_id=7677183504072901174`；编辑页和草稿列表回读标题、封面、`is_draft=true`、`status_desc=草稿` 与 `claim_exclusive=0` |
| 网易云音乐、喜马拉雅听 | `UNSUPPORTED` | 音频入口，不在 Article Publisher 范围 |

## 2026-08-23 八个图文平台真实草稿回归

- 使用 Harness 内容目录中的“测试文章 001”和 1024×1024 PNG 封面，逐平台只执行草稿动作。微信公众号 `503330667`、百家号 `1874282284679284233`、企鹅号 `20260823A09F1Z`、知乎 `2074817313006793960`、雪球号 `29832025`、东方财富号 `6a8a6b95f679cbf2d23b9079`、微博 `3984870`、顶端新闻 `3204434` 均取得远端 ID 并完成标题回读。
- 雪球线上编辑 URL 已迁移为 `/writeV2/draft/{id}`；东方财富官方跨域客户端用请求体 `ct/ut` 鉴权且不携带 Cookie；顶端 Vue 实例实际挂在 `.memberContainer`，草稿搜索不接受 `title` 参数。这些线上差异均已修正并补回归。
- Ego 当前 runtime 会把“以块注释开头的 IIFE”求值为 `null`；Article 表单及网易、一点、大鱼、顶端表达式将审计标记移入函数体，保持 fixture 可识别同时恢复真实求值。
- 企鹅号此前只调用 `/editorCache/update`，原因是自主声明未完成；选择“无需标注”并确认后，正式草稿接口返回 `articleId`。编辑页回读 ID/标题，内容管理列表回读封面、`self_declare` 和 `status=0`，共同完成闭环。
- 八个图文平台的 `draftCapability` 已升级为 `remote-verified`，`draftRunner` 配置为 `article-ego`，可在工作台勾选；其余八个未开放 Adapter 继续保持禁用。
- `pnpm check` 通过：51 个测试文件、337 项测试，TypeScript 与 Host/Client/Typert 构建全部成功；bundle 同步、`git diff --check`、Node 语法和 npm package dry-run 均通过。

## 2026-08-24 维科网真实草稿回归

- 账号审核通过后进入正式 `article/publish.html` 编辑器，确认“发布”和“存草稿”是两个独立控件；本次只操作 `#draf`，没有点击“发布”。
- 维科网草稿必须同时填写原标题、关键字、发布行业和 TinyMCE 正文。专用 Adapter 从平台 tags 生成不超过 20 字的关键字，并根据标题、摘要、tags 与正文选择最匹配的官方行业分类。
- 页面官方保存协议为 `POST /home/news/ajax_add` 并追加 `is_draf=1`；随后调用 `/article/ajax_articles.html` 的草稿筛选回读最新记录，再打开 `/article/edit/id/{id}.html` 核对标题、隐藏 ID、关键字、行业与正文。
- 手工安全探针草稿 `2186848` 证明官方草稿控件和编辑页回读；生产 Adapter 首次实跑在 ID 解析不足时准确返回 `REMOTE_UNVERIFIED`，改用官方草稿列表接口后再次实跑得到 `id=2186865` 并完成全字段回读。
- 维科网升级为 `remote-verified`、配置 `article-ego` 并开放工作台 checkbox；契约回归继续覆盖登录失效、保存失败和回读失败，且不包含最终发布动作。

## 2026-08-23 统一 Article Publisher 与五平台本地适配

- 微信公众号与百家号的生产逻辑已迁移为统一 `inspect → saveDraft → verify` 契约；Dispatcher 通过注册表选平台，不再包含 `if wechat / else baijiahao`。
- 源码拆分为 `scripts/article/core.mjs`、`platforms/*.mjs` 和 `dispatch.mjs`，构建生成单文件 `article-draft.mjs`。`articleDraftBundle.test.ts` 保证 bundle 同步、每个 Adapter 只注册一次完整三阶段契约、core/dispatch 不含平台名或平台分支。
- 知乎 fixture 验证创建空草稿、PATCH 标题/正文、重新打开 `/p/{id}/edit` 并精确匹配标题和 ID；登录、保存拒绝、回读不一致分别得到 `BLOCKED_AUTH`、`BLOCKED_PLATFORM`、`REMOTE_UNVERIFIED`。
- 搜狐号 fixture 验证子账号解析、`dv-id`/`sp-cm`、`draft/v2`、`declareOriginal=false` 和编辑页回读；雪球验证唯一草稿保存端点与 `/writeV2/draft/{id}`；东方财富验证两次 `SaveDraft` 嵌套响应；微博验证 `draft/create → draft/save → #/draft/{id}`。
- 五个平台的本地实现阶段只保存草稿，fixture 请求跟踪不含最终发布端点；当时均保持 `supportsAutoDraft=false`。随后知乎、雪球、东方财富和微博完成真实回归并开放，搜狐号于 2026-08-26 审核通过后也完成真实回归。
- 初始 Chrome 只读探针确认五个平台当时均未登录；后续真实回归使用用户明确授权的“测试文章 001”，仍未执行任何最终发表。
- `pnpm check` 通过：51 个测试文件、307 项测试，TypeScript 与 Host/Client/Typert 构建成功；`git diff --check` 和 npm package dry-run 通过，发布包继续包含生成后的自包含 `article-draft.mjs`。

## 2026-08-23 九个平台批量编码

- 新增企鹅号、网易号、一点号、大鱼号、顶端新闻、同顺号、维科网、老虎财经、富途牛牛九个三阶段 Adapter；manifest 和生成后的自包含 bundle 统一注册，不向 Dispatcher 增加平台分支。
- 网易号协议来自当前官方 `index.html` bundle/source map：草稿使用 `/wemedia/article/status/api/publish.do` 且固定 `operation=saveDraft`，随后从 `/wemedia/content/manage/list.do` 取 `articleId`，再用 `/wemedia/article/editpage.do` 回读标题。
- 顶端新闻协议来自当前官方动态 chunk：`save_type=1` 调用 `https://resource.topnews.cn/api/article/add`，草稿库返回 `nd_id`，`/api/draft/show?id=` 回读标题；请求复用页面自己的 Axios 签名拦截器，不复制或绕过登录安全逻辑。
- 一点号和大鱼号分别基于可审计的 Wechatsync 草稿协议实现；批量编码时同顺号、维科、老虎和富途使用共同的浏览器表单安全门禁，只匹配“保存草稿”“存草稿”“保存”，显式排除“发布”“发表”“提交审核”“上线”“群发”。企鹅号、维科网和同顺号在后续真实回归中改为专用 Adapter。
- 九个平台均完成成功、登录失效、保存失败和回读失败的 fixture 回归；批量编码阶段全部保持 `draftRunner=null`。后续顶端新闻和企鹅号分别取得真实草稿 ID 与标题证据并开放，其余七个平台继续保持禁用。
- 只读浏览器探针没有保存或发布内容：企鹅、网易、一点、大鱼、顶端、维科均确认未登录；同顺号确认独立创作平台但未登录；老虎和富途确认境内 Web 服务限制。
- `pnpm check` 通过：51 个测试文件、334 项测试，TypeScript 与 Host/Client/Typert 构建全部成功。

## 2026-08-23 头条号与小红书图文笔记闭环

- 头条号正式编辑器没有独立“存草稿”按钮，而是通过 `/mp/agw/article/publish` 的 `save=0` 请求自动保存。生产 Adapter 只观察页面自己发出的自动保存回执，不点击“预览并发布”或“定时发布”；随后从 `creator_center/draft_list` 回读 `pgc_id`、标题、封面和草稿状态。
- 头条页面默认勾选“头条首发”。Adapter 在填写前显式关闭该声明，真实草稿 `7677183504072901174` 的列表记录确认 `is_exclusive=false`、`claim_exclusive=0`。自动化没有声明原创或首发。
- 小红书视频与图文笔记继续使用不同平台目标。`xiaohongshu-note` 上传所选封面、填写二十字以内标题和千字以内正文，通过 CDP 精确点击关闭 Shadow DOM 中的“暂存离开”，从 `draft-database-v1/image-draft` 回读本地草稿 ID、图片 `fileId`、标题和正文。
- 小红书官网明确提示“草稿存储于当前使用的浏览器本地”；因此结果使用 `LOCAL_VERIFIED`、`draftStorage=browser-local` 和 `draftReceipt`，不生成或伪造远端 ID。真实回归草稿为 `372ceedf-6807-43e2-9ecb-8fc7de785774`。
- 两个 Adapter 都具备成功、登录失效、保存失败和回读失败 fixture；头条号升级为 `remote-verified`，小红书图文笔记升级为 `local-verified`，均配置 `article-ego` 并可在图文工作台勾选。
- 本功能提交覆盖 51 个测试文件、346 项测试；当前工作区连同并行兼容性回归共通过 52 个文件、347 项测试。TypeScript 与 Host/Client/Typert 构建、bundle 同步、`git diff --check`、Node 语法和 npm package dry-run 均通过。

## 2026-08-26 搜狐号真实草稿回归

- 审核通过后，官方 `account/list` 返回有效子账号，页面 Cookie 中的 `mp-cv` 可作为 `sp-cm`，草稿请求携带独立 `dv-id`。
- 使用“测试文章 001”只调用 `POST /mpbp/bp/news/v4/news/draft/v2` 保存草稿，固定 `declareOriginal=false`，返回远端 ID `1068016625`；未调用发布、发表或原创声明接口。
- 重新打开 `contentStatus=2&id=1068016625` 的编辑页后，URL ID 与标题“测试文章 001”同时回读一致；搜狐号升级为 `remote-verified`、配置 `article-ego` 并开放工作台 checkbox。
- `pnpm check` 通过：55 个测试文件、373 项测试，TypeScript 与 Host/Client/Typert 构建全部成功；浏览器重载后工作台显示 12 个可勾选图文 Adapter，并确认搜狐号账号为“已绑定”。

## 2026-09-16 同顺号真实草稿回归

- 审核通过并由用户登录后，正式编辑器位于 `mp.10jqka.com.cn/creation-editor/editor/`，与旧的 `t.10jqka.com.cn` 注册入口不同。页面只有“草稿将自动保存”和单独“发布”按钮；自动保存请求为 `POST /lgt/article_publish/auth/api/draft/v1/save`，发布使用另一端点，自动化从未调用。
- 原“测试文章 001”文件夹已从当前内容目录移除，因此本次使用明确标注的短文和应用自带 PNG 图标作诊断输入，不把其他文章冒充原文件。先以页面自动保存得到草稿 `4e95c5b27fb443e0bcbcb54ce2b29c87`，草稿箱和详情接口回读标题、正文、摘要及 `draft_status=0`。
- 官方新草稿默认 `is_original=1`；诊断更新显式传 `is_original=0` 后，详情回读为 `0`。专用 Adapter 固定该安全值，同时使用官方图片上传接口 `/newupload/base64upload/` 与草稿保存接口，重新打开详情和编辑页核对封面、标题、正文、摘要、草稿状态及 `info_source={"none":{}}`。
- 生产脚本在同一 Ego 任务空间得到第二份未发布草稿 `131fa72e1b9b48f2a3b94597a14964f3`，全部回读通过；这证明平台草稿链路，不代表已用原文章全文复测。两个诊断草稿均未发布，供用户后续人工复核或清理。
- 同顺号升级为 `remote-verified`、配置 `article-ego` 并开放工作台 checkbox；本地 fixture 覆盖登录、封面或保存拒绝、详情回读不一致，且没有发布调用。
- `pnpm typecheck` 与 `pnpm build` 通过；全量测试复跑通过 60 个文件、410 项测试。浏览器重载后，同顺号工作台卡片显示“已绑定 / 自动草稿”，checkbox 可勾选。

## Remaining Verification Queue

1. **网易号**：完成实名认证后执行一次 `operation=saveDraft`，从内容管理列表回读 `articleId`，再打开编辑页核对标题。
2. **一点号、大鱼号**：账号审核通过后分别验证 `/model/Article` 的 `status=0` 与 `/dashboard/save-draft` 的 `_id`，再核对编辑页标题。
3. **老虎财经、富途牛牛**：只有平台在允许的账号/地域环境提供 Web 草稿能力时才复测；不绕过境内服务限制。

## Remaining Platform Audit

| 平台 | 状态 | 阻塞证据与下一步 |
|---|---|---|
| 网易号、一点号、大鱼号 | `LOCAL_TESTED / BLOCKED_ONBOARDING` | Adapter 与 fixture 已完成；等待实名认证或账号审核通过后继续真实回归。 |
| 老虎财经、富途牛牛 | `LOCAL_TESTED / WEB_LIMITED` | 安全表单 Adapter 已编码，但境内 Web 环境受限；不绕过地域、登录、风控或 App 限制。 |
| 网易云音乐、喜马拉雅听 | `UNSUPPORTED` | 属于音频平台，不在 Article Publisher 范围。 |

## 2026-08-23 百家号图文草稿 P0

- Host 从现有 `.oil-distribution.json` 读取百家号平台变体与所选封面，拒绝缺少文章模式、平台变体或空封面的输入；任务空间名称绑定 `baijiahao`。
- Ego 生产脚本在百家号同源页面检查账号，读取页面请求 token，上传所选封面并将平台图片 URL 作为正文首图，然后只调用草稿保存接口；不声明原创，也不存在最终发表动作。
- 保存响应必须返回非空 `article_id`。运行器重新打开对应编辑页，精确核对 URL 中的 `article_id` 与标题输入值；标题、ID 或登录态任一不符均拒绝报告成功。
- 可执行模拟回归覆盖成功、登录失效、保存拒绝和回读不一致；登录失效时把任务空间交给用户且不继续上传或保存。
- 微信公众号与百家号现使用独立 Ego 任务空间，可在同一次图文请求中并发运行并逐平台写回结果，不共享可变页面输入。真实账号回归完成前，百家号保持 `IMPLEMENTED + SIMULATED`。
- `service.test.ts` 证明两个图文运行器会在任一完成前都进入运行态，并覆盖“公众号成功、百家号失败”时结果互不污染的边界。
- `pnpm typecheck`、全量 50 个测试文件/286 项测试和三端构建均通过；npm tarball 契约仍包含更新后的图文运行脚本。

## 2026-08-23 跨平台封面比例派生

- 新增基于 `sharp` 的单一 Mac/Windows 图片处理路径；锁文件包含 macOS Intel/Apple Silicon 与 Windows x64/ARM64 预编译依赖，不再调用 `sips`、PowerShell 或外部 ImageMagick。
- 单元回归使用真实 PNG/WebP，证明方形图分别派生 `1024×768` 的 4:3 和 `768×1024` 的 3:4 文件；原图尺寸保持 `1024×1024`，合规 PNG 直接复用，WebP 转为预检可识别的 PNG。
- 派生文件身份绑定原图内容哈希、目标比例和算法版本；重复调用保持路径与修改时间不变，损坏缓存会重新生成。Windows 同名文件不能直接覆盖的 `EEXIST`/`EPERM` 分支也有显式恢复逻辑。
- 使用用户当前 `aur-er-002-ss.png` 真实复现：输入 `1024×1024`，输出 `/Users/luohuan/.dsh-oil-creator/derived-covers/a49a427cc3c205d454193de3-4x3.png` 为 `1024×768`；`video-publisher scripts/check-package.mjs bilibili` 返回 `ok: true`、`errors: []`。

## 2026-08-22 快手真实草稿回归

- 本地 fork 的 `video-publisher` 在 `dev` 分支新增 `kuaishou` 配置、包校验、媒体预检、中央 gates、Ego 安全守卫和专用适配器。
- 使用 1.22MB、3 秒 H.264 MP4、两项话题和临时 1200×900 测试封面完成两次冷启动；第二次作业 `kuaishou-live-regression-v2` 在 task space `18` 首轮到达 `READY`。
- 快手未发布草稿由 `snapshot/info` 提供服务器真相：`fileId`、原始文件名、HTML 描述、`mediaId`、封面状态和视频时长均可独立回读；“取消 → 继续编辑”恢复同一份草稿。
- 封面回归证明 `coverMediaId` 可保持不变而 `coverKey` 会延迟换代；适配器改为等待三个稳定 key，并只在素材、比例和 supporting media id 匹配时修复延迟回执。
- 修复后连续三次完整复跑均只有 `inspect → verify`，日志为 `upload none`、`UI serial: none`、`missing=[]`；未重复上传视频、描述或封面。
- 当前项目保存器回读远端 `fileId=3931762113`，同时核对页面最终按钮与安全守卫、服务器文件名、精确组合描述、`photoStatus=1`、非空 `mediaId` 和 3000ms 时长，然后把草稿页交给用户。
- 全程 `guardArmed=true`、`blockedAttempts=0`、`finalPublishClicked=false`，没有点击快手“发布”。
- `pnpm check`：通过；49 个测试文件、261 项测试全部通过，类型检查与 Host、Client、Typert 构建成功。

## 2026-08-22 本地素材导入与 B站真实草稿回归

- 以 `HEAD=9db8f65` 重启真实 DSH Web Host，运行新建内容 → 本地文件导入 → 当前 Harness 会话 → Ego Browser → B站远端草稿的完整链路。
- 新建隔离测试内容 `2026-08-22_本地素材导入回归`，从已有 3 秒 H.264 测试图样导入视频，并导入一份 SRT 字幕和 PNG 封面；工作台均自动回显并选中新素材。
- 同一个 `rc-draft-verification.mp4` 连续导入两次后，目标目录同时保留原名与 `rc-draft-verification-2.mp4`；两份目标文件和源文件的 SHA-256 均为 `dc588d1d349089b7e5a44a203aefe196051cc2f671ac2d6e3af6439d557233bf`，证明没有覆盖或改写源文件。
- 流式导入完成后没有残留 `.oil-upload-*.part`；工作台精确选择 `rc-draft-verification-2.mp4`、导入的 SRT 和仅 B站平台。
- 当前 Harness 会话读取固定输入；用户对本条测试内容明确确认原创/自制后，以 `confirmOriginalRights=true` 冻结 B站字段并启动安全运行器。
- `video-publisher` 作业 `98a3ebde5edb6d8e`、Ego task space `7` 完成 `inspect → upload → mutate → verify`；最终 `status=ready`、`missing=[]`，标题、简介、5 个标签、自制声明、上传完成状态和最终按钮保护均由页面重新验证。
- B站保存器只执行“存草稿”，回读标题“本地素材导入回归测试”和远端 `draftId=3782858`；编辑 URL 为 `https://member.bilibili.com/platform/upload/video/frame?type=draft&draftId=3782858`。
- `overlay.json` 最终只把该内容的 B站写为 `status=draft`、`remoteId=3782858`，工作台平台卡片回显“远端草稿已保存”；抖音、小红书和视频号保持“未生成”。最终“立即投稿”未点击。
- `pnpm check`：通过；46 个测试文件、243 项测试全部通过，类型检查和 Host、Client、Typert 构建均成功。

## 2026-08-22 B站封面策略修复与真实回归

- 复现证明视频封面虽然能在工作台选择，但旧 `AssetSelection`、`.oil-distribution.json` 和 `video-publisher` 临时包均未携带 `coverPath`；真实作业因此写出 `custom=false`、`receipt=null`，却把页面存在“封面”字样误判为 cover gate 通过。
- 视频固定选择现在支持可选 `coverPath`，并在读取、realpath 校验、冻结、重试身份比较、历史包解码、Harness 工具参数和提示固定输入中完整保留。
- B站独立草稿包在有封面时写入 `bilibiliCoverStrategy=custom`、`cover.uploadCustomCover=true` 和 4:3 路径；没有封面时写入 `bilibiliCoverStrategy=platform-ai`，由平台适配器处理，不把页面动作交给 Harness 提示词。
- `video-publisher` 的原生 AI 封面回归使用 3 秒 H.264 测试视频，作业 `5fa65598a6ceb901`、Ego task space `8`；B站智能封面任务 `taskId=25582733` 返回 8 个 `itemState=2` 候选。
- 适配器通过 B站 `.cover` 组件的 `handleGenerateAiCover` 启动任务，并通过 `handleSelectAiCover` 应用第一组完整 `pic43` + `pic` 结果；4:3 URL 为 `https://i0.hdslb.com/bfs/archive/53f73dd6070f3dfa4bd540e2b358f4e08471f85c.jpg`。
- 封面凭证同时绑定 native task id、候选索引、4:3/16:9 生成 URL 和 live Vue cover store；三次完整同作业重跑均为 `inspect/verify` 只读，`UI serial: none`、`missing=[]`。
- B站保存器只点击“存草稿”，回读远端 `draftId=3782964`。重新打开编辑 URL 后，独立 `verify` 再次得到标题一致、`savedDraftEdit=true`、封面 URL 与 receipt 精确一致、`missing=[]`。
- 全程 `guardArmed=true`、`blockedAttempts=0`、`finalPublishClicked=false`，没有点击“立即投稿”。

## 2026-08-21 本地验证

- `pnpm check`：通过；45 个测试文件、230 项测试全部通过，类型检查和三个构建入口均成功。
- TypeScript 类型检查和 Host、Client、Typert 构建：通过。
- `git diff --check`：通过。
- npm dry-run：通过；包含账号、公众号、B站/抖音远端保存和稳定父运行器脚本，共 21 个打包条目。
- `pnpm release:check`：抖音保存器提交后的干净工作区通过；内部重新执行 45 个测试文件、230 项测试、类型检查、三端构建和 npm tarball 校验。
- 真实 DSH Web Host：插件直接注册 8 个 oil tools；工具输出向当前 Harness 会话返回完整 canonical JSON；Host 内仅保留一份 `@deepseek-ai/dsh-tools` 运行时，真实工具调用可正常执行。
- Ego Lite：`0.4.7.1`；本机已发现 `video-publisher`。
- 微信公众号只读登录检查：登录失效；没有创建草稿，临时检查任务空间已删除。
- B站创作中心只读登录检查：已登录；没有上传文件，临时任务空间已删除。
- 隔离 Harness 实例真实 DOM：内容列表和工作台正常渲染；只默认选择已登录的 B站，未检查平台不自动勾选；主按钮可用但未点击。隔离实例、任务空间和临时补丁均已删除。

## 2026-08-21 Release Candidate 审查与修复

- 以 `HEAD=5e9b61f` 为固定点，对全部 tracked 与 untracked 改动完成 Standards / Spec 双轴审查。
- 修复公众号编辑 URL 携带 `token` 并进入 Host/overlay 的风险；成功与失败输出现在都移除 token。
- 历史 overlay 解码同样移除 `token`、`ticket` 等敏感查询参数；异常消息含编辑 URL 的路径已有回归测试。
- 冻结包读取从“只检查版本/id”升级为完整结构、平台类型、字段限制、realpath、目录边界和扩展名复验；被篡改为目录外路径的 sidecar 会被拒绝。
- 同一素材选择和平台集合再次冻结时复用最初文案与时间戳，不再由重复 AI 请求覆盖；并发启动由 Host 内启动锁去重。
- 运行器只有同时返回非空远端 id 和回读 URL 才能写入 `status=draft`；旧 `auto-publish.json` 的 `READY/PREPARED` 只映射为 `draftState=ready`。
- 移除可无证据手写 `draft` 的公开 `setPublish` RPC；旧 sidecar/overlay 只有同时带远端 id 和回读 URL 才保留草稿状态。
- 视频和文章预览现在使用工作台当前选择的精确路径，避免“预览 A、提交 B”。
- 平台设置页直接展示 `REMOTE_VERIFIED / IMPLEMENTED+SIMULATED / PAGE_READY / UNSUPPORTED` 对应的人类可读等级。
- 修复账号检查引用已删除 Ego task space 时无法自愈的问题；真实抖音检查从旧空间 `4` 自动切换到新检查空间并得到“已绑定”。
- 移除错误的 120 秒 Harness 队列超时。真实会话已开始调用工具但因深度推理超过两分钟，旧 UI 会误报并允许重复排队；现在只在选择变化或运行器状态出现时解除 queued 门禁。

## 2026-08-21 Harness 与抖音真实推进

- Chrome 远程调试授权完成，真实 DSH Web 由链接到本仓库的 `dsh-oil-creator` 重启加载。
- 新建本地测试内容 `2026-08-21_RC 草稿验收`：3 秒 H.264 测试图样和静音音轨，无第三方素材；工作台视频预览与所选文件一致。
- 工作台只选择抖音并真实点击“一键生成并保存草稿”；当前 Harness 会话收到固定输入，调用 `oil_creator_guide` 与 `oil_distribution_source`，并在用户确认原创后调用冻结/启动工具，证明 UI → 当前会话 → oil tools → Ego 作业链路成立。
- 内容目录生成 `.oil-distribution.json`，只包含当前视频和 `douyin` variant；真实作业 id 为 `123461d780c92595`，task space id 为 `5`。
- 抖音账号从真实设置页检查为“已绑定”。`video-publisher --inspect-only` 使用隔离配置读取真实空投稿页：认证通过，任务空间 id `3`，缺少项为 video/title/description/tags/settings/cover/finalButton。
- 前置独立诊断 task space `3` 的 upload 阶段返回 typed blocker `USER_CONTROL`；所有 gate 失败关闭，`finalPublishClicked=false`。该诊断没有上传视频或点击最终发布。
- 用户首次回复“继续”后，同一 task space 被精确接管；恢复检查证明视频已在投稿页内，运行器没有重复上传，只剩 title/description/tags。串行元数据修复在添加话题时再次遇到新的 `USER_CONTROL` 并安全停止；第二次明确“继续”后，同一作业从只缺 tags 的页面恢复，最终 `mutate` 与独立 `verify` 都返回 `READY`，`missing=[]`、`finalPublishClicked=false`。
- 抖音 READY 页只有一个可见、启用的“暂存离开”和一个“发布”。真实保存只点击“暂存离开”，页面返回上传入口并显示“你还有上次未发布的视频，是否继续编辑？”。
- 重新打开后 URL 为 `/content/post/video?enter_from=draft`，标题与冻结包一致；平台自身 `/web/api/media/video/transend/` 请求回读唯一 `video_id=v0200fg10000da438evog65gkcsbelp0`。生产保存器随后在同一页完成一次幂等回读，没有再次暂存，并把 task space `5` 交给用户。
- 插件加载新保存器后，从真实工作台再次点击主操作；同一冻结包和原创确认被复用，video-publisher 没有重复上传，保存器幂等回读同一 `video_id`。
- overlay 最终写入 `status=draft`、`url=https://creator.douyin.com/creator-micro/content/post/video?enter_from=draft`、`remoteId=v0200fg10000da438evog65gkcsbelp0`，且没有残留 `draftState`。
- DSH 重启后，内容列表与抖音平台卡片都显示“远端草稿已保存”，证明刷新/重新进入后的状态与 overlay 一致。
- 整个抖音回归没有点击“发布”，也没有正式发表。

## 2026-08-21 B站真实草稿回归

- 用户指定内容：`2026-08-20_DeepSeek Harness 安装上手`；模式为视频，选择了一条本地 MP4，未选择字幕；目标平台只有 B站。
- 当前 Harness 会话已生成 `.oil-distribution.json`：固定选择仍是上述视频，`variants` 仅包含 `bilibili`，没有改写或追加其他平台。
- `video-publisher` 首次在任何浏览器写入前执行原创权利门禁并拒绝继续；随后 DSH 会话通过 `ask_user_question` 收到明确选项“确认，我拥有原创/自制发布权”，再用同一冻结包重试，没有重新生成文案。
- Ego task space `12` 完成视频上传，并回读标题、简介、8 个标签、人工智能分区和自制声明；页面的 `立即投稿` 保持未点击。
- 独立 B站保存阶段只点击精确的 `span.submit-draft`，页面跳转至 `内容管理 → 草稿`。草稿箱显示 1 条，标题为“DeepSeek Harness 安装上手：三步从零装好，跟 AI 对话”，保存时间为 `2026-08-21 07:49:27`。
- 草稿卡片回读得到远端 `draftId=3779145`，编辑 URL 为 `https://member.bilibili.com/platform/upload/video/frame?type=draft&draftId=3779145`；`overlay.json` 同步为 `status=draft`、`remoteId=3779145`。
- 生产 `video-draft.mjs` 随后在真实草稿列表上完成一次幂等回读，没有再次保存，并把 task space `12` 交给用户。最终发表仍未执行。

## 页面 READY 与远端草稿

真实回归同时证明 `video-publisher` 的 `READY` 只表示平台投稿页已填好并通过最终按钮前的安全验证，不等于远端草稿已保存。B站继续执行“存草稿 → 草稿箱标题 + draftId 回读”；抖音继续执行“暂存离开 → draft 入口标题 + video_id 回读”。只有取得远端 id 才写入 `status=draft`。小红书和视频号仍只记录 `draftState=ready`（页面已备），不会伪装成远端草稿。

## 真实草稿回归门槛

执行真实回归前，用户必须明确指定内容与平台。完成后需要同时取得以下证据：

1. 内容目录生成的 `.oil-distribution.json` 与用户选择一致；
2. 平台草稿页回读的标题和远端草稿 id 一致；
3. `overlay.json` 只把该平台标记为 `draft`，其他平台状态不被覆盖；
4. 页面停留在草稿或编辑页，未执行最终发表。
