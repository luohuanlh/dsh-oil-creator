const xiaohongshuNoteWorkspaceUrl =
  "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image";

registerArticleAdapter({
  platform: "xiaohongshu-note",

  async inspect() {
    await openOrReuseTab(xiaohongshuNoteWorkspaceUrl, { wait: true, timeout: 30 });
    await wait(2);
    const current = await pageInfo();
    const text = await snapshotText();
    if (/\/login(?:\?|\/|$)/i.test(String(current?.url || ""))
      || /扫码登录|手机号登录|登录后继续/.test(text)) {
      throw articleFailure("小红书图文笔记登录态已失效，请在 Ego Browser 完成登录后重试", {
        status: "BLOCKED_AUTH",
        exitCode: 2,
      });
    }
    const inspection = await js(String.raw`(async () => {
      void 'OIL_XHS_NOTE_INSPECT';
      const upload = document.querySelector('input.upload-input[type="file"]');
      const databases = typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
      let draftIds = [];
      if (databases.some(database => database.name === 'draft-database-v1')) {
        try {
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('draft-database-v1');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (database.objectStoreNames.contains('image-draft')) {
            const drafts = await new Promise((resolve, reject) => {
              const transaction = database.transaction('image-draft', 'readonly');
              const request = transaction.objectStore('image-draft').getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            draftIds = drafts.map(draft => String(draft?.draftId || '')).filter(Boolean);
          }
          database.close();
        } catch {
          draftIds = [];
        }
      }
      return {
        ok: Boolean(upload) && String(document.body?.innerText || '').includes('上传图文'),
        uploadReady: Boolean(upload),
        draftIds,
        url: location.href,
      };
    })()`);
    if (inspection?.ok !== true) {
      throw articleFailure("小红书图文笔记上传页尚未就绪", {
        evidence: { ...inspection, url: publicDraftUrl(inspection?.url) },
      });
    }
    return inspection;
  },

  async saveDraft({ input: articleInput, inspection }) {
    const filled = await js(String.raw`(async (input) => {
      void 'OIL_XHS_NOTE_FILL';
      const fileInput = document.querySelector('input.upload-input[type="file"]');
      if (!fileInput) return { ok: false, error: '小红书图文笔记上传控件已离开当前页面' };
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

      let title;
      let editor;
      for (let attempt = 0; attempt < 100 && (!title || !editor); attempt += 1) {
        title = document.querySelector('input[placeholder="填写标题会有更多赞哦"]');
        editor = document.querySelector('.tiptap.ProseMirror[contenteditable="true"]');
        if (!title || !editor) await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!title || !editor) {
        return { ok: false, error: '小红书上传图片后未进入图文笔记编辑器' };
      }

      const container = document.createElement('div');
      container.innerHTML = input.html;
      const articleText = String(container.innerText || container.textContent || '')
        .replace(/\n{3,}/g, '\n\n').trim();
      const tagText = input.tags.map(tag => '#' + String(tag).replace(/^#+/, '').trim())
        .filter(tag => tag.length > 1).join(' ');
      const noteText = [articleText, tagText].filter(Boolean).join('\n\n');
      if (input.title.length > 20) {
        return { ok: false, error: '小红书图文笔记标题超过 20 字' };
      }
      if (noteText.length > 1000) {
        return { ok: false, error: '小红书图文笔记正文与标签合计超过 1000 字' };
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(title, input.title);
      else title.value = input.title;
      title.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: input.title,
      }));
      title.dispatchEvent(new Event('change', { bubbles: true }));
      editor.innerHTML = noteText.split(/\n{2,}/).map(block =>
        '<p>' + block.split('\n').map(line => line
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('<br>') + '</p>'
      ).join('');
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: null,
      }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.dispatchEvent(new Event('blur', { bubbles: true }));
      return {
        ok: true,
        expectedBody: noteText,
        titleMatched: title.value === input.title,
        bodyMatched: String(editor.innerText || '').includes(articleText.slice(0, 40)),
      };
    })(${JSON.stringify(articleInput)})`);
    if (filled?.ok !== true || filled.titleMatched !== true || filled.bodyMatched !== true) {
      throw articleFailure(filled?.error || "小红书图文笔记字段填写失败", {
        evidence: filled,
      });
    }

    await wait(3);
    await cdp("DOM.enable");
    const accessibility = await cdp("Accessibility.getFullAXTree");
    const saveButton = accessibility?.nodes?.find(node =>
      node?.role?.value === "button" && node?.name?.value === "暂存离开"
    );
    if (!saveButton?.backendDOMNodeId) {
      throw articleFailure("小红书图文笔记未找到“暂存离开”安全控件");
    }
    const box = await cdp("DOM.getBoxModel", {
      backendNodeId: saveButton.backendDOMNodeId,
    });
    const quad = box?.model?.content;
    if (!Array.isArray(quad) || quad.length < 8) {
      throw articleFailure("小红书图文笔记“暂存离开”控件不可点击");
    }
    const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await wait(6);

    const saved = await js(String.raw`(async (expectedTitle, expectedBody, previousIds) => {
      void 'OIL_XHS_NOTE_SAVED';
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('draft-database-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!database.objectStoreNames.contains('image-draft')) {
        database.close();
        return { ok: false, error: '小红书本地草稿库缺少 image-draft' };
      }
      const drafts = await new Promise((resolve, reject) => {
        const transaction = database.transaction('image-draft', 'readonly');
        const request = transaction.objectStore('image-draft').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const matched = drafts
        .filter(draft => String(draft?.content?.draftStore?.title || '') === expectedTitle)
        .sort((left, right) => Number(right?.timeStamp || 0) - Number(left?.timeStamp || 0))
        .find(draft => !previousIds.includes(String(draft?.draftId || '')))
        || drafts
          .filter(draft => String(draft?.content?.draftStore?.title || '') === expectedTitle)
          .sort((left, right) => Number(right?.timeStamp || 0) - Number(left?.timeStamp || 0))[0];
      const localDraftId = String(matched?.draftId || '');
      const draftBody = String(matched?.content?.draftStore?.desc || '');
      const imageFileIds = (matched?.content?.draftStore?.imgList || [])
        .map(image => String(image?.fileId || '')).filter(Boolean);
      const titleMatched = String(matched?.content?.draftStore?.title || '') === expectedTitle;
      const bodyMatched = expectedBody.split(/\s+/).filter(Boolean).slice(0, 6)
        .every(part => draftBody.includes(part));
      const localNotice = String(document.body?.innerText || '')
        .includes('草稿存储于当前使用的浏览器本地');
      return {
        ok: Boolean(localDraftId) && titleMatched && bodyMatched
          && imageFileIds.length > 0 && localNotice,
        localDraftId,
        titleMatched,
        bodyMatched,
        imageStored: imageFileIds.length > 0,
        localNotice,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(filled.expectedBody)}, ${JSON.stringify(inspection.draftIds || [])})`);
    if (saved?.ok !== true || !saved.localDraftId) {
      throw articleFailure("小红书图文笔记未写入可回读的浏览器本地草稿", {
        status: "LOCAL_UNVERIFIED",
        exitCode: 4,
        evidence: saved,
      });
    }
    return assertSaved({
      ok: true,
      localDraftId: saved.localDraftId,
      draftReceipt: `xiaohongshu-note:browser-local:${saved.localDraftId}`,
      draftStorage: "browser-local",
      draftUrl: xiaohongshuNoteWorkspaceUrl,
      evidence: {
        indexedDb: "draft-database-v1/image-draft",
        imageStored: true,
        localNoticeVerified: true,
        finalPublishBlocked: true,
      },
    }, "小红书图文笔记本地草稿保存失败");
  },

  async verify({ input: articleInput, saved }) {
    const verification = await js(String.raw`(async (expectedTitle, expectedId) => {
      void 'OIL_XHS_NOTE_VERIFY';
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('draft-database-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const draft = await new Promise((resolve, reject) => {
        const transaction = database.transaction('image-draft', 'readonly');
        const request = transaction.objectStore('image-draft').get(expectedId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const titleMatched = String(draft?.content?.draftStore?.title || '') === expectedTitle;
      const imageMatched = (draft?.content?.draftStore?.imgList || [])
        .some(image => String(image?.fileId || '') !== '');
      const cardMatched = String(document.body?.innerText || '').includes(expectedTitle);
      const localNotice = String(document.body?.innerText || '')
        .includes('草稿存储于当前使用的浏览器本地');
      return {
        verified: titleMatched && imageMatched && cardMatched && localNotice,
        titleMatched,
        imageMatched,
        cardMatched,
        localNotice,
        url: location.href,
      };
    })(${JSON.stringify(articleInput.title)}, ${JSON.stringify(saved.localDraftId)})`);
    if (verification?.verified !== true) {
      throw articleFailure("小红书图文笔记未通过浏览器本地草稿回读验证", {
        status: "LOCAL_UNVERIFIED",
        exitCode: 4,
        evidence: { ...verification, url: publicDraftUrl(verification?.url) },
      });
    }
    return verification;
  },
});
