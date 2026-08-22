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

    const inspection = await js(String.raw`/* OIL_YIDIAN_INSPECT */ (() => {
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
    const saved = await js(String.raw`/* OIL_YIDIAN_SAVE */ (async (input) => {
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
      verification = await js(String.raw`/* OIL_YIDIAN_VERIFY */ ((expectedTitle, expectedId) => {
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
