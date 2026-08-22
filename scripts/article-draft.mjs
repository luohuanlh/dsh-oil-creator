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
        draftUrl: 'https://mp.xueqiu.com/write/draft/' + encodeURIComponent(remoteId),
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
        const idMatched = location.pathname.endsWith('/write/draft/' + expectedId);
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
        const response = await fetch(
          'https://emfront.eastmoney.com/apifront/Tran/GetData?platform=',
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageUrl,
              path: 'draft/api/Article/SaveDraft',
              parm: JSON.stringify(parm),
            }),
          },
        );
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
          tokenTransportRemoteUnverified: true,
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
