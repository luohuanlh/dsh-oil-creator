const toutiaoWorkspaceUrl = "https://mp.toutiao.com/profile_v4/graphic/publish";

registerArticleAdapter({
  platform: "toutiao",

  async inspect() {
    await openOrReuseTab(toutiaoWorkspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/\/auth\/page\/login|\/login(?:\?|\/|$)/i.test(String(current?.url || ""))
      || /扫码登录|手机号登录|密码登录/.test(text)) {
      throw articleFailure("头条号登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    const inspection = await js(String.raw`(() => {
      void 'OIL_TOUTIAO_INSPECT';
      const title = document.querySelector('textarea[placeholder*="请输入文章标题"]');
      const editor = document.querySelector('.ProseMirror[contenteditable="true"]');
      const autosaveReady = String(document.body?.innerText || '').includes('草稿将自动保存')
        || String(document.body?.innerText || '').includes('草稿已保存');
      return {
        ok: Boolean(title && editor),
        titleReady: Boolean(title),
        editorReady: Boolean(editor),
        autosaveReady,
        url: location.href,
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("头条号自动保存编辑器尚未就绪", {
        evidence: { ...inspection, url: publicDraftUrl(inspection?.url) },
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput }) {
    const saved = await js(String.raw`(async (input) => {
      void 'OIL_TOUTIAO_SAVE';
      const title = document.querySelector('textarea[placeholder*="请输入文章标题"]');
      const editor = document.querySelector('.ProseMirror[contenteditable="true"]');
      if (!title || !editor) return { ok: false, error: '头条号草稿编辑器已离开当前页面' };

      const normalizedText = element => String(
        element?.innerText || element?.textContent || element?.value || ''
      ).replace(/\s+/g, ' ').trim();
      const dispatchChange = element => {
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: null,
        }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      };

      let saveResponse;
      let draftRequestVerified = false;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__oilToutiaoUrl = url;
        return originalOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        const request = this;
        request.addEventListener('load', () => {
          if (!/\/mp\/agw\/article\/publish(?:\?|$)/i.test(String(request.__oilToutiaoUrl || ''))
            || !/(?:^|&)save=0(?:&|$)/.test(String(body || ''))) return;
          try {
            const parsed = JSON.parse(request.responseText);
            if (Number(parsed?.code) === 0 && parsed?.data?.pgc_id) {
              saveResponse = parsed;
              draftRequestVerified = true;
            }
          } catch {
            saveResponse = undefined;
          }
        });
        return originalSend.apply(this, arguments);
      };

      try {
        const exclusive = [...document.querySelectorAll('input[type="checkbox"]')]
          .find(element => normalizedText(element.parentElement?.parentElement) === '头条首发');
        if (exclusive?.checked) exclusive.click();

        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(title, input.title);
        else title.value = input.title;
        dispatchChange(title);
        editor.innerHTML = input.html;
        dispatchChange(editor);

        let coverButton;
        for (let attempt = 0; attempt < 40 && !coverButton; attempt += 1) {
          coverButton = document.querySelector('.article-cover-add');
          if (!coverButton) await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!coverButton) return { ok: false, error: '头条号未找到单图封面上传控件' };
        const singleCover = document.querySelector('.article-cover-radio-group input[value="2"]');
        if (singleCover && !singleCover.checked) singleCover.click();
        coverButton.click();

        let fileInput;
        for (let attempt = 0; attempt < 40 && !fileInput; attempt += 1) {
          fileInput = [...document.querySelectorAll('.byte-drawer input[type="file"]')]
            .find(element => String(element.accept || '').includes('image'));
          if (!fileInput) await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!fileInput) return { ok: false, error: '头条号封面文件选择器尚未就绪' };
        const binary = atob(input.coverBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const extension = input.coverMime === 'image/png' ? 'png'
          : input.coverMime === 'image/webp' ? 'webp' : 'jpg';
        const transfer = new DataTransfer();
        transfer.items.add(new File(
          [bytes],
          'oil-cover.' + extension,
          { type: input.coverMime }
        ));
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        let confirm;
        for (let attempt = 0; attempt < 80 && !confirm; attempt += 1) {
          const drawer = [...document.querySelectorAll('.byte-drawer')]
            .find(element => element.offsetParent);
          const uploaded = normalizedText(drawer).includes('已上传 1 张图片')
            && [...(drawer?.querySelectorAll('img[src]') || [])]
              .some(image => image.naturalWidth > 0);
          const candidate = [...(drawer?.querySelectorAll('button') || [])]
            .find(element => normalizedText(element) === '确定' && !element.disabled);
          if (uploaded && candidate) confirm = candidate;
          if (!confirm) await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!confirm) return { ok: false, error: '头条号封面上传未返回可确认的图片' };
        confirm.click();

        for (let attempt = 0; attempt < 100; attempt += 1) {
          const covers = String(saveResponse?.data?.pgc_feed_covers || '');
          if (saveResponse?.data?.pgc_id && covers !== '' && covers !== '[]') break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      } finally {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      }

      const remoteId = String(saveResponse?.data?.pgc_id || '');
      const covers = String(saveResponse?.data?.pgc_feed_covers || '');
      const exclusive = [...document.querySelectorAll('input[type="checkbox"]')]
        .find(element => normalizedText(element.parentElement?.parentElement) === '头条首发');
      if (!remoteId || covers === '' || covers === '[]' || exclusive?.checked) {
        return {
          ok: false,
          status: 'REMOTE_UNVERIFIED',
          exitCode: 4,
          error: '头条号自动保存未返回完整的草稿 ID、封面或非首发证据',
          evidence: {
            remoteIdReturned: Boolean(remoteId),
            coverReturned: covers !== '' && covers !== '[]',
            exclusiveDisabled: exclusive?.checked === false,
            finalPublishBlocked: true,
          },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: location.origin + '/profile_v4/graphic/publish?pgc_id='
          + encodeURIComponent(remoteId),
        evidence: {
          autosaveEndpointObserved: '/mp/agw/article/publish',
          draftRequestVerified,
          saveFlag: 0,
          coverUploaded: true,
          exclusiveDisabled: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(saved, "头条号自动保存草稿失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(4);
    const verification = await js(String.raw`(async (expectedTitle, expectedId) => {
      void 'OIL_TOUTIAO_VERIFY';
      const title = String(
        document.querySelector('textarea[placeholder*="请输入文章标题"]')?.value || ''
      ).trim();
      let listedDraft;
      let listError = '';
      for (let attempt = 0; attempt < 12 && !listedDraft; attempt += 1) {
        try {
          const response = await fetch(
            '/mp/agw/creator_center/draft_list?type=2&count=50&app_id=1231'
          );
          const payload = await response.json();
          listedDraft = (payload?.draft_list || [])
            .find(item => String(item?.gid || '') === expectedId);
          listError = '';
        } catch (cause) {
          listError = cause instanceof Error ? cause.message : String(cause || '');
        }
        if (!listedDraft) await new Promise(resolve => setTimeout(resolve, 500));
      }
      let graphic = {};
      try {
        graphic = JSON.parse(String(listedDraft?.graphic_extra || '{}'));
      } catch {
        graphic = {};
      }
      let covers = [];
      try {
        covers = JSON.parse(String(graphic?.pgc_feed_covers || '[]'));
      } catch {
        covers = [];
      }
      const idMatched = new URL(location.href).searchParams.get('pgc_id') === expectedId
        && String(graphic?.pgc_id || '') === expectedId;
      const titleMatched = title === expectedTitle && listedDraft?.title === expectedTitle;
      const draftMatched = graphic?.is_draft === true
        && String(graphic?.status_desc || '') === '草稿';
      const coverMatched = Array.isArray(covers) && covers.length > 0;
      const exclusiveDisabled = graphic?.is_exclusive === false
        && String(graphic?.claim_exclusive || '') === '0';
      const loggedOut = /\/auth\/page\/login|\/login(?:\?|\/|$)/i.test(location.href);
      return {
        verified: idMatched && titleMatched && draftMatched && coverMatched
          && exclusiveDisabled && !loggedOut,
        idMatched,
        titleMatched,
        draftMatched,
        coverMatched,
        exclusiveDisabled,
        loggedOut,
        listError,
        url: location.href,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("头条号未通过草稿列表与编辑页回读验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});
