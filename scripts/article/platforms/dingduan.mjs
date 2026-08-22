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

    const inspection = await js(String.raw`/* OIL_DINGDUAN_INSPECT */ (async () => {
      const findAxios = () => {
        const root = document.querySelector('#app')?.__vue__;
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
    const saved = await js(String.raw`/* OIL_DINGDUAN_SAVE */ (async (input) => {
      const root = document.querySelector('#app')?.__vue__;
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
          'https://resource.topnews.cn/api/draft/search?type=1&page=1&size=20&title='
            + encodeURIComponent(input.title)
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
    const verification = await js(String.raw`/* OIL_DINGDUAN_VERIFY */ (async (expectedTitle, expectedId) => {
      const root = document.querySelector('#app')?.__vue__;
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
