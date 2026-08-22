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

    const inspection = await js(String.raw`/* OIL_NETEASE_INSPECT */ (async () => {
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
    const saved = await js(String.raw`/* OIL_NETEASE_SAVE */ (async (input, account) => {
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
    const verification = await js(String.raw`/* OIL_NETEASE_VERIFY */ (async (expectedTitle, account, expectedId) => {
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
