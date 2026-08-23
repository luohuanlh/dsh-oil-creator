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
