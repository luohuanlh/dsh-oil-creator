// Article Publisher Ego 运行时。Harness 已冻结全部文案；这里只检查、保存草稿并回读验证。
const input = typeof OIL_ARTICLE_INPUT === "object" && OIL_ARTICLE_INPUT !== null
  ? OIL_ARTICLE_INPUT
  : undefined;

const articleAdapters = new Map();

function registerArticleAdapter(adapter) {
  if (!adapter || typeof adapter.platform !== "string"
    || typeof adapter.inspect !== "function"
    || typeof adapter.saveDraft !== "function"
    || typeof adapter.verify !== "function") {
    throw new Error("Article Adapter 必须实现 platform、inspect、saveDraft 和 verify");
  }
  if (articleAdapters.has(adapter.platform)) {
    throw new Error(`Article Adapter 重复注册：${adapter.platform}`);
  }
  articleAdapters.set(adapter.platform, Object.freeze(adapter));
}

function output(value) {
  cliLog(JSON.stringify({ platform: input?.platform || "unknown", ...value }));
}

function publicDraftUrl(value) {
  try {
    const url = new URL(String(value));
    url.searchParams.delete("token");
    url.searchParams.delete("ticket");
    url.searchParams.delete("auth");
    return url.toString();
  } catch {
    return "";
  }
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/([?&](?:token|ticket|auth)=)[^&\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/((?:token|ticket|auth)%3D)[^%&\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/("(?:token|ticket|authToken|ctoken|utoken|spCm)"\s*:\s*")[^"]+/gi,
      "$1[REDACTED]");
}

function articleFailure(message, options = {}) {
  const error = new Error(message);
  error.status = options.status || "BLOCKED_PLATFORM";
  error.exitCode = options.exitCode || 3;
  error.evidence = options.evidence;
  return error;
}

function assertSaved(result, fallbackMessage) {
  if (result?.ok !== true
    || typeof result.remoteId !== "string"
    || result.remoteId.trim() === ""
    || typeof result.draftUrl !== "string"
    || result.draftUrl.trim() === "") {
    throw articleFailure(result?.error || fallbackMessage, {
      evidence: result?.evidence,
    });
  }
  return result;
}
