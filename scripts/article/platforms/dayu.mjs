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
