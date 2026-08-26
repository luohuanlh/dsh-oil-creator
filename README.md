# dsh-oil-creator

![内容工作台](assets/readme/hero.svg)

一个面向本地创作者的 AI 分发工作台：在 Harness 中选择本地素材和平台，由当前会话的 AI 生成平台变体，再让 Ego Browser 只保存草稿。工作台不会替你点击最终发布。

## 工作流

概览只显示封面、状态和时间等预览信息。实际操作分别放在“视频”和“图文”页，每页只有两步：

1. **选择内容文件**：视频页选择本地视频和可选字幕；图文页选择 Markdown 和封面，并在当前页预览。
2. **选择平台并创建草稿**：同一区域显示 Ego 登录状态和草稿状态；点击一次后，Harness AI 生成并冻结平台字段，Ego Browser 上传、填表和保存。远端草稿与浏览器本地草稿分别显示证据范围；只达到投稿页 `READY` 的平台会显示“页面已备，尚未远端保存”。

设置页只显示四项环境状态：

- 内容目录
- 自动发布
- 图文草稿
- Ego Browser

## 平台边界

账号目录参考 `dsh-context-flow` 并补充独立的小红书图文笔记目标和音频平台，包含 B站、抖音、小红书视频、小红书图文笔记、视频号、快手、头条号、百家号、企鹅号、网易号、一点号、大鱼号、顶端新闻、雪球号、东方财富号、同顺号、搜狐号、微博、知乎、维科网、老虎财经、富途牛牛、微信公众号、网易云音乐、喜马拉雅听，共 25 个入口。

当前可选择的页面适配器为：B站、抖音、小红书、视频号、快手（视频），以及微信公众号、百家号、企鹅号、知乎、搜狐号、雪球号、东方财富号、微博、顶端新闻、头条号、维科网和小红书图文笔记（文章 + 封面）。十一个图文平台已完成真实远端保存与 ID/标题回读；小红书图文笔记按官网真实边界保存到 Ego 当前浏览器的 IndexedDB，并标记为 `local-verified`，不会伪装成远端 ID。小红书视频和视频号仍只写入 `READY`。其余六个图文平台保留 `local-tested` Adapter。

## 内容目录约定

推荐结构：

```text
内容目录/
└── 2026-08-21_示例标题/
    ├── .oil-content.json
    ├── take-a.mp4
    ├── take-b.mov
    ├── subtitle.srt
    ├── cover.png
    └── 公众号文章/
        └── 示例标题.md
```

从侧边栏新建内容时，先单选视频、音频或图文；默认选择视频。工作台只在新目录写入 `.oil-content.json` 保存这个类型，不会生成或移动素材。原始素材仍以磁盘文件夹为准，用户不需要手写 `publish-package.json`；AI 平台变体与本次素材选择会原子冻结到 `.oil-distribution.json`，重试复用同一份内容。

## 安装

```bash
dsh plugin --profile web add dsh-oil-creator
```

卸载：

```bash
dsh plugin --profile web remove dsh-oil-creator
```

安装后在 Harness 设置页选择内容目录，并确认 `ego-browser` 可用。B站、抖音、小红书、视频号和快手的视频草稿还需要 `video-publisher` Skill；十一个远端验证与一个浏览器本地验证的图文适配器均已内置。

开发本地 fork 时，可用 `VIDEO_PUBLISHER_SKILL_DIR=/absolute/path/to/video-publisher` 明确覆盖全局安装副本；路径既可指向 Skill 目录，也可指向外层仓库目录。

## 对话工具

- `oil_creator_guide`：查看当前两步流程和安全边界。
- `oil_creator_setup`：预览或应用内容目录、创作者档案和启用平台配置。
- `oil_create_content`：创建一个新的内容子文件夹。
- `oil_creator_profile`：读取或更新创作者档案。
- `oil_platform_accounts`：列出、打开或检查 25 个平台账号。
- `oil_distribution_source`：读取工作台固定的素材选择、共享事实规则，以及本次目标平台各自的内容 profile 和生成约束。
- `oil_create_platform_drafts`：冻结 AI 平台变体并启动 Ego 草稿流程。
- `oil_prepare_drafts`：只重试已经冻结的分发包，不重新生成文案。

## 开发

```bash
pnpm install
pnpm check
```

`pnpm check` 会依次执行类型检查、测试和构建。插件通过随 npm 包发布的 `dsh.bundle.patch` 接管侧栏入口，不修改用户 profile 文件。

完整的需求—证据对应关系和真实平台回归门槛见 [验证记录](docs/verification.md)。

## 安全约束

- Ego Browser 登录步骤始终把页面交还用户操作，工作台不读取密码或验证码。
- Harness AI 只读取用户明确选择的文件；Ego 不调用模型、不决定文案。
- 自动化只到草稿；不点击“发布”“发表”“立即投稿”等最终动作。
- 原创权益确认必须来自用户本次明确确认，不能从素材内容推断。
- 平台登录可用与草稿适配可用是两项独立状态。

## License

[MIT](LICENSE)
