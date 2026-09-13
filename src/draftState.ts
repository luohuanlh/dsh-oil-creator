import type { VideoDraftOutcome } from "./draftRunner.ts";
import type { OverlayPublish, OverlayStore } from "./types.ts";

export function draftOutcomeRow(current: OverlayPublish, result: VideoDraftOutcome): OverlayPublish {
  if (result.ok) {
    if ("staged" in result && result.staged === true) {
      const next: OverlayPublish = {
        ...current,
        draftState: "ready",
      };
      delete next.draftError;
      delete next.draftPid;
      return next;
    }
    const url = "url" in result ? result.url.trim() : "";
    const remoteId = "remoteId" in result && typeof result.remoteId === "string"
      ? result.remoteId.trim()
      : "";
    const draftReceipt = "draftReceipt" in result && typeof result.draftReceipt === "string"
      ? result.draftReceipt.trim()
      : "";
    const draftStorage = "draftStorage" in result
      && (result.draftStorage === "remote" || result.draftStorage === "browser-local")
      ? result.draftStorage
      : undefined;
    if (url === "" || (remoteId === "" && draftReceipt === "")) {
      const next: OverlayPublish = {
        ...current,
        draftState: "error",
        draftError: "草稿运行器未返回远端 ID/动作回执与回读 URL，拒绝标记为草稿",
      };
      delete next.draftPid;
      return next;
    }
    const next: OverlayPublish = {
      ...current,
      status: "draft",
      url,
      ...(remoteId === "" ? {} : { remoteId }),
      ...(draftReceipt === "" ? {} : { draftReceipt }),
      ...(draftStorage === undefined ? {} : { draftStorage }),
    };
    if (remoteId === "") delete next.remoteId;
    if (draftReceipt === "") delete next.draftReceipt;
    if (draftStorage === undefined) delete next.draftStorage;
    delete next.draftState;
    delete next.draftError;
    delete next.draftPid;
    return next;
  }
  const next: OverlayPublish = {
    ...current,
    draftState: "error",
    draftError: result.error,
  };
  delete next.draftPid;
  return next;
}

export function draftPendingRow(current: OverlayPublish, pid?: number): OverlayPublish {
  const next: OverlayPublish = {
    ...current,
    draftState: pid === undefined ? "queued" : "running",
    draftStartedAt: Date.now(),
  };
  delete next.draftError;
  if (pid === undefined) delete next.draftPid;
  else next.draftPid = pid;
  return next;
}

// 当前服务持有的任务包含排队、启动和结果写回阶段，不能仅靠 PID 判定中断。
export function reconcileInterruptedDrafts(
  overlay: OverlayStore,
  ownedTasks: ReadonlySet<string>,
  isAlive: (pid: number) => boolean,
): boolean {
  let changed = false;
  for (const [id, item] of Object.entries(overlay.items)) {
    for (const [platform, row] of Object.entries(item.publish ?? {})) {
      if (row?.draftState !== "running" && row?.draftState !== "queued") continue;
      if (ownedTasks.has(`${id}:${platform}`)) continue;
      if (row.draftState === "running" && row.draftPid !== undefined && isAlive(row.draftPid)) continue;
      row.draftState = "error";
      row.draftError = "上次草稿任务已中断，请重新启动";
      delete row.draftPid;
      changed = true;
    }
  }
  return changed;
}
