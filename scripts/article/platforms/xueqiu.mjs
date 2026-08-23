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
