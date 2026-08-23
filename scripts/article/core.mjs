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
    || !(
      (typeof result.remoteId === "string" && result.remoteId.trim() !== "")
      || (typeof result.draftReceipt === "string" && result.draftReceipt.trim() !== "")
    )
    || typeof result.draftUrl !== "string"
    || result.draftUrl.trim() === "") {
    throw articleFailure(result?.error || fallbackMessage, {
      status: result?.status,
      exitCode: result?.exitCode,
      evidence: result?.evidence,
    });
  }
  return result;
}

function firstMatchingPattern(value, patterns = []) {
  return patterns.find((pattern) => {
    try {
      return new RegExp(pattern, "i").test(String(value || ""));
    } catch {
      return false;
    }
  });
}

async function inspectBrowserDraftForm(config) {
  const existing = await pageInfo().catch(() => undefined);
  if (String(existing?.url || "") !== config.workspaceUrl) {
    await openOrReuseTab(config.workspaceUrl, { wait: true, timeout: 30 });
  }
  let current;
  let text = "";
  let inspection;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await wait(attempt === 0 ? 2 : 1);
    current = await pageInfo();
    text = await snapshotText();
    inspection = await js(String.raw`((config) => {
      void 'OIL_BROWSER_FORM_INSPECT';
      const first = selectors => selectors.find(selector => {
        try {
          return Boolean(document.querySelector(selector));
        } catch {
          return false;
        }
      }) || '';
      return {
        titleSelector: first(config.titleSelectors),
        contentSelector: first(config.contentSelectors),
        url: location.href,
      };
    })(${JSON.stringify(config)})`);
    if (inspection?.titleSelector && inspection?.contentSelector) return inspection;
    const loggedOut = Boolean(
      firstMatchingPattern(current?.url, config.loggedOutUrlPatterns)
      || firstMatchingPattern(text, config.loggedOutTextPatterns)
    );
    if (loggedOut) {
      throw articleFailure(`${config.platformName}登录态已失效，请在 Ego Browser 完成登录后重试`, {
        status: "BLOCKED_AUTH",
        exitCode: 2,
        evidence: {
          editorFound: false,
          url: publicDraftUrl(current?.url),
        },
      });
    }
  }

  throw articleFailure(`${config.platformName}当前页面未找到可审计的图文草稿编辑器`, {
    evidence: {
      editorFound: false,
      url: publicDraftUrl(current?.url),
    },
  });
}

