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
