const jqkaEditorUrl = "https://mp.10jqka.com.cn/creation-editor/editor/";

registerArticleAdapter({
  platform: "10jqka",

  async inspect() {
    await openOrReuseTab(jqkaEditorUrl, { wait: true, timeout: 30 });
    let inspection;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(attempt === 0 ? 2 : 1);
      const current = await pageInfo();
      const text = await snapshotText();
      if (/upass\.10jqka\.com\.cn|\/login(?:\?|\/|$)/i.test(String(current?.url || ""))
        || /手机号登录|账号登录|未登录|请先登录/.test(text)) {
        throw articleFailure("同顺号登录态已失效，请在 Ego Browser 完成登录后重试", {
          status: "BLOCKED_AUTH",
          exitCode: 2,
          evidence: { url: publicDraftUrl(current?.url) },
        });
      }
      inspection = await js(String.raw`(() => {
        void 'OIL_JQKA_INSPECT';
        const title = document.querySelector('textarea[placeholder="请输入标题（至少5个字）"]');
        const editor = document.querySelector('[data-slate-editor="true"][contenteditable="true"]');
        const draftReady = String(document.body?.innerText || '').includes('草稿将自动保存');
        return { ok: Boolean(title && editor && draftReady), url: location.href };
      })()`);
      if (inspection?.ok === true) return inspection;
    }
    throw articleFailure("同顺号当前页面未找到已验证的文章草稿编辑器", {
      evidence: { ...inspection, url: publicDraftUrl(inspection?.url) },
    });
  },

  async saveDraft({ input: articleInput }) {
    const expression = String.raw`(async (input) => {
      void 'OIL_JQKA_SAVE';
      const title = String(input.title || '').trim();
      const summary = String(input.summary || '').trim();
      const content = String(input.html || '').trim();
      const scratch = document.createElement('div');
      scratch.innerHTML = content;
      if (title.length < 5 || title.length > 60) {
        return { ok: false, error: '同顺号文章标题必须为 5-60 个字' };
      }
      if (summary.length > 120) {
        return { ok: false, error: '同顺号文章摘要不能超过 120 个字' };
      }
      if (!String(scratch.textContent || '').trim()) {
        return { ok: false, error: '同顺号文章正文不能为空' };
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(input.coverMime)
        || !String(input.coverBase64 || '')) {
        return { ok: false, error: '同顺号缺少可上传的文章封面' };
      }
      // 官方编辑器将选定图片临时压缩为 JPEG 后上传；本地原图不变。
      const sourceImage = new Image();
      const imageReady = new Promise((resolve, reject) => {
        sourceImage.onload = resolve;
        sourceImage.onerror = reject;
      });
      sourceImage.src = 'data:' + input.coverMime + ';base64,' + input.coverBase64;
      try {
        await imageReady;
      } catch {
        return { ok: false, error: '同顺号文章封面无法解码' };
      }
      const scale = Math.min(1, 1920 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return { ok: false, error: '同顺号文章封面处理不可用' };
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
      let coverDataUrl = '';
      for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
        coverDataUrl = canvas.toDataURL('image/jpeg', quality);
        if ((coverDataUrl.length - coverDataUrl.indexOf(',') - 1) * 0.75 <= 4 * 1024 * 1024) break;
      }
      if ((coverDataUrl.length - coverDataUrl.indexOf(',') - 1) * 0.75 > 4 * 1024 * 1024) {
        return { ok: false, error: '同顺号封面压缩后仍超过 4 MB' };
      }
      const form = new FormData();
      const fields = {
        appName: 'sns', appCode: '0', thumb: '1', cut: '0', x: '0', y: '0',
        cutwidth: '0', cutheight: '0', water: '0', waterType: '0',
        uploadType: 'base64', base64str: coverDataUrl,
      };
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      const uploadResponse = await fetch('/newupload/base64upload/', {
        method: 'POST', credentials: 'include', body: form,
      });
      const uploadBody = await uploadResponse.json().catch(() => ({}));
      const coverUrl = String(uploadBody.result?.url || '').replace(/^http:/, 'https:');
      if (!uploadResponse.ok || Number(uploadBody.errorCode) !== 0
        || !/^https:\/\/u\.thsi\.cn\//i.test(coverUrl)) {
        return {
          ok: false,
          status: [401, 403].includes(uploadResponse.status) ? 'BLOCKED_AUTH' : 'BLOCKED_PLATFORM',
          exitCode: [401, 403].includes(uploadResponse.status) ? 2 : 3,
          error: uploadBody.errorMsg || '同顺号文章封面上传失败',
          evidence: { coverUploaded: false, status: uploadResponse.status },
        };
      }
      const response = await fetch('/lgt/article_publish/auth/api/draft/v1/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, content, summary, close_comment: 0, covers: [coverUrl],
          info_source: JSON.stringify({ none: {} }), is_original: 0,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const remoteId = String(body.data || '').trim();
      if (!response.ok || !remoteId) {
        return {
          ok: false,
          status: [401, 403].includes(response.status) ? 'BLOCKED_AUTH' : 'BLOCKED_PLATFORM',
          exitCode: [401, 403].includes(response.status) ? 2 : 3,
          error: body.errorMsg || body.msg || '同顺号保存草稿失败',
          evidence: { coverUploaded: true, status: response.status },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: 'https://mp.10jqka.com.cn/creation-editor/editor/?draftId='
          + encodeURIComponent(remoteId),
        evidence: {
          saveEndpoint: '/lgt/article_publish/auth/api/draft/v1/save',
          coverUploaded: true, coverUrl, originalDisabled: true, finalPublishBlocked: true,
        },
      };
    })`;
    const saved = await js(expression + '(' + JSON.stringify(articleInput) + ')');
    return assertSaved(saved, "同顺号草稿创建失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    let verification;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await wait(attempt === 0 ? 2 : 1);
      const expression = String.raw`(async (expectedTitle, expectedSummary, expectedHtml, expectedId, coverUrl) => {
        void 'OIL_JQKA_VERIFY';
        const title = String(
          document.querySelector('textarea[placeholder="请输入标题（至少5个字）"]')?.value || ''
        ).trim();
        const editor = document.querySelector('[data-slate-editor="true"][contenteditable="true"]');
        if (!title || !editor) return { verified: false, editorReady: false, url: location.href };
        const response = await fetch('/lgt/article_publish/auth/api/draft/v1/detail'
          + '?draft_id=' + encodeURIComponent(expectedId), {
            credentials: 'include', cache: 'no-store',
          });
        const body = await response.json().catch(() => ({}));
        const record = body.data || {};
        const compact = value => String(value || '').replace(/\s+/g, '');
        const scratch = document.createElement('div');
        scratch.innerHTML = expectedHtml;
        const remoteBody = document.createElement('div');
        remoteBody.innerHTML = String(record.content || '');
        const idMatched = new URL(location.href).searchParams.get('draftId') === expectedId
          && String(record.draft_id || '') === expectedId;
        const titleMatched = title === expectedTitle && record.title === expectedTitle;
        const summaryMatched = String(record.summary || '').trim() === expectedSummary;
        const bodyMatched = compact(remoteBody.textContent) === compact(scratch.textContent)
          && compact(editor.innerText) === compact(scratch.textContent);
        const coverMatched = Array.isArray(record.covers)
          && record.covers.includes(coverUrl);
        const draftMatched = Number(record.draft_status) === 0
          && record.draft_status_desc === '草稿';
        const rightsSafe = Number(record.is_original) === 0
          && String(record.info_source || '') === JSON.stringify({ none: {} });
        const loggedOut = /upass\.10jqka\.com\.cn|\/login(?:\?|\/|$)/i.test(location.href);
        return {
          verified: response.ok && idMatched && titleMatched && summaryMatched
            && bodyMatched && coverMatched && draftMatched && rightsSafe && !loggedOut,
          editorReady: true, idMatched, titleMatched, summaryMatched, bodyMatched,
          coverMatched, draftMatched, rightsSafe, loggedOut, url: location.href,
        };
      })`;
      verification = await js(expression + '(' + [
        articleInput.title.trim(), articleInput.summary.trim(), articleInput.html,
        saved.remoteId, saved.evidence.coverUrl,
      ].map(JSON.stringify).join(',') + ')');
      if (verification?.verified === true) return verification;
    }
    throw articleFailure("同顺号未通过草稿详情与编辑页回读验证", {
      status: "REMOTE_UNVERIFIED",
      exitCode: 4,
      evidence: { ...verification, url: publicDraftUrl(verification?.url) },
    });
  },
});