async function saveBrowserDraftForm({ config, articleInput, inspection }) {
  const saved = await js(String.raw`(async (config, input, inspected) => {
    void 'OIL_BROWSER_FORM_SAVE';
    const titleElement = document.querySelector(inspected.titleSelector);
    const contentElement = document.querySelector(inspected.contentSelector);
    if (!titleElement || !contentElement) {
      return { ok: false, error: config.platformName + '草稿编辑器已离开当前页面' };
    }

    const dispatchChange = element => {
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: null,
      }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const setFormValue = (element, value) => {
      const tag = String(element.tagName || '').toLowerCase();
      const prototype = tag === 'textarea'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      dispatchChange(element);
    };
    const setRichValue = (element, html) => {
      if (String(element.tagName || '').toLowerCase() === 'iframe') {
        const body = element.contentDocument?.body;
        if (!body) return false;
        body.innerHTML = html;
        dispatchChange(body);
        return true;
      }
      if (element.matches('input,textarea')) setFormValue(element, html);
      else {
        element.innerHTML = html;
        dispatchChange(element);
      }
      return true;
    };
    if (titleElement.matches('input,textarea')) setFormValue(titleElement, input.title);
    else {
      titleElement.textContent = input.title;
      dispatchChange(titleElement);
    }
    if (!setRichValue(contentElement, input.html)) {
      return { ok: false, error: config.platformName + '正文编辑器尚未就绪' };
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const candidates = [...document.querySelectorAll(
      'button,[role="button"],a,.btn,.button,[class*="draft"],[class*="save"]'
    )];
    const saveControl = candidates.find(element => {
      const label = normalize(element.innerText || element.textContent || element.value);
      return config.saveLabels.includes(label)
        && !/(发布|发表|提交审核|上线|群发)/.test(label);
    });
    let saveClicked = false;
    if (saveControl) {
      saveControl.click();
      saveClicked = true;
    }
    await new Promise(resolve => setTimeout(resolve, config.settleMs || 2500));

    const bodyText = String(document.body?.innerText || '');
    const autoSaved = config.allowAutosave === true
      && config.savedTextPatterns.some(pattern => new RegExp(pattern, 'i').test(bodyText));
    if (!saveClicked && !autoSaved) {
      return {
        ok: false,
        error: config.platformName + '页面没有明确的“保存草稿”控件或自动保存证据',
        evidence: { titleFilled: true, contentFilled: true, saveControlFound: false },
      };
    }

    const currentUrl = location.href;
    const parsed = new URL(currentUrl);
    const idKeys = config.idKeys || [];
    let remoteId = '';
    for (const key of idKeys) {
      remoteId = parsed.searchParams.get(key) || '';
      if (remoteId) break;
      const match = parsed.hash.match(new RegExp('(?:[?&/]|^)' + key + '[=/]([^&#/]+)', 'i'));
      if (match?.[1]) {
        remoteId = decodeURIComponent(match[1]);
        break;
      }
    }
    if (!remoteId) {
      const element = document.querySelector(
        '[data-draft-id],[data-article-id],[data-post-id],[data-content-id]'
      );
      remoteId = element?.dataset?.draftId
        || element?.dataset?.articleId
        || element?.dataset?.postId
        || element?.dataset?.contentId
        || '';
    }
    if (!remoteId) {
      return {
        ok: false,
        status: 'REMOTE_UNVERIFIED',
        exitCode: 4,
        error: config.platformName + '已触发草稿保存，但页面没有返回可验证的草稿 ID',
        evidence: { titleFilled: true, contentFilled: true, saveClicked, autoSaved },
      };
    }
    return {
      ok: true,
      remoteId: String(remoteId),
      draftUrl: currentUrl,
      evidence: {
        browserFormFallback: true,
        saveClicked,
        autoSaved,
        finalPublishBlocked: true,
      },
    };
  })(${JSON.stringify(config)}, ${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
  return assertSaved(saved, `${config.platformName}草稿保存失败`);
}

async function verifyBrowserDraftForm({ config, articleInput, saved }) {
  await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
  await wait(2);
  const verification = await js(String.raw`((config, expectedTitle, expectedId) => {
    void 'OIL_BROWSER_FORM_VERIFY';
    const values = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
      .flatMap(element => [element.value, element.textContent])
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const bodyText = String(document.body?.innerText || '');
    const url = location.href;
    const idMatched = url.includes(encodeURIComponent(expectedId))
      || Boolean(document.querySelector(
        '[data-draft-id="' + CSS.escape(expectedId) + '"],'
        + '[data-article-id="' + CSS.escape(expectedId) + '"],'
        + '[data-post-id="' + CSS.escape(expectedId) + '"]'
      ));
    const titleMatched = values.includes(expectedTitle) || bodyText.includes(expectedTitle);
    const loggedOut = config.loggedOutUrlPatterns.some(pattern =>
      new RegExp(pattern, 'i').test(url));
    return { verified: titleMatched && idMatched && !loggedOut, titleMatched, idMatched, loggedOut, url };
  })(${JSON.stringify(config)}, ${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
  if (verification?.verified !== true) {
    throw articleFailure(`${config.platformName}未通过草稿页面验证`, {
      status: "REMOTE_UNVERIFIED",
      exitCode: 4,
      evidence: { ...verification, url: publicDraftUrl(verification?.url) },
    });
  }
  return verification;
}
