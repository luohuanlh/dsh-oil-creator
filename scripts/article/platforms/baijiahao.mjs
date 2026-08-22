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
