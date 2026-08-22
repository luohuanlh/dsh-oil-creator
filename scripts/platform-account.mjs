// Ego Browser 平台账号脚本。Host 会注入 OIL_ACCOUNT_* 变量。
const platform = String(
  typeof OIL_ACCOUNT_PLATFORM === "string"
    ? OIL_ACCOUNT_PLATFORM
    : (process.env.OIL_ACCOUNT_PLATFORM ?? ""),
);
const mode = String(
  typeof OIL_ACCOUNT_MODE === "string"
    ? OIL_ACCOUNT_MODE
    : (process.env.OIL_ACCOUNT_MODE ?? "check"),
);
const loginUrl = String(
  typeof OIL_ACCOUNT_LOGIN_URL === "string"
    ? OIL_ACCOUNT_LOGIN_URL
    : (process.env.OIL_ACCOUNT_LOGIN_URL ?? ""),
);
const workspaceUrl = String(
  typeof OIL_ACCOUNT_WORKSPACE_URL === "string"
    ? OIL_ACCOUNT_WORKSPACE_URL
    : (process.env.OIL_ACCOUNT_WORKSPACE_URL ?? loginUrl),
);
const requestedSpace = String(
  typeof OIL_ACCOUNT_SPACE === "string"
    ? OIL_ACCOUNT_SPACE
    : (process.env.OIL_ACCOUNT_SPACE ?? `oil-account-${platform}-${Date.now()}`),
);
const resumeSpace = typeof OIL_ACCOUNT_RESUME === "boolean"
  ? OIL_ACCOUNT_RESUME
  : process.env.OIL_ACCOUNT_RESUME === "true";

function accountResult(value) {
  cliLog(JSON.stringify({ platform, ...value }));
}

function looksLoggedOut(url, text) {
  const href = String(url || "").toLowerCase();
  if (/\/login|signin|passport|userauth/.test(href)) return true;
  const body = String(text || "").slice(0, 12000);
  return /扫码登录|扫描二维码登录|手机号登录|密码登录|请先登录|登录后继续/.test(body);
}

if (!platform || !loginUrl) {
  throw new Error("platform account arguments are missing");
}

// “检查”按钮本身就是用户允许工作台恢复控制的明确动作。
const task = mode === "check" && resumeSpace
  ? await takeOverTaskSpace(requestedSpace)
  : await useOrCreateTaskSpace(requestedSpace);
// takeOverTaskSpace 只负责恢复控制，当前版本成功时不返回任务空间对象。
// 优先保留 useOrCreateTaskSpace 返回的数值 ID；恢复路径则沿用已保存的名称或 ID。
const taskSpace = task?.id === undefined ? requestedSpace : String(task.id);
if (mode === "open") {
  await openOrReuseTab(loginUrl, { wait: true, timeout: 30 });
  const handoff = await handOffTaskSpace(taskSpace);
  accountResult({
    started: true,
    taskSpace,
    handedOff: handoff?.done === true,
  });
} else {
  let status = "unknown";
  try {
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const info = await pageInfo();
    const text = await snapshotText();
    status = looksLoggedOut(info?.url, text) ? "expired" : "active";
  } catch (error) {
    accountResult({
      status: "unknown",
      taskSpace,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(0);
  }
  accountResult({ status, taskSpace });
}
