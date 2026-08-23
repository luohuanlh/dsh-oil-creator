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

registerArticleAdapter({
  platform: "wechat-mp",

  async inspect() {
    await openOrReuseTab("https://mp.weixin.qq.com/", { wait: true, timeout: 30 });
    await wait(2);
    const initial = await pageInfo();
    const initialText = await snapshotText();
    if (/扫码登录|请使用微信扫描二维码|请先登录/.test(initialText)
      || /\/login/.test(String(initial?.url || ""))) {
      throw articleFailure("微信公众号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }

    const inspection = await js(String.raw`(() => {
      const html = document.documentElement.innerHTML;
      const token = new URL(location.href).searchParams.get('token')
        || html.match(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/)?.[1]
        || '';
      const ticket = html.match(/ticket:\s*["']([^"']+)["']/)?.[1] || '';
      const userName = html.match(/user_name:\s*["']([^"']+)["']/)?.[1] || '';
      const svrTime = html.match(/time:\s*["'](\d+)["']/)?.[1]
        || String(Math.floor(Date.now() / 1000));
      return {
        ok: Boolean(token && ticket && userName),
        token,
        ticket,
        userName,
        svrTime,
        evidence: {
          hasToken: Boolean(token),
          hasTicket: Boolean(ticket),
          hasUserName: Boolean(userName),
        },
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("无法从已登录页面读取微信公众号草稿凭据", {
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const created = await js(String.raw`(async (input, credentials) => {
      const fail = (error, evidence = {}) => ({ ok: false, error, evidence });
      const bytes = Uint8Array.from(atob(input.coverBase64), char => char.charCodeAt(0));
      const coverBlob = new Blob([bytes], { type: input.coverMime });
      const timestamp = Date.now();
      const extension = input.coverMime === 'image/png'
        ? 'png'
        : input.coverMime === 'image/webp' ? 'webp' : 'jpg';
      const coverName = 'oil-cover-' + timestamp + '.' + extension;
      const coverForm = new FormData();
      coverForm.append('type', input.coverMime);
      coverForm.append('id', String(timestamp));
      coverForm.append('name', coverName);
      coverForm.append('lastModifiedDate', new Date().toString());
      coverForm.append('size', String(coverBlob.size));
      coverForm.append('file', coverBlob, coverName);
      const uploadUrl = 'https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material'
        + '&f=json&scene=8&writetype=doublewrite&groupid=1'
        + '&ticket_id=' + encodeURIComponent(credentials.userName)
        + '&ticket=' + encodeURIComponent(credentials.ticket)
        + '&svr_time=' + encodeURIComponent(credentials.svrTime)
        + '&token=' + encodeURIComponent(credentials.token)
        + '&lang=zh_CN&seq=' + Date.now()
        + '&t=' + Math.random();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        credentials: 'include',
        body: coverForm,
      });
      const upload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || upload.base_resp?.err_msg !== 'ok' || !upload.cdn_url) {
        return fail('微信公众号封面上传失败', {
          status: uploadResponse.status,
          response: upload,
        });
      }
      let coverContent = {};
      try {
        coverContent = typeof upload.content === 'string'
          ? JSON.parse(upload.content)
          : upload.content || {};
      } catch {}
      const coverFileId = String(coverContent.file_id || coverContent.id || upload.file_id || '');
      const coverUrl = String(upload.cdn_url);

      const form = new URLSearchParams({
        token: credentials.token,
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
        random: String(Math.random()),
        AppMsgId: '',
        count: '1',
        data_seq: '0',
        operate_from: 'Chrome',
        isnew: '0',
        ad_video_transition0: '',
        can_reward0: '0',
        related_video0: '',
        is_video_recommend0: '-1',
        title0: input.title,
        author0: '',
        writerid0: '0',
        fileid0: coverFileId,
        digest0: input.summary,
        auto_gen_digest0: input.summary ? '0' : '1',
        content0: input.html,
        sourceurl0: '',
        need_open_comment0: '1',
        only_fans_can_comment0: '0',
        cdn_url0: coverUrl,
        cdn_235_1_url0: coverUrl,
        cdn_1_1_url0: coverUrl,
        cdn_url_back0: coverUrl,
        crop_list0: '',
        music_id0: '',
        video_id0: '',
        voteid0: '',
        voteismlt0: '',
        supervoteid0: '',
        cardid0: '',
        cardquantity0: '',
        cardlimit0: '',
        vid_type0: '',
        show_cover_pic0: '1',
        shortvideofileid0: '',
        copyright_type0: '0',
        releasefirst0: '',
        platform0: '',
        reprint_permit_type0: '',
        allow_reprint0: '',
        allow_reprint_modify0: '',
        original_article_type0: '',
        ori_white_list0: '',
        free_content0: '',
        fee0: '0',
        ad_id0: '',
        guide_words0: '',
        is_share_copyright0: '0',
        share_copyright_url0: '',
        source_article_type0: '',
        reprint_recommend_title0: '',
        reprint_recommend_content0: '',
        share_page_type0: '0',
        share_imageinfo0: JSON.stringify({ list: [{ url: coverUrl }] }),
        share_video_id0: '',
        dot0: '{}',
        share_voice_id0: '',
        insert_ad_mode0: '',
        categories_list0: '[]',
      });
      const saveUrl = 'https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77'
        + '&token=' + encodeURIComponent(credentials.token) + '&lang=zh_CN';
      const saveResponse = await fetch(saveUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || !saved.appMsgId) {
        return fail('微信公众号保存草稿失败', {
          status: saveResponse.status,
          response: saved,
        });
      }
      const remoteId = String(saved.appMsgId);
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77'
          + '&appmsgid=' + encodeURIComponent(remoteId)
          + '&token=' + encodeURIComponent(credentials.token) + '&lang=zh_CN',
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(created, "微信公众号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(3);
    const verification = await js(String.raw`((expectedTitle, expectedId) => {
      const values = [...document.querySelectorAll('input,textarea')]
        .map(element => String(element.value || '').trim())
        .filter(Boolean);
      const text = String(document.body?.innerText || '');
      const titleMatched = values.includes(expectedTitle) || text.includes(expectedTitle);
      const idMatched = new URL(location.href).searchParams.get('appmsgid') === expectedId;
      const loggedOut = /扫码登录|请使用微信扫描二维码|请先登录/.test(text);
      return {
        verified: titleMatched && idMatched && !loggedOut,
        titleMatched,
        idMatched,
        loggedOut,
        url: location.href,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("微信公众号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "baijiahao",

  async inspect() {
    const workspaceUrl = "https://baijiahao.baidu.com/builder/rc/edit";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const inspection = await js(String.raw`(async () => {
      const fail = (error, evidence = {}) => ({ ok: false, error, evidence });
      const appInfoResponse = await fetch(
        'https://baijiahao.baidu.com/builder/app/appinfo?_=' + Date.now(),
        { credentials: 'include' },
      );
      const appInfo = await appInfoResponse.json().catch(() => ({}));
      if (!appInfoResponse.ok || appInfo.errmsg !== 'success' || !appInfo.data?.user) {
        return fail('百家号登录态已失效，请在 Ego Browser 完成登录后重试', {
          authRequired: true,
          status: appInfoResponse.status,
          errno: appInfo.errno,
          errmsg: appInfo.errmsg,
        });
      }
      const editResponse = await fetch('https://baijiahao.baidu.com/builder/rc/edit', {
        credentials: 'include',
      });
      const editHtml = await editResponse.text();
      const authToken = editHtml.match(/window\.__BJH__INIT__AUTH__\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
      if (!editResponse.ok || !authToken) {
        return fail('无法从已登录页面读取百家号草稿凭据', {
          status: editResponse.status,
          hasAuthToken: Boolean(authToken),
        });
      }
      return { ok: true, authToken };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure(inspection?.error || "百家号页面检查失败", {
        status: inspection?.evidence?.authRequired === true ? "BLOCKED_AUTH" : "BLOCKED_PLATFORM",
        exitCode: inspection?.evidence?.authRequired === true ? 2 : 3,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const created = await js(String.raw`(async (input, credentials) => {
      const fail = (error, evidence = {}) => ({ ok: false, error, evidence });
      const bytes = Uint8Array.from(atob(input.coverBase64), char => char.charCodeAt(0));
      const coverBlob = new Blob([bytes], { type: input.coverMime });
      const extension = input.coverMime === 'image/png'
        ? 'png'
        : input.coverMime === 'image/webp' ? 'webp' : 'jpg';
      const coverForm = new FormData();
      coverForm.append('media', coverBlob, 'oil-cover-' + Date.now() + '.' + extension);
      coverForm.append('type', 'image');
      coverForm.append('app_id', '1589639493090963');
      coverForm.append('is_waterlog', '1');
      coverForm.append('save_material', '1');
      coverForm.append('no_compress', '0');
      coverForm.append('is_events', '');
      coverForm.append('article_type', 'news');
      const coverResponse = await fetch('https://baijiahao.baidu.com/pcui/picture/uploadproxy', {
        method: 'POST',
        credentials: 'include',
        body: coverForm,
      });
      const cover = await coverResponse.json().catch(() => ({}));
      const coverUrl = String(cover.ret?.https_url || '');
      if (!coverResponse.ok || cover.errmsg !== 'success' || !coverUrl) {
        return fail('百家号封面上传失败', {
          status: coverResponse.status,
          errno: cover.errno,
          errmsg: cover.errmsg,
        });
      }

      const safeCoverUrl = coverUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const content = '<p><img src="' + safeCoverUrl + '" alt="" /></p>' + input.html;
      const saveForm = new URLSearchParams({
        title: input.title,
        subtitle: input.summary,
        content,
        feed_cat: '1',
        len: String(content.length),
        activity_list: JSON.stringify([{ id: 408, is_checked: 0 }]),
        source_reprinted_allow: '0',
        original_status: '0',
        original_handler_status: '1',
        isBeautify: 'false',
        bjhtopic_id: '',
        bjhtopic_info: '',
        type: 'news',
      });
      const saveResponse = await fetch(
        'https://baijiahao.baidu.com/pcui/article/save?callback=bjhdraft',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            token: credentials.authToken,
          },
          body: saveForm,
        },
      );
      const responseText = await saveResponse.text();
      let saved = {};
      try {
        const json = responseText.trim()
          .replace(/^bjhdraft\s*\(/, '')
          .replace(/\)\s*;?$/, '');
        saved = JSON.parse(json);
      } catch {
        return fail('百家号草稿响应无法解析', {
          status: saveResponse.status,
          responsePrefix: responseText.slice(0, 200),
        });
      }
      const remoteId = String(saved.ret?.article_id || '');
      if (!saveResponse.ok || saved.errmsg !== 'success' || !remoteId) {
        return fail('百家号保存草稿失败', {
          status: saveResponse.status,
          errno: saved.errno,
          errmsg: saved.errmsg,
        });
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://baijiahao.baidu.com/builder/rc/edit?type=news&article_id='
          + encodeURIComponent(remoteId),
        evidence: {
          coverUploaded: true,
          coverUsedAsFirstImage: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(created, "百家号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle);
        const idMatched = new URL(location.href).searchParams.get('article_id') === expectedId;
        const loggedOut = /登录百家号|扫码登录|手机登录/.test(text)
          || /\/login/.test(location.pathname);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("百家号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

const penguinDraftForm = Object.freeze({
  platformName: "企鹅号",
  workspaceUrl: "https://om.qq.com/main/creation/article",
  loggedOutUrlPatterns: ["/userAuth/", "/userAuth\\b"],
  loggedOutTextPatterns: ["QQ登录", "微信登录", "立即登录"],
  titleSelectors: [
    ".omui-articletitle__title1 .omui-inputautogrowing__inner",
    "[class*='articletitle'] [contenteditable='true']",
    "input[placeholder*='标题']",
  ],
  contentSelectors: [".ProseMirror", "[contenteditable='true'].ProseMirror"],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["已自动保存", "草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "id"],
  allowAutosave: true,
  settleMs: 3500,
});

registerArticleAdapter({
  platform: "penguin",

  async inspect() {
    return inspectBrowserDraftForm(penguinDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: penguinDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: penguinDraftForm, articleInput, saved });
  },
});

registerArticleAdapter({
  platform: "netease",

  async inspect() {
    const workspaceUrl = "https://mp.163.com/index.html#/post/article";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/\/login\.html/.test(String(current?.url || ""))
      || /登录\s*\/\s*注册|立即注册网易邮箱账号/.test(text)) {
      throw articleFailure("网易号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    if (/未完成实名认证/.test(text)) {
      throw articleFailure("网易号账号尚未完成实名认证，请认证通过后重试", {
        status: "BLOCKED_PLATFORM",
        exitCode: 3,
        evidence: { accountOnboardingRequired: true },
      });
    }

    const inspection = await js(String.raw`(async () => {
      void 'OIL_NETEASE_INSPECT';
      const current = new URL(location.href);
      const links = [...document.querySelectorAll('a[href*="wemediaId="]')]
        .map(element => element.href);
      let wemediaId = current.searchParams.get('wemediaId') || '';
      if (!wemediaId) {
        for (const href of links) {
          const value = new URL(href, location.href).searchParams.get('wemediaId');
          if (value) {
            wemediaId = value;
            break;
          }
        }
      }
      const query = new URLSearchParams({ wemediaId, mediaId: wemediaId });
      const initResponse = await fetch('/wemedia/article/postpage.do?' + query, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const initBody = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok || initBody.code !== 1) {
        return {
          ok: false,
          authRequired: initResponse.status === 401 || initBody.code === 100001,
          error: initBody.msg || '网易号账号检查失败',
          evidence: { status: initResponse.status, code: initBody.code },
        };
      }
      wemediaId = String(wemediaId || initBody.data?.wemediaId || initBody.data?.post?.wemediaId || '');

      const categoryResponse = await fetch('/wemedia/article/status/api/classifies/get.do', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const categoryBody = await categoryResponse.json().catch(() => ({}));
      const findPath = (nodes, path = []) => {
        if (!Array.isArray(nodes)) return '';
        for (const node of nodes) {
          const id = node?.categoryId ?? node?.id ?? node?.value;
          if (id === undefined || id === null || id === '') continue;
          const nextPath = [...path, String(id)];
          const children = node.subCategoryList || node.children || node.list;
          const nested = findPath(children, nextPath);
          if (nested) return nested;
          if (!Array.isArray(children) || children.length === 0) return nextPath.join('/');
        }
        return '';
      };
      const categoryData = categoryBody.data || {};
      const categoryPath = String(initBody.data?.post?.userClassify || '')
        || findPath(categoryData.native)
        || findPath(categoryData.customize)
        || findPath(Array.isArray(categoryData) ? categoryData : []);
      return {
        ok: Boolean(wemediaId && categoryPath && categoryResponse.ok && categoryBody.code === 1),
        wemediaId,
        categoryPath,
        evidence: {
          categoryReady: Boolean(categoryPath),
          accountReady: Boolean(wemediaId),
        },
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure(inspection?.error || "网易号账号或分类检查失败", {
        status: inspection?.authRequired ? "BLOCKED_AUTH" : "BLOCKED_PLATFORM",
        exitCode: inspection?.authRequired ? 2 : 3,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const saved = await js(String.raw`(async (input, account) => {
      void 'OIL_NETEASE_SAVE';
      const params = new URLSearchParams({
        wemediaId: account.wemediaId,
        articleId: '-1',
        title: input.title,
        content: input.html,
        userClassify: account.categoryPath,
        cover: 'auto',
        scheduled: '0',
        operation: 'saveDraft',
        NECaptchaValidate: '',
        picUrl: '',
      });
      const response = await fetch('/wemedia/article/status/api/publish.do', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: params,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.code !== 1) {
        return {
          ok: false,
          error: body.msg || '网易号保存草稿失败',
          evidence: { status: response.status, code: body.code, operation: 'saveDraft' },
        };
      }

      let remoteId = String(
        body.data?.articleId || body.data?.docid || body.data?.id || body.articleId || ''
      );
      if (!remoteId) {
        const listParams = new URLSearchParams({
          wemediaId: account.wemediaId,
          pageNo: '1',
          contentState: '0',
          size: '20',
          word: input.title,
          contentType: '4',
        });
        const listResponse = await fetch('/wemedia/content/manage/list.do', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: listParams,
        });
        const listBody = await listResponse.json().catch(() => ({}));
        const items = Array.isArray(listBody.data?.list) ? listBody.data.list : [];
        const matched = items.find(item => String(item.title || '').trim() === input.title);
        remoteId = String(matched?.articleId || matched?.docid || matched?.id || '');
      }
      if (!remoteId) {
        return {
          ok: false,
          status: 'REMOTE_UNVERIFIED',
          exitCode: 4,
          error: '网易号已返回草稿保存成功，但内容管理列表未找到草稿 ID',
          evidence: { operation: 'saveDraft', saveAccepted: true },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.163.com/index.html#/edit/article/'
          + encodeURIComponent(remoteId) + '?wemediaId=' + encodeURIComponent(account.wemediaId),
        evidence: {
          operation: 'saveDraft',
          categorySelected: true,
          coverDeferred: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(saved, "网易号草稿创建失败");
  },

  async verify({ input: articleInput, inspection, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(2);
    const verification = await js(String.raw`(async (expectedTitle, account, expectedId) => {
      void 'OIL_NETEASE_VERIFY';
      const query = new URLSearchParams({
        postId: expectedId,
        wemediaId: account.wemediaId,
        mediaId: account.wemediaId,
      });
      const response = await fetch('/wemedia/article/editpage.do?' + query, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => ({}));
      const post = body.data?.post || {};
      const titleMatched = String(post.title || '').trim() === expectedTitle;
      const idMatched = location.hash.includes('/edit/article/' + encodeURIComponent(expectedId))
        && String(post.docid || post.articleId || expectedId) === expectedId;
      return {
        verified: response.ok && body.code === 1 && titleMatched && idMatched,
        titleMatched,
        idMatched,
        status: response.status,
        code: body.code,
        url: location.href,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(inspection)}, ${JSON.stringify(saved.remoteId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("网易号未通过草稿接口回读验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "yidian",

  async inspect() {
    const workspaceUrl = "https://mp.yidianzixun.com/#/Writing";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/注册登录|注册一点号/.test(text) && !/\/Writing/.test(String(current?.url || ""))) {
      throw articleFailure("一点号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }

    const inspection = await js(String.raw`(() => {
      void 'OIL_YIDIAN_INSPECT';
      const code = String(document.querySelector('#__val_')?.textContent || '');
      const user = typeof window.mpuser === 'object' && window.mpuser ? window.mpuser : {};
      const idMatch = code.match(/(?:^|[,;{]\s*)id\s*:\s*['"]([^'"]+)['"]/);
      const nameMatch = code.match(/media_name\s*:\s*['"]([^'"]+)['"]/);
      const userId = String(user.id || idMatch?.[1] || '');
      return {
        ok: Boolean(userId),
        userId,
        mediaName: String(user.media_name || nameMatch?.[1] || ''),
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("一点号页面未返回已登录账号信息", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
        evidence: { accountDetected: false },
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput }) {
    const saved = await js(String.raw`(async (input) => {
      void 'OIL_YIDIAN_SAVE';
      const params = new URLSearchParams({
        title: input.title,
        cate: '',
        cateB: '',
        coverType: 'default',
        content: input.html,
        hasSubTitle: '0',
        subTitle: '',
        original: '0',
        reward: '0',
        is_mobile: '0',
        status: '0',
        import_url: '',
        import_hash: '',
        minTimingHour: '3',
        maxTimingDay: '7',
        isPubed: 'false',
        editorType: 'articleEditor',
        activity_id: '0',
        join_activity: '0',
        notSaveToStore: 'true',
        tags: JSON.stringify(input.tags || []),
        covers: '[]',
        videos: '[]',
        audios: '[]',
        votes: JSON.stringify({
          vote_id: '',
          vote_options: [],
          vote_end_time: '',
          vote_title: '',
          vote_type: 1,
          isAdded: false,
        }),
      });
      const response = await fetch('https://mp.yidianzixun.com/model/Article', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: params,
      });
      const body = await response.json().catch(() => ({}));
      const remoteId = String(body.id || body.data?.id || '');
      if (!response.ok || !remoteId) {
        return {
          ok: false,
          error: body.error || body.message || '一点号保存草稿失败',
          evidence: { status: response.status, hasId: Boolean(remoteId) },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.yidianzixun.com/#/Writing/' + encodeURIComponent(remoteId),
        evidence: {
          status: 0,
          originalDeclared: false,
          coverDeferred: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(saved, "一点号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        void 'OIL_YIDIAN_VERIFY';
        const values = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
          .flatMap(element => [element.value, element.textContent])
          .map(value => String(value || '').trim())
          .filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle) || text.includes(expectedTitle);
        const idMatched = location.hash.includes('/Writing/' + encodeURIComponent(expectedId));
        const loggedOut = /注册登录|注册一点号/.test(text) && !idMatched;
        return { verified: titleMatched && idMatched && !loggedOut, titleMatched, idMatched, loggedOut, url: location.href };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("一点号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "dayu",

  async inspect() {
    const workspaceUrl = "https://mp.dayu.com/dashboard/article/write";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/redirect_url=|扫码登录|密码登录|验证码登录/.test(`${current?.url || ""}\n${text}`)) {
      throw articleFailure("大鱼号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }

    const inspection = await js(String.raw`(async () => {
      void 'OIL_DAYU_INSPECT';
      const response = await fetch('https://mp.dayu.com/dashboard/index', {
        credentials: 'include',
        headers: { Accept: 'text/html' },
      });
      const html = await response.text();
      const read = key => {
        const pattern = new RegExp(key + "(?:['\"\\s]*:|['\"\\s]+)\\s*['\"]([^'\"]+)['\"]");
        return html.match(pattern)?.[1] || '';
      };
      const utoken = read('utoken');
      const mediaId = read('wmid');
      const mediaName = read('weMediaName');
      return {
        ok: response.ok && Boolean(utoken && mediaId),
        utoken,
        mediaId,
        mediaName,
        evidence: {
          status: response.status,
          hasToken: Boolean(utoken),
          hasMediaId: Boolean(mediaId),
        },
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("大鱼号账号检查失败", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const saved = await js(String.raw`(async (input, account) => {
      void 'OIL_DAYU_SAVE';
      const params = new URLSearchParams({
        title: input.title,
        content: input.html,
        author: account.mediaName,
        coverImg: '',
        article_type: '1',
        utoken: account.utoken,
        cover_from: 'auto',
      });
      const response = await fetch('https://mp.dayu.com/dashboard/save-draft', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          utoken: account.utoken,
        },
        body: params,
      });
      const body = await response.json().catch(() => ({}));
      const remoteId = String(body.data?._id || '');
      if (!response.ok || body.error || !remoteId) {
        return {
          ok: false,
          error: body.error || '大鱼号保存草稿失败',
          evidence: { status: response.status, hasId: Boolean(remoteId) },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.dayu.com/dashboard/article/write?draft_id='
          + encodeURIComponent(remoteId),
        evidence: {
          articleType: 1,
          coverDeferred: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(saved, "大鱼号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        void 'OIL_DAYU_VERIFY';
        const values = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
          .flatMap(element => [element.value, element.textContent])
          .map(value => String(value || '').trim())
          .filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle) || text.includes(expectedTitle);
        const idMatched = new URL(location.href).searchParams.get('draft_id') === expectedId;
        const loggedOut = /扫码登录|密码登录|验证码登录/.test(text);
        return { verified: titleMatched && idMatched && !loggedOut, titleMatched, idMatched, loggedOut, url: location.href };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("大鱼号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "dingduan",

  async inspect() {
    const workspaceUrl = "https://mp.topnews.cn/#/scriptWrite";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/\/login/.test(String(current?.url || "")) || /扫码登录|扫描二维码登录/.test(text)) {
      throw articleFailure("顶端新闻登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }

    const inspection = await js(String.raw`(async () => {
      void 'OIL_DINGDUAN_INSPECT';
      const findAxios = () => {
        const root = document.querySelector('#app')?.__vue__
          || [...document.querySelectorAll('*')].find(element => element.__vue__)?.__vue__;
        return root?.$root?.$axios || root?.$axios || window.axios || null;
      };
      const client = findAxios();
      if (!client) return { ok: false, error: '顶端创作平台请求客户端尚未就绪' };
      try {
        const response = await client.get(
          'https://resource.topnews.cn/api/draft/search?type=1&page=1&size=1'
        );
        return {
          ok: response?.data?.code === 0,
          evidence: { code: response?.data?.code, requestClientReady: true },
        };
      } catch (error) {
        return {
          ok: false,
          authRequired: error?.response?.status === 401 || error?.response?.status === 403,
          error: error?.response?.data?.msg || error?.message || '顶端新闻账号检查失败',
          evidence: { status: error?.response?.status, requestClientReady: true },
        };
      }
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure(inspection?.error || "顶端新闻账号检查失败", {
        status: inspection?.authRequired ? "BLOCKED_AUTH" : "BLOCKED_PLATFORM",
        exitCode: inspection?.authRequired ? 2 : 3,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput }) {
    const saved = await js(String.raw`(async (input) => {
      void 'OIL_DINGDUAN_SAVE';
      const root = document.querySelector('#app')?.__vue__
        || [...document.querySelectorAll('*')].find(element => element.__vue__)?.__vue__;
      const client = root?.$root?.$axios || root?.$axios || window.axios || null;
      if (!client) return { ok: false, error: '顶端创作平台请求客户端尚未就绪' };

      const queue = root ? [root.$root || root] : [];
      let category = '';
      while (queue.length) {
        const component = queue.shift();
        const data = component?.$data || {};
        if (!category && typeof data.channel !== 'undefined') {
          category = String(data.channel || '');
        }
        if (Array.isArray(component?.$children)) queue.push(...component.$children);
      }
      const payload = {
        title: input.title,
        content: input.html,
        resource_url: '[]',
        category,
        type: 1,
        save_type: 1,
        material_ids: '',
        creator_source: 2,
        cover_show_type: 0,
        cover_url: '[]',
        is_original: '0',
        is_tips: '0',
        is_allow_comment: 'Y',
        is_allow_adv: 'Y',
        empower: 0,
      };
      let response;
      try {
        response = await client.post('https://resource.topnews.cn/api/article/add', payload);
      } catch (error) {
        return {
          ok: false,
          error: error?.response?.data?.msg || error?.message || '顶端新闻保存草稿失败',
          evidence: { status: error?.response?.status, saveType: 1 },
        };
      }
      if (response?.data?.code !== 0) {
        return {
          ok: false,
          error: response?.data?.msg || response?.data?.data || '顶端新闻保存草稿失败',
          evidence: { code: response?.data?.code, saveType: 1 },
        };
      }
      const globalId = String(response.data.data?.global_id || response.data.data?.globalId || '');
      let matched;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 800));
        const listResponse = await client.get(
          'https://resource.topnews.cn/api/draft/search?type=1&page=1&size=20'
        );
        const items = Array.isArray(listResponse?.data?.data?.returnData)
          ? listResponse.data.data.returnData
          : [];
        matched = items.find(item =>
          (globalId && String(item.global_id || '') === globalId)
          || String(item.nd_title || '').trim() === input.title
        );
        if (matched?.nd_id) break;
      }
      const remoteId = String(matched?.nd_id || '');
      if (!remoteId) {
        return {
          ok: false,
          status: 'REMOTE_UNVERIFIED',
          exitCode: 4,
          error: '顶端新闻已接受草稿保存，但草稿库未返回可验证的 ID',
          evidence: { saveType: 1, globalIdReturned: Boolean(globalId) },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.topnews.cn/#/scriptWrite?draftId=' + encodeURIComponent(remoteId),
        evidence: {
          saveType: 1,
          globalIdReturned: Boolean(globalId),
          categorySelected: Boolean(category),
          coverDeferred: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(saved, "顶端新闻草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(2);
    const verification = await js(String.raw`(async (expectedTitle, expectedId) => {
      void 'OIL_DINGDUAN_VERIFY';
      const root = document.querySelector('#app')?.__vue__
        || [...document.querySelectorAll('*')].find(element => element.__vue__)?.__vue__;
      const client = root?.$root?.$axios || root?.$axios || window.axios || null;
      if (!client) return { verified: false, requestClientReady: false, url: location.href };
      try {
        const response = await client.get(
          'https://resource.topnews.cn/api/draft/show?id=' + encodeURIComponent(expectedId)
        );
        const draft = response?.data?.data || {};
        const titleMatched = String(draft.nd_title || '').trim() === expectedTitle;
        const idMatched = String(draft.nd_id || expectedId) === expectedId
          && location.hash.includes('draftId=' + encodeURIComponent(expectedId));
        return {
          verified: response?.data?.code === 0 && titleMatched && idMatched,
          titleMatched,
          idMatched,
          code: response?.data?.code,
          url: location.href,
        };
      } catch (error) {
        return {
          verified: false,
          status: error?.response?.status,
          error: error?.response?.data?.msg || error?.message,
          url: location.href,
        };
      }
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("顶端新闻未通过草稿接口回读验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "xueqiu",

  async inspect() {
    await openOrReuseTab("https://mp.xueqiu.com/writeV2", { wait: true, timeout: 30 });
    await wait(2);
    const text = await snapshotText();
    if (/未登录/.test(text)) {
      throw articleFailure("雪球号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    return { ok: true };
  },

  async saveDraft({ input: articleInput }) {
    const created = await js(String.raw`(async (input) => {
      const content = input.html
        .replace(/<h[1-6][^>]*>/gi, '<h4>')
        .replace(/<\/h[1-6]>/gi, '</h4>')
        .replace(/<strong>/gi, '<b>')
        .replace(/<\/strong>/gi, '</b>')
        .replace(/<em>/gi, '<i>')
        .replace(/<\/em>/gi, '</i>');
      const form = new URLSearchParams({
        text: content,
        title: input.title,
        cover_pic: '',
        flags: 'false',
        original_event: '',
        status_id: '',
        legal_user_visible: 'false',
        is_private: 'false',
      });
      const response = await fetch('https://mp.xueqiu.com/xq/statuses/draft/save.json', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      const remoteId = String(body.id || '');
      if (!response.ok || !remoteId) {
        return {
          ok: false,
          error: body.error_description || '雪球号保存草稿失败',
          evidence: { status: response.status },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.xueqiu.com/writeV2/draft/' + encodeURIComponent(remoteId),
        evidence: {
          contentConverted: true,
          privateDraft: false,
          coverDeferred: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(created, "雪球号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle);
        const idMatched = location.pathname.endsWith('/writeV2/draft/' + expectedId);
        const loggedOut = /未登录/.test(text);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("雪球号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "eastmoney",

  async inspect() {
    const workspaceUrl = "https://mp.eastmoney.com/collect/pc_article/index.html#/";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/加入我们|解锁创作者专属权益/.test(text)
      || /pc_writer\/usercenter/.test(String(current?.url || ""))) {
      throw articleFailure("东方财富号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    const inspection = await js(String.raw`(() => {
      const cookies = Object.fromEntries(String(document.cookie || '')
        .split(';')
        .map(item => item.trim().split('='))
        .filter(parts => parts.length >= 2)
        .map(([key, ...rest]) => [key, rest.join('=')]));
      const ctoken = cookies.ct || '';
      const utoken = cookies.ut || '';
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const deviceId = Array.from(bytes)
        .map(value => value.toString(16).padStart(2, '0').toUpperCase())
        .join('');
      return {
        ok: Boolean(ctoken && utoken),
        ctoken,
        utoken,
        deviceId,
        evidence: { hasCtoken: Boolean(ctoken), hasUtoken: Boolean(utoken) },
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("无法从东方财富已登录页面读取草稿 token", {
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const created = await js(String.raw`(async (input, credentials) => {
      const buildParm = (draftId, title, text) => [
        { ip: '$IP$' },
        { deviceid: credentials.deviceId },
        { version: '100' },
        { plat: 'web' },
        { product: 'CFH' },
        { ctoken: credentials.ctoken },
        { utoken: credentials.utoken },
        { draftid: draftId || '' },
        { drafttype: '0' },
        { type: '0' },
        { title: encodeURIComponent(title) },
        { text: encodeURIComponent(text) },
        { columns: '2' },
        { cover: '' },
        { issimplevideo: '0' },
        { videos: '' },
        { vods: '' },
        { isoriginal: '0' },
        { tgProduct: '' },
        { spcolumns: '' },
        { textsource: '0' },
        { replyauthority: '' },
        { modules: encodeURIComponent('[]') },
      ];
      const callDraftApi = async (parm, draftId) => {
        const pageUrl = draftId
          ? 'https://mp.eastmoney.com/collect/pc_article/index.html#/?id=' + encodeURIComponent(draftId)
          : 'https://mp.eastmoney.com/collect/pc_article/index.html#/';
        let response;
        try {
          response = await fetch(
            'https://emfront.eastmoney.com/apifront/Tran/GetData?platform=',
            {
              method: 'POST',
              // 官方前端通过请求体内的 ct/ut 鉴权；携带跨域 Cookie 会触发 CORS 拒绝。
              credentials: 'omit',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pageUrl,
                path: 'draft/api/Article/SaveDraft',
                parm: JSON.stringify(parm),
              }),
            },
          );
        } catch {
          return { ok: false, error: '东方财富草稿请求被浏览器网络策略阻断' };
        }
        const responseText = await response.text();
        let outer = {};
        try {
          outer = JSON.parse(responseText);
        } catch {
          return { ok: false, error: '东方财富草稿响应无法解析', status: response.status };
        }
        if (!response.ok || outer.RRquestSuccess !== true || outer.RCode !== 200) {
          return {
            ok: false,
            error: outer.RMsg || '东方财富草稿 API 请求失败',
            status: response.status,
          };
        }
        let inner = {};
        try {
          inner = JSON.parse(outer.RData);
        } catch {
          return { ok: false, error: '东方财富草稿业务响应无法解析' };
        }
        if (inner.error_code !== 0) {
          return { ok: false, error: inner.me || '东方财富草稿业务错误' };
        }
        return { ok: true, body: inner };
      };

      const emptyContent = '<div class="xeditor_content cfh_web"></div>';
      const createResult = await callDraftApi(buildParm('', input.title, emptyContent));
      const remoteId = String(createResult.body?.draft_id || '');
      if (createResult.ok !== true || !remoteId) {
        return { ok: false, error: createResult.error || '东方财富创建草稿响应缺少 ID' };
      }
      const content = '<div class="xeditor_content cfh_web">' + input.html + '</div>';
      const updateResult = await callDraftApi(
        buildParm(remoteId, input.title, content),
        remoteId,
      );
      if (updateResult.ok !== true) return { ok: false, error: updateResult.error };
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.eastmoney.com/collect/pc_article/index.html#/?id='
          + encodeURIComponent(remoteId),
        evidence: {
          draftCreated: true,
          contentUpdated: true,
          originalDeclared: false,
          coverDeferred: true,
          crossOriginCookiesOmitted: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(created, "东方财富号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle);
        const idMatched = location.hash.includes('id=' + encodeURIComponent(expectedId));
        const loggedOut = /加入我们|解锁创作者专属权益/.test(text)
          || /pc_writer\/usercenter/.test(location.href);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("东方财富号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

const jqkaDraftForm = Object.freeze({
  platformName: "同顺号",
  workspaceUrl: "https://t.10jqka.com.cn/newcircle/creation/adviserEnterGuide/",
  loggedOutUrlPatterns: ["/login", "/signin"],
  loggedOutTextPatterns: ["未登录", "请登录"],
  titleSelectors: [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
  ],
  contentSelectors: [
    ".ql-editor",
    ".ProseMirror",
    ".edui-body-container",
    "iframe[id*='editor']",
    "[contenteditable='true'][data-placeholder*='内容']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "postId", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "10jqka",

  async inspect() {
    return inspectBrowserDraftForm(jqkaDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: jqkaDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: jqkaDraftForm, articleInput, saved });
  },
});

registerArticleAdapter({
  platform: "sohu",

  async inspect() {
    const workspaceUrl = "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/账号登录|手机登录|注册账号/.test(text)
      || /mpfe\/v4\/login/.test(String(current?.url || ""))) {
      throw articleFailure("搜狐号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }

    const inspection = await js(String.raw`(async () => {
      const response = await fetch(
        'https://mp.sohu.com/mpbp/bp/account/list?_=' + Date.now(),
        { credentials: 'include' },
      );
      const body = await response.json().catch(() => ({}));
      const groups = Array.isArray(body.data?.data) ? body.data.data : [];
      const accounts = groups.flatMap(group => Array.isArray(group.accounts) ? group.accounts : []);
      const account = accounts[0];
      if (!response.ok || body.code !== 2000000 || !account?.id) {
        return {
          ok: false,
          error: '搜狐号账号检查失败',
          evidence: { status: response.status, code: body.code, accountCount: accounts.length },
        };
      }
      const cookieMatch = String(document.cookie || '').match(/(?:^|;\s*)mp-cv=([^;]+)/);
      const deviceId = Array.from({ length: 32 }, () =>
        '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
      return {
        ok: true,
        accountId: String(account.id),
        deviceId,
        spCm: cookieMatch?.[1] || ('100-' + Date.now() + '-' + deviceId),
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure(inspection?.error || "搜狐号账号检查失败", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const created = await js(String.raw`(async (input, account) => {
      const postData = {
        title: input.title,
        brief: input.summary,
        content: input.html,
        channelId: 24,
        categoryId: -1,
        id: 0,
        userColumnId: 0,
        columnNewsIds: [],
        businessCode: 0,
        declareOriginal: false,
        cover: '',
        topicIds: [],
        isAd: 0,
        userLabels: '[]',
        reprint: false,
        customTags: input.tags.join(','),
        infoResource: 0,
        sourceUrl: '',
        visibleToLoginedUsers: 0,
        attrIds: [],
        auto: true,
        accountId: Number(account.accountId),
      };
      const response = await fetch(
        'https://mp.sohu.com/mpbp/bp/news/v4/news/draft/v2?accountId='
          + encodeURIComponent(account.accountId),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'dv-id': account.deviceId,
            'sp-cm': account.spCm,
          },
          body: JSON.stringify(postData),
        },
      );
      const body = await response.json().catch(() => ({}));
      const remoteId = String(body.data || '');
      if (!response.ok || body.success !== true || !remoteId) {
        return {
          ok: false,
          error: body.msg || '搜狐号保存草稿失败',
          evidence: { status: response.status, success: body.success },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle'
          + '?spm=smmp.articlelist.0.0&contentStatus=2&id=' + encodeURIComponent(remoteId),
        evidence: {
          accountSelected: true,
          originalDeclared: false,
          coverDeferred: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(created, "搜狐号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const params = new URL(location.href).searchParams;
        const titleMatched = values.includes(expectedTitle);
        const idMatched = params.get('id') === expectedId && params.get('contentStatus') === '2';
        const loggedOut = /账号登录|手机登录|注册账号/.test(text)
          || /\/login/.test(location.pathname);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("搜狐号未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "weibo",

  async inspect() {
    const workspaceUrl = "https://card.weibo.com/article/v5/editor";
    await openOrReuseTab(workspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/登录\/注册/.test(text) || /weibo\.com\/newlogin/.test(String(current?.url || ""))) {
      throw articleFailure("微博登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    const inspection = await js(String.raw`(async () => {
      const response = await fetch('https://card.weibo.com/article/v5/editor', {
        credentials: 'include',
      });
      const html = await response.text();
      const match = html.match(/config:\s*JSON\.parse\('(.+?)'\)/);
      if (!response.ok || !match?.[1]) {
        return {
          ok: false,
          error: '无法从微博文章编辑器读取账号配置',
          evidence: { status: response.status, configMatched: Boolean(match?.[1]) },
        };
      }
      try {
        const config = JSON.parse(match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
        return {
          ok: Boolean(config.uid),
          uid: String(config.uid || ''),
          evidence: { hasUid: Boolean(config.uid) },
        };
      } catch {
        return { ok: false, error: '微博文章账号配置无法解析' };
      }
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure(inspection?.error || "微博文章账号检查失败", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
        evidence: inspection?.evidence,
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const created = await js(String.raw`(async (input, account) => {
      const generateReqId = () => {
        const base64 = btoa(account.uid + '&' + Date.now())
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let value = base64;
        while (value.length < 43) value += chars[Math.floor(Math.random() * chars.length)];
        return value.slice(0, 43);
      };
      const createReqId = generateReqId();
      const createResponse = await fetch(
        'https://card.weibo.com/article/v5/aj/editor/draft/create?uid='
          + encodeURIComponent(account.uid) + '&_rid=' + encodeURIComponent(createReqId),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
            'SN-REQID': createReqId,
          },
          body: new URLSearchParams({}),
        },
      );
      const createBody = await createResponse.json().catch(() => ({}));
      const remoteId = String(createBody.data?.id || '');
      if (!createResponse.ok || String(createBody.code) !== '100000' || !remoteId) {
        return {
          ok: false,
          error: createBody.msg || '微博文章创建草稿失败',
          evidence: { status: createResponse.status, code: createBody.code },
        };
      }

      const saveReqId = generateReqId();
      const saveResponse = await fetch(
        'https://card.weibo.com/article/v5/aj/editor/draft/save?uid='
          + encodeURIComponent(account.uid) + '&id=' + encodeURIComponent(remoteId)
          + '&_rid=' + encodeURIComponent(saveReqId),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
            'SN-REQID': saveReqId,
          },
          body: new URLSearchParams({
            id: remoteId,
            title: input.title,
            subtitle: input.summary,
            type: '',
            status: '0',
            publish_at: '',
            error_msg: '',
            error_code: '0',
            collection: '[]',
            free_content: '',
            content: input.html.replace(/>\s+</g, '><'),
            cover: '',
            summary: input.summary,
            writer: '',
            extra: 'null',
            is_word: '0',
            article_recommend: '[]',
            follow_to_read: '1',
            isreward: '1',
            pay_setting: '{"ispay":0,"isvclub":0}',
            source: '0',
            action: '1',
            content_type: '0',
            save: '1',
          }),
        },
      );
      const saveBody = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || String(saveBody.code) !== '100000') {
        return {
          ok: false,
          error: saveBody.msg || '微博文章保存草稿失败',
          evidence: { status: saveResponse.status, code: saveBody.code, remoteId },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://card.weibo.com/article/v5/editor#/draft/' + encodeURIComponent(remoteId),
        evidence: {
          draftCreated: true,
          contentSaved: true,
          coverDeferred: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(created, "微博文章草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle);
        const idMatched = location.hash.includes('/draft/' + encodeURIComponent(expectedId));
        const loggedOut = /登录\/注册/.test(text) || /\/newlogin/.test(location.pathname);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("微博文章未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

registerArticleAdapter({
  platform: "zhihu",

  async inspect() {
    await openOrReuseTab("https://zhuanlan.zhihu.com/write", { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/验证码登录|密码登录|登录\/注册|打开知乎App/.test(text)
      || /www\.zhihu\.com\/signin/.test(String(current?.url || ""))) {
      throw articleFailure("知乎登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    return { ok: true, workspaceUrl: String(current?.url || "") };
  },

  async saveDraft({ input: articleInput }) {
    const created = await js(String.raw`(async (input) => {
      const fail = (error, evidence = {}) => ({ ok: false, error, evidence });
      const createResponse = await fetch('https://zhuanlan.zhihu.com/api/articles/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch',
        },
        body: JSON.stringify({ title: input.title, content: '', delta_time: 0 }),
      });
      const createText = await createResponse.text();
      if (!createResponse.ok) {
        return fail('知乎创建草稿失败', {
          status: createResponse.status,
          responsePrefix: createText.slice(0, 200),
        });
      }
      let createData = {};
      try {
        createData = JSON.parse(createText);
      } catch {
        return fail('知乎创建草稿响应无法解析', {
          status: createResponse.status,
          responsePrefix: createText.slice(0, 200),
        });
      }
      const remoteId = String(createData.id || '');
      if (!remoteId) return fail('知乎创建草稿响应缺少草稿 ID');

      const updateResponse = await fetch(
        'https://zhuanlan.zhihu.com/api/articles/' + encodeURIComponent(remoteId) + '/draft',
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-requested-with': 'fetch',
          },
          body: JSON.stringify({ title: input.title, content: input.html }),
        },
      );
      if (!updateResponse.ok) {
        const updateText = await updateResponse.text();
        return fail('知乎更新草稿失败', {
          status: updateResponse.status,
          responsePrefix: updateText.slice(0, 200),
          remoteId,
        });
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://zhuanlan.zhihu.com/p/' + encodeURIComponent(remoteId) + '/edit',
        evidence: {
          draftCreated: true,
          contentUpdated: true,
          coverDeferred: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(created, "知乎草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await wait(attempt === 0 ? 3 : 1);
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        const elements = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')];
        const values = elements.flatMap(element => [
          String(element.value || '').trim(),
          String(element.textContent || '').trim(),
        ]).filter(Boolean);
        const text = String(document.body?.innerText || '');
        const titleMatched = values.includes(expectedTitle);
        const idMatched = location.pathname.includes('/p/' + expectedId + '/edit');
        const loggedOut = /验证码登录|密码登录|登录\/注册/.test(text)
          || /\/signin/.test(location.pathname);
        return {
          verified: titleMatched && idMatched && !loggedOut,
          titleMatched,
          idMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) break;
    }
    if (verification?.verified !== true) {
      throw articleFailure("知乎未通过草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});

const ofweekDraftForm = Object.freeze({
  platformName: "维科网",
  workspaceUrl: "https://mp.ofweek.com/article/publish.html",
  loggedOutUrlPatterns: ["/index/login_member\\.html", "/user/ulogin"],
  loggedOutTextPatterns: ["账号密码登录", "手机快捷登录", "入驻维科号"],
  titleSelectors: [
    "input[name='title']",
    "#title",
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
  ],
  contentSelectors: [
    ".edui-body-container",
    "iframe[id*='editor']",
    "iframe[id*='ueditor']",
    ".ProseMirror",
    "[contenteditable='true']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "ofweek",

  async inspect() {
    return inspectBrowserDraftForm(ofweekDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: ofweekDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: ofweekDraftForm, articleInput, saved });
  },
});

const laohuDraftForm = Object.freeze({
  platformName: "老虎财经",
  workspaceUrl: "https://www.laohu8.com/",
  loggedOutUrlPatterns: ["/login", "/signin"],
  loggedOutTextPatterns: ["登录后可发布", "登录/注册", "手机号登录"],
  titleSelectors: [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
  ],
  contentSelectors: [
    ".ProseMirror",
    ".ql-editor",
    "[contenteditable='true'][data-placeholder*='正文']",
    "[contenteditable='true'][data-placeholder*='内容']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "postId", "post_id", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "laohu",

  async inspect() {
    return inspectBrowserDraftForm(laohuDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: laohuDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: laohuDraftForm, articleInput, saved });
  },
});

const futuDraftForm = Object.freeze({
  platformName: "富途牛牛",
  workspaceUrl: "https://www.futunn.com/",
  loggedOutUrlPatterns: ["/login", "/signin"],
  loggedOutTextPatterns: ["登录后发布", "登录/注册", "手机号登录"],
  titleSelectors: [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
  ],
  contentSelectors: [
    ".ProseMirror",
    ".ql-editor",
    "[contenteditable='true'][data-placeholder*='正文']",
    "[contenteditable='true'][data-placeholder*='内容']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "postId", "post_id", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "futu",

  async inspect() {
    return inspectBrowserDraftForm(futuDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: futuDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: futuDraftForm, articleInput, saved });
  },
});

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
    output({
      ok: true,
      status: "REMOTE_VERIFIED",
      verified: true,
      remoteId: saved.remoteId,
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
