import type { ISessions } from "@deepseek-ai/dsh-client-runtime/client";

import type { AssetSelection, PublishPlatform } from "../types.ts";

export interface DistributionPromptRequest {
  id: string;
  selection: AssetSelection;
  platforms: readonly PublishPlatform[];
  confirmOriginalRights?: boolean;
}

export function buildDistributionPrompt(request: DistributionPromptRequest): string {
  const toolInput = {
    id: request.id,
    ...request.selection,
    platforms: [...request.platforms],
    ...(request.confirmOriginalRights === true ? { confirmOriginalRights: true } : {}),
  };
  return [
    "请执行内容工作台的一键平台草稿流程。用户已经在界面中明确选择素材和目标平台，不要重新选择文件。",
    "",
    `固定输入：${JSON.stringify(toolInput, null, 2)}`,
    "",
    "1. 先使用 oil_distribution_source 读取固定输入中的本地素材和平台约束。",
    "2. 只基于返回的 sourceText（所选文章/字幕，或视频同目录脚本与选题）生成每个平台恰好一个 variant：title、summary、body、tags。先应用 sharedRules，默认复用可用的正文，只做满足平台长度、字段和格式要求所需的最小调整；只有用户明确要求深度适配或正文确实不适合目标平台时，才按 contentProfile 重写。",
    "   如固定输入包含 articleTitle 或 articleSummary，将它们作为用户提供的标题/摘要参考；可按平台限制适配，但不得改变原意。",
    "3. 使用 oil_create_platform_drafts 提交同一组固定输入和全部 variants。该工具会先冻结内容，再交给 Ego Browser 建草稿。",
    "4. 任一平台不受支持、账号失效或页面失败时如实报告，不得伪造成功，也不得点击最终发表。",
    "",
    "除非工具返回必须由用户处理的登录/风控问题，否则直接完成以上流程。",
  ].join("\n");
}

export async function queueDistributionPrompt(
  sessions: Pick<ISessions, "list" | "binding">,
  request: DistributionPromptRequest,
): Promise<void> {
  const sessionId = sessions.list.getSnapshot().current;
  if (sessionId === undefined) throw new Error("请先打开一个 Harness 会话，再启动一键草稿");
  const binding = sessions.binding(sessionId);
  if (binding === undefined) throw new Error("当前 Harness 会话尚未就绪，请稍后重试");
  const result = await binding.session.prompt([
    { type: "text", text: buildDistributionPrompt(request) },
  ], "queue");
  if (!result.ok) throw new Error(result.error.message);
}
