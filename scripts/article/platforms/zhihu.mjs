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
