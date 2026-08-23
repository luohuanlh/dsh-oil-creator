async function dispatchArticleDraft() {
  if (!input || typeof input.platform !== "string") {
    throw new Error("article draft input is missing or unsupported");
  }
  const adapter = articleAdapters.get(input.platform);
  if (!adapter) throw new Error(`Article Adapter 未注册：${input.platform}`);
  const task = await useOrCreateTaskSpace(input.taskName);

  try {
    const inspection = await adapter.inspect({ input, task });
    const saved = await adapter.saveDraft({ input, task, inspection });
    const verification = await adapter.verify({ input, task, inspection, saved });
    if (verification?.verified !== true) {
      throw articleFailure("平台未返回远端草稿验证证据", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
      });
    }
    const handoff = await handOffTaskSpace(task.id);
    const browserLocal = saved.draftStorage === "browser-local";
    output({
      ok: true,
      status: browserLocal ? "LOCAL_VERIFIED" : "REMOTE_VERIFIED",
      verified: true,
      ...(browserLocal ? {
        draftReceipt: saved.draftReceipt,
        draftStorage: "browser-local",
      } : {
        remoteId: saved.remoteId,
        draftStorage: "remote",
      }),
      draftUrl: publicDraftUrl(saved.draftUrl),
      taskSpace: String(task.id),
      handedOff: handoff?.done === true,
      evidence: saved.evidence,
    });
  } catch (cause) {
    const status = typeof cause?.status === "string" ? cause.status : "BLOCKED_PLATFORM";
    const exitCode = typeof cause?.exitCode === "number" ? cause.exitCode : 5;
    let handedOff = false;
    if (status === "BLOCKED_AUTH") {
      const handoff = await handOffTaskSpace(task.id);
      handedOff = handoff?.done === true;
    }
    output({
      ok: false,
      status,
      errorCode: status,
      error: redactSensitiveText(cause instanceof Error ? cause.message : String(cause)),
      evidence: cause?.evidence,
      taskSpace: String(task.id),
      handedOff,
    });
    process.exit(exitCode);
  }
}

await dispatchArticleDraft();
