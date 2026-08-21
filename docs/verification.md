# 验证记录

本文区分“本地可重复验证”与“需要真实账号写入授权”的证据，避免把模拟测试误写成平台实测。

## 需求与证据

| 项目简报要求 | 当前证据 | 状态 |
|---|---|---|
| 工作台列出并固定选择视频/字幕或文章/封面 | `distribution.test.ts`、`contentInspector.test.ts` | 已证明 |
| 复用当前 Harness 会话生成平台变体 | `distributionPrompt.test.ts` 验证当前 session 的 queued prompt | 已证明 |
| 选择与平台字段原子冻结、重试不改写 | `distribution.test.ts`、`.oil-distribution.json` 契约 | 已证明 |
| Ego 只消费已验证的本地冻结包 | 消费端重新校验 schema、realpath、目录边界和扩展名 | 已证明 |
| 无远端证据不得标记草稿 | `service.test.ts`、旧 `READY` sidecar 降级回归 | 已证明 |
| 不包含最终发表动作 | Ego 可执行契约断言没有发送/群发接口；视频继续使用 safe runner | 已证明 |
| 单个平台失败不污染其他平台 | `service.test.ts`、按平台隔离的临时包测试 | 已证明 |
| 至少一个真实平台创建草稿 | B站草稿 `draftId=3779145`，标题与冻结包一致 | 已证明 |
| Harness 主按钮到 UI 回显的完整黄金路径 | 主按钮、AI、冻结、Ego READY、远端保存、overlay 与 UI 回显全链路 | 已证明 |
| 微信公众号远端草稿与 id 回读 | 生产脚本模拟回归；真实账号尚未登录验证 | 已实现，待真实验证 |
| 第二个视频平台远端草稿闭环 | 抖音 `READY` → “暂存离开” → draft 标题与 `video_id` 回读 | 已证明 |

## 平台证据等级

| 平台 | 当前等级 | 证据 |
|---|---|---|
| B站 | `REMOTE_VERIFIED` | 真实草稿 `draftId=3779145`，标题与冻结包一致 |
| 微信公众号 | `IMPLEMENTED + SIMULATED` | 生产脚本模拟上传、保存、`appmsgid` 与标题回读；无真实账号写入证据 |
| 抖音 | `REMOTE_VERIFIED` | 真实草稿标题一致，远端 `video_id=v0200fg10000da438evog65gkcsbelp0`，draft 入口回读通过 |
| 小红书 | `IMPLEMENTED + SIMULATED` | 已接入 `video-publisher`，本仓库没有逐平台真实 `READY` 日志，也没有远端保存或 id 回读 |
| 视频号 | `IMPLEMENTED + SIMULATED` | 已接入 `video-publisher`，本仓库没有逐平台真实 `READY` 日志，也没有远端保存或 id 回读 |
| 其他平台 | `UNSUPPORTED` | 只有账号入口，没有草稿运行器 |

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
