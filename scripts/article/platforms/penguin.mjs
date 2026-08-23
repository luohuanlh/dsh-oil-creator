const penguinDraftForm = Object.freeze({
  platformName: "企鹅号",
  workspaceUrl: "https://om.qq.com/main/creation/article",
  loggedOutUrlPatterns: ["/userAuth/", "/userAuth\\b"],
  loggedOutTextPatterns: ["QQ登录", "微信登录", "立即登录"],
  titleSelectors: [
    ".omui-articletitle__title1 .omui-inputautogrowing__inner",
    "[class*='articletitle'] [contenteditable='true']",
    "input[placeholder*='标题']",
  ],
  contentSelectors: [".ProseMirror", "[contenteditable='true'].ProseMirror"],
});

registerArticleAdapter({
  platform: "penguin",

  async inspect() {
    return inspectBrowserDraftForm(penguinDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    const saved = await js(String.raw`(async (input, inspected) => {
      void 'OIL_PENGUIN_SAVE';
      const titleElement = document.querySelector(inspected.titleSelector);
      const contentElement = document.querySelector(inspected.contentSelector);
      if (!titleElement || !contentElement) {
        return { ok: false, error: '企鹅号草稿编辑器已离开当前页面' };
      }

      const dispatchChange = element => {
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: null,
        }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      if (titleElement.matches('input,textarea')) {
        const prototype = titleElement.matches('textarea')
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(titleElement, input.title);
        else titleElement.value = input.title;
      } else {
        titleElement.textContent = input.title;
      }
      dispatchChange(titleElement);
      contentElement.innerHTML = input.html;
      dispatchChange(contentElement);
      await new Promise(resolve => setTimeout(resolve, 800));

      const normalizedText = element => String(
        element?.innerText || element?.textContent || element?.value || ''
      ).replace(/\s+/g, ' ').trim();
      const findCoverSection = () => {
        const label = [...document.querySelectorAll('*')].find(element =>
          [...element.childNodes].some(node =>
            node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '封面'
          )
        );
        let section = label;
        while (section && !(normalizedText(section).includes('单图')
          && normalizedText(section).includes('三图'))) {
          section = section.parentElement;
        }
        return section;
      };
      const coverSection = findCoverSection();
      const singleCover = [...(coverSection?.querySelectorAll('label') || [])]
        .find(element => normalizedText(element) === '单图')
        ?.querySelector('input[type="radio"]');
      if (singleCover && !singleCover.checked) singleCover.click();
      const coverButton = coverSection?.querySelector('button');
      if (!coverButton) return { ok: false, error: '企鹅号未找到封面上传控件' };
      coverButton.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      const localUploadTab = [...document.querySelectorAll('li')]
        .find(element => normalizedText(element) === '本地上传');
      if (!localUploadTab) return { ok: false, error: '企鹅号封面弹窗缺少“本地上传”入口' };
      localUploadTab.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      const fileInput = [...document.querySelectorAll('input[type="file"]')]
        .find(element => String(element.accept || '').includes('image'));
      if (!fileInput) return { ok: false, error: '企鹅号封面文件选择器尚未就绪' };
      const binary = atob(input.coverBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      let coverMime = input.coverMime;
      let coverBlob = new Blob([bytes], { type: coverMime });
      if (coverMime === 'image/webp') {
        const bitmap = await createImageBitmap(coverBlob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        coverBlob = await new Promise((resolve, reject) => canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('企鹅号 WebP 封面转换失败')),
          'image/png'
        ));
        coverMime = 'image/png';
      }
      const extension = coverMime === 'image/png' ? 'png' : 'jpg';
      const transfer = new DataTransfer();
      transfer.items.add(new File([coverBlob], 'oil-cover.' + extension, { type: coverMime }));
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      let coverConfirm;
      for (let attempt = 0; attempt < 60 && !coverConfirm; attempt += 1) {
        const candidate = [...document.querySelectorAll('button')]
          .find(element => normalizedText(element) === '确认' && !element.disabled);
        let dialog = candidate?.parentElement;
        for (let depth = 0; dialog && depth < 8
          && !normalizedText(dialog).includes('本地上传'); depth += 1) {
          dialog = dialog.parentElement;
        }
        const previewReady = [...(dialog?.querySelectorAll('img[src]') || [])]
          .some(image => image.naturalWidth > 0);
        if (candidate && previewReady) coverConfirm = candidate;
        if (!coverConfirm) await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!coverConfirm) return { ok: false, error: '企鹅号封面上传缺少确认控件' };
      coverConfirm.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      const appliedCover = findCoverSection();
      if (!appliedCover?.querySelector('img') && !normalizedText(appliedCover).includes('更换')) {
        return { ok: false, error: '企鹅号封面上传未生效' };
      }

      const declarationSelected = () => String(document.body?.innerText || '')
        .includes('作者声明：无需标注');
      if (!declarationSelected()) {
        const declarationButton = [...document.querySelectorAll('button,[role="button"]')]
          .find(element => normalizedText(element) === '添加内容自主声明');
        if (!declarationButton) {
          return { ok: false, error: '企鹅号未找到“添加内容自主声明”控件' };
        }
        declarationButton.click();
        await new Promise(resolve => setTimeout(resolve, 300));
        const declarationLabel = [...document.querySelectorAll('label')]
          .find(element => normalizedText(element) === '无需标注');
        const declarationRadio = declarationLabel?.querySelector('input[type="radio"]');
        if (!declarationRadio) {
          return { ok: false, error: '企鹅号自主声明中未找到“无需标注”选项' };
        }
        declarationRadio.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const confirmButton = [...document.querySelectorAll('button')]
          .find(element => normalizedText(element) === '确认');
        if (!confirmButton) {
          return { ok: false, error: '企鹅号自主声明缺少确认控件' };
        }
        confirmButton.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (!declarationSelected()) {
        return { ok: false, error: '企鹅号自主声明“无需标注”未生效' };
      }

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      let saveResponse;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__oilPenguinMethod = method;
        this.__oilPenguinUrl = url;
        return originalOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        const request = this;
        request.addEventListener('load', () => {
          if (!/\/marticlepublish\/omSave(?:\?|$)/i.test(String(request.__oilPenguinUrl || ''))) {
            return;
          }
          try {
            const parsed = JSON.parse(request.responseText);
            if (Number(parsed?.response?.code) === 0 && parsed?.data?.articleId) {
              saveResponse = parsed;
            }
          } catch {
            saveResponse = undefined;
          }
        });
        return originalSend.apply(this, arguments);
      };

      try {
        const saveButton = [...document.querySelectorAll('button')]
          .find(element => normalizedText(element) === '存草稿');
        if (!saveButton) return { ok: false, error: '企鹅号未找到“存草稿”控件' };
        saveButton.click();
        for (let attempt = 0; attempt < 80 && !saveResponse; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } finally {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      }

      const remoteId = String(saveResponse?.data?.articleId || '');
      if (!remoteId) {
        return {
          ok: false,
          status: 'REMOTE_UNVERIFIED',
          exitCode: 4,
          error: '企鹅号未返回可验证的正式草稿 ID',
          evidence: { declaration: '无需标注', finalPublishBlocked: true },
        };
      }
      return {
        ok: true,
        remoteId,
        draftUrl: location.origin + '/main/creation/article?articleId=' + encodeURIComponent(remoteId),
        evidence: {
          endpoint: '/marticlepublish/omSave',
          coverUploaded: true,
          declaration: '无需标注',
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)}, ${JSON.stringify(inspection)})`);
    return assertSaved(saved, "企鹅号草稿保存失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(3);
    const verification = await js(String.raw`(async (expectedTitle, expectedId) => {
      void 'OIL_PENGUIN_VERIFY';
      const titleElement = document.querySelector(
        '.omui-articletitle__title1 .omui-inputautogrowing__inner'
      ) || document.querySelector("[class*='articletitle'] [contenteditable='true']")
        || document.querySelector("input[placeholder*='标题']");
      const title = String(titleElement?.value || titleElement?.textContent || '').trim();
      const url = location.href;
      const idMatched = new URL(url).searchParams.get('articleId') === expectedId;
      let listedDraft;
      let listError = '';
      for (let attempt = 0; attempt < 12 && !listedDraft; attempt += 1) {
        try {
          const response = await fetch(
            '/marticle/article/list?category=&search=&source=&startDate=&endDate=&num=50'
            + '&ftype=&readChannel=all&dstChannel=&isPartDst=0&isQBQA=false'
            + '&refreshField=&relogin=1'
          );
          const payload = await response.json();
          listedDraft = (payload?.data?.articles || [])
            .find(article => String(article?.article_id || '') === expectedId);
          listError = '';
        } catch (cause) {
          listError = cause instanceof Error ? cause.message : String(cause || '');
        }
        if (!listedDraft) await new Promise(resolve => setTimeout(resolve, 500));
      }
      let declaration = '';
      try {
        declaration = JSON.parse(String(listedDraft?.self_declare || '{}'))?.desc || '';
      } catch {
        declaration = '';
      }
      const listTitleMatched = String(listedDraft?.title || '') === expectedTitle;
      const coverMatched = Array.isArray(listedDraft?.cover_pics)
        && listedDraft.cover_pics.length > 0;
      const declarationMatched = declaration === '作者声明：无需标注';
      const draftStatusMatched = String(listedDraft?.status || '') === '0';
      const loggedOut = /\/userAuth(?:\/|\b)/i.test(url);
      return {
        verified: title === expectedTitle && idMatched && listTitleMatched
          && coverMatched && declarationMatched && draftStatusMatched && !loggedOut,
        titleMatched: title === expectedTitle,
        idMatched,
        listTitleMatched,
        coverMatched,
        declarationMatched,
        draftStatusMatched,
        loggedOut,
        listError,
        url,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.remoteId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("企鹅号未通过正式草稿页面验证", {
        status: "REMOTE_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});
