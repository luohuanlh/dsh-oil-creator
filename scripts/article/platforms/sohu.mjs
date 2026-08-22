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
