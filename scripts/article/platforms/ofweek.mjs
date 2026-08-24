const ofweekWorkspaceUrl = "https://mp.ofweek.com/article/publish.html";

registerArticleAdapter({
  platform: "ofweek",

  async inspect() {
    const existing = await pageInfo().catch(() => undefined);
    if (String(existing?.url || "") !== ofweekWorkspaceUrl) {
      await openOrReuseTab(ofweekWorkspaceUrl, { wait: true, timeout: 30 });
    }

    let current;
    let text = "";
    let inspection;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await wait(attempt === 0 ? 2 : 1);
      current = await pageInfo();
      text = await snapshotText();
      inspection = await js(String.raw`(() => {
        void 'OIL_OFWEEK_INSPECT';
        const editor = window.tinymce?.activeEditor;
        const title = document.querySelector('input[name="title"]');
        const keywords = document.querySelector('input[name="keywords"]');
        const trade = document.querySelector('select[name="trade_id"]');
        const draft = document.querySelector('#draf');
        return {
          ok: Boolean(title && keywords && trade && editor && draft),
          titleReady: Boolean(title),
          keywordsReady: Boolean(keywords),
          tradeReady: Boolean(trade),
          editorReady: Boolean(editor),
          draftControlReady: Boolean(draft && String(draft.textContent || '').trim() === '存草稿'),
          url: location.href,
        };
      })()`);
      if (inspection?.ok === true) return inspection;

      const loggedOut = Boolean(
        /\/index\/login_member\.html|\/user\/ulogin/i.test(String(current?.url || ""))
        || /账号密码登录|手机快捷登录|入驻维科号/.test(text)
      );
      if (loggedOut) {
        throw articleFailure("维科网登录态已失效，请在 Ego Browser 完成登录后重试", {
          status: "BLOCKED_AUTH",
          exitCode: 2,
          evidence: { editorFound: false, url: publicDraftUrl(current?.url) },
        });
      }
    }

    throw articleFailure("维科网当前页面未找到已验证的图文草稿编辑器", {
      evidence: { ...inspection, url: publicDraftUrl(current?.url) },
    });
  },

  async saveDraft({ input: articleInput }) {
    const saved = await js(String.raw`(async (input) => {
      void 'OIL_OFWEEK_SAVE';
      const title = document.querySelector('input[name="title"]');
      const keywords = document.querySelector('input[name="keywords"]');
      const trade = document.querySelector('select[name="trade_id"]');
      const draft = document.querySelector('#draf');
      const editor = window.tinymce?.activeEditor;
      if (!title || !keywords || !trade || !draft || !editor) {
        return { ok: false, error: '维科网草稿编辑器已离开当前页面' };
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
      const setInput = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        dispatchChange(element);
      };
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const compactLength = value => String(value || '').replace(/\s+/g, '').length;
      const buildKeywords = () => {
        const values = [...(Array.isArray(input.tags) ? input.tags : [])]
          .map(value => normalize(value).replace(/[，,]/g, ''))
          .filter(Boolean);
        let result = '';
        for (const value of values) {
          const candidate = result ? result + ',' + value : value;
          if (compactLength(candidate) <= 20) result = candidate;
          else if (!result) result = [...value].slice(0, 20).join('');
        }
        return result || '内容发布';
      };
      const chooseIndustry = () => {
        const scratch = document.createElement('div');
        scratch.innerHTML = String(input.html || '');
        const source = [
          input.title,
          input.summary,
          ...(Array.isArray(input.tags) ? input.tags : []),
          scratch.textContent,
        ].map(normalize).join(' ');
        const rules = [
          ['集成电路', /集成电路|半导体|芯片|晶圆|存储芯片/i],
          ['光通讯', /光通信|光通讯|光模块|光纤/i],
          ['人工智能', /人工智能|大模型|AI|算力|智能体/i],
          ['机器人', /机器人|具身智能/i],
          ['新能源汽车', /新能源汽车|新能源车|电动车/i],
          ['锂电', /锂电|电池材料/i],
          ['智能汽车', /智能汽车|智能驾驶|智驾/i],
          ['医械科技', /医疗器械|医械/i],
          ['生物科技', /生物科技|创新药|mRNA/i],
          ['太阳能光伏', /太阳能|光伏/i],
          ['通信', /通信网络|通信产业|5G|6G/i],
          ['储能', /储能/i],
          ['新材料', /新材料/i],
          ['投融资', /投融资|证券|股票|资本市场|财经/i],
          ['物联网', /物联网|IoT/i],
          ['消费电子', /消费电子/i],
          ['电子工程', /电子工程|PCB/i],
          ['智能制造', /智能制造|工业自动化/i],
          ['云计算', /云计算|云服务/i],
          ['软件', /软件|平台|开发|Adapter/i],
        ];
        const preferred = rules.find(([, pattern]) => pattern.test(source))?.[0] || '互联网';
        const options = [...trade.options];
        return options.find(option => normalize(option.textContent) === preferred)
          || options.find(option => normalize(option.textContent) === '互联网')
          || options.find(option => String(option.value || '') !== '');
      };

      const normalizedTitle = normalize(input.title);
      if (normalizedTitle.length < 5 || normalizedTitle.length > 50) {
        return { ok: false, error: '维科网文章标题必须为 5-50 个字' };
      }
      const keywordValue = buildKeywords();
      const industry = chooseIndustry();
      if (!industry) return { ok: false, error: '维科网未找到可用的发布行业' };

      setInput(title, normalizedTitle);
      setInput(keywords, keywordValue);
      trade.value = industry.value;
      dispatchChange(trade);
      editor.setContent(String(input.html || ''));
      editor.fire('input');
      editor.fire('change');
      if (!normalize(editor.getContent({ format: 'text' }))) {
        return { ok: false, error: '维科网正文编辑器写入失败' };
      }

      const originalAddfunc = window.addfunc;
      let response;
      try {
        response = await new Promise(resolve => {
          const timeout = setTimeout(() => resolve(undefined), 15000);
          window.addfunc = payload => {
            clearTimeout(timeout);
            window.add_lock = false;
            resolve(payload);
          };
          draft.click();
        });
      } finally {
        window.addfunc = originalAddfunc;
        window.add_lock = false;
      }
      if (Number(response?.status) !== 1) {
        return {
          ok: false,
          error: normalize(response?.info) || '维科网保存草稿接口未返回成功',
        };
      }

      let draftRecord;
      for (let attempt = 0; attempt < 16 && !draftRecord; attempt += 1) {
        const managerResponse = await fetch('/article/ajax_articles.html', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: new URLSearchParams({
            status: '4',
            keyword: normalizedTitle,
            page: '1',
            pagesize: '20',
          }),
        });
        const managerPayload = await managerResponse.json().catch(() => undefined);
        const matched = (Array.isArray(managerPayload?.data?.list) ? managerPayload.data.list : [])
          .find(item => normalize(item?.title) === normalizedTitle && Number(item?.status) === 4);
        const href = String(matched?.edit_url || '');
        const idMatch = href.match(/\/article\/edit\/id\/([^/.]+)\.html/i);
        if (idMatch?.[1]) {
          draftRecord = {
            remoteId: decodeURIComponent(idMatch[1]),
            draftUrl: new URL(href, location.origin).href,
          };
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!draftRecord?.remoteId) {
        return {
          ok: false,
          status: 'REMOTE_UNVERIFIED',
          exitCode: 4,
          error: '维科网已保存草稿，但文章管理页没有返回可验证的草稿 ID',
          evidence: {
            saveEndpoint: '/home/news/ajax_add',
            isDraft: 1,
            finalPublishBlocked: true,
          },
        };
      }
      return {
        ok: true,
        ...draftRecord,
        evidence: {
          saveEndpoint: '/home/news/ajax_add',
          draftListEndpoint: '/article/ajax_articles.html',
          isDraft: 1,
          keywordsFilled: true,
          industry: normalize(industry.textContent),
          managerDraftMatched: true,
          finalPublishBlocked: true,
        },
      };
    })(${JSON.stringify(articleInput)})`);
    return assertSaved(saved, "维科网草稿保存失败");
  },

  async verify({ input: articleInput, saved }) {
    await openOrReuseTab(saved.draftUrl, { wait: true, timeout: 30 });
    await wait(2);
    let verification;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      verification = await js(String.raw`((expectedTitle, expectedId) => {
        void 'OIL_OFWEEK_VERIFY';
        const title = String(document.querySelector('input[name="title"]')?.value || '').trim();
        const keywords = String(document.querySelector('input[name="keywords"]')?.value || '').trim();
        const trade = String(document.querySelector('select[name="trade_id"]')?.value || '').trim();
        const hiddenId = String(document.querySelector('input[name="id"]')?.value || '').trim();
        const content = String(
          window.tinymce?.activeEditor?.getContent({ format: 'text' })
          || document.querySelector('textarea[name="content"]')?.value
          || ''
        ).trim();
        const urlId = location.pathname.match(/\/article\/edit\/id\/([^/.]+)\.html/i)?.[1] || '';
        const loggedOut = /\/index\/login_member\.html|\/user\/ulogin/i.test(location.href);
        const titleMatched = title === expectedTitle;
        const idMatched = decodeURIComponent(urlId) === expectedId && hiddenId === expectedId;
        const requiredFieldsMatched = Boolean(keywords && trade && content);
        return {
          verified: titleMatched && idMatched && requiredFieldsMatched && !loggedOut,
          titleMatched,
          idMatched,
          requiredFieldsMatched,
          loggedOut,
          url: location.href,
        };
      })(${JSON.stringify(articleInput.title.trim())}, ${JSON.stringify(saved.remoteId)})`);
      if (verification?.verified === true) return verification;
      await wait(1);
    }
    throw articleFailure("维科网未通过草稿页面标题、ID 与必填字段回读", {
      status: "REMOTE_UNVERIFIED",
      exitCode: 4,
      evidence: { ...verification, url: publicDraftUrl(verification?.url) },
    });
  },
});
