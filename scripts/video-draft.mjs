// 视频平台远端草稿保存器。video-publisher 已完成上传和字段验证；本脚本只执行非发布保存并回读远端标识。
const input = typeof OIL_VIDEO_DRAFT_INPUT === "object" && OIL_VIDEO_DRAFT_INPUT !== null
  ? OIL_VIDEO_DRAFT_INPUT
  : undefined;

const BILIBILI_DRAFT_MANAGER_URL = "https://member.bilibili.com/platform/upload-manager/article?group=draft";

if (!input
  || (input.platform !== "bilibili" && input.platform !== "douyin")
  || !input.taskSpace
  || !input.expectedTitle) {
  throw new Error("video draft input is missing");
}

function output(value) {
  cliLog(JSON.stringify({ platform: input.platform, ...value }));
}

const task = await useOrCreateTaskSpace(String(input.taskSpace));

async function inspectSavedBilibiliDraft(expectedTitle) {
  return js(String.raw`((expectedTitle) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const cards = [...document.querySelectorAll('section.bcc-cmad-card.card')]
      .map(card => {
        const title = compact(card.querySelector('.title')?.innerText || '');
        const link = [...card.querySelectorAll('a[href*="draftId="]')]
          .find(anchor => compact(anchor.innerText || '') === expectedTitle)
          || card.querySelector('a[href*="draftId="]');
        const href = link instanceof HTMLAnchorElement ? link.href : '';
        const draftId = href ? new URL(href, location.href).searchParams.get('draftId') || '' : '';
        return { title, href, draftId };
      })
      .filter(card => card.title === expectedTitle && card.draftId !== '');
    return { verified: cards.length === 1, matches: cards, url: location.href };
  })(${JSON.stringify(expectedTitle)})`);
}

async function runBilibiliDraft() {
  let saved = await inspectSavedBilibiliDraft(input.expectedTitle);
  if (saved?.verified !== true) {
    const target = await js(String.raw`((expectedTitle) => {
      const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 12 && rect.height > 12
          && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const title = [...document.querySelectorAll('input[placeholder="请输入稿件标题"]')]
        .find(element => String(element.value || '').trim() === expectedTitle);
      const saveButtons = [...document.querySelectorAll('span.submit-draft')]
        .filter(element => visible(element) && compact(element.innerText || '') === '存草稿');
      const finalButtons = [...document.querySelectorAll('button, span, [role="button"]')]
        .filter(element => visible(element) && compact(element.innerText || '') === '立即投稿');
      const uploadComplete = compact(document.body?.innerText || '').includes('上传完成');
      if (!title || saveButtons.length !== 1 || finalButtons.length !== 1 || !uploadComplete) {
        return {
          ok: false,
          reason: 'B站投稿页尚未达到可保存草稿状态',
          evidence: {
            titleMatched: Boolean(title),
            saveButtons: saveButtons.length,
            finalButtons: finalButtons.length,
            uploadComplete,
            url: location.href,
          },
        };
      }
      saveButtons[0].id = 'oil-save-bilibili-draft';
      saveButtons[0].scrollIntoView({ block: 'center', inline: 'center' });
      return { ok: true, selector: '#oil-save-bilibili-draft' };
    })(${JSON.stringify(input.expectedTitle)})`);

    if (target?.ok === true) {
      await click(target.selector, { label: "保存 B站草稿" });
      await wait(4);
    } else {
      const current = await pageInfo();
      const currentDraftId = new URL(String(current?.url || ""), BILIBILI_DRAFT_MANAGER_URL)
        .searchParams.get("draftId");
      if (!currentDraftId) {
        await openOrReuseTab(BILIBILI_DRAFT_MANAGER_URL, { wait: true, timeout: 30 });
        await wait(2);
      }
    }

    const current = await pageInfo();
    if (!String(current?.url || "").includes("group=draft")) {
      await openOrReuseTab(BILIBILI_DRAFT_MANAGER_URL, { wait: true, timeout: 30 });
      await wait(2);
    }
    saved = await inspectSavedBilibiliDraft(input.expectedTitle);
  }

  if (saved?.verified !== true || saved.matches?.[0]?.draftId === undefined) {
    output({ ok: false, error: "B站未通过远端草稿验证", evidence: saved, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const draft = saved.matches[0];
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    remoteId: draft.draftId,
    draftUrl: draft.href,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

async function inspectSavedDouyinDraft(expectedTitle) {
  return js(String.raw`((expectedTitle) => {
    const title = String([...document.querySelectorAll('input')]
      .find(element => (element.placeholder || '').includes('作品标题'))?.value || '').trim();
    const url = new URL(location.href);
    const draftEntry = url.pathname.includes('/content/post/video')
      && url.searchParams.get('enter_from') === 'draft';
    const videoIds = [...new Set(performance.getEntriesByType('resource')
      .map(entry => {
        try {
          const resource = new URL(entry.name);
          return resource.pathname.includes('/web/api/media/video/transend/')
            ? resource.searchParams.get('video_id') || ''
            : '';
        } catch {
          return '';
        }
      })
      .filter(Boolean))];
    return {
      verified: draftEntry && title === expectedTitle && videoIds.length === 1,
      draftEntry,
      titleMatched: title === expectedTitle,
      title,
      videoIds,
      url: url.origin + url.pathname + '?enter_from=draft',
    };
  })(${JSON.stringify(expectedTitle)})`);
}

async function resumeSavedDouyinDraft() {
  const target = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const controls = [...document.querySelectorAll('div, span, button, [role="button"]')]
      .filter(element => visible(element) && compact(element.innerText || element.textContent || '') === '继续编辑')
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
    if (controls.length !== 1) return { ok: false, count: controls.length };
    controls[0].id = 'oil-resume-douyin-draft';
    controls[0].scrollIntoView({ block: 'center', inline: 'center' });
    performance.clearResourceTimings();
    return { ok: true, selector: '#oil-resume-douyin-draft' };
  })()`);
  if (target?.ok !== true) return target;
  await click(target.selector, { label: "重新打开已暂存抖音草稿" });
  await wait(5);
  return { ok: true };
}

async function runDouyinDraft() {
  let saved = await inspectSavedDouyinDraft(input.expectedTitle);
  if (saved?.verified !== true) {
    const current = await pageInfo();
    if (String(current?.url || "").includes("/content/upload")) {
      const resumed = await resumeSavedDouyinDraft();
      if (resumed?.ok !== true) {
        output({ ok: false, error: "抖音已暂存草稿恢复入口不唯一", evidence: resumed, taskSpace: String(task.id) });
        process.exitCode = 3;
        return;
      }
    } else {
      const target = await js(String.raw`((expectedTitle) => {
        const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
        const visible = element => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 12 && rect.height > 12
            && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const title = [...document.querySelectorAll('input')]
          .find(element => (element.placeholder || '').includes('作品标题'));
        const saveButtons = [...document.querySelectorAll('button, [role="button"]')]
          .filter(element => visible(element) && compact(element.innerText || element.textContent || '') === '暂存离开');
        const finalButtons = [...document.querySelectorAll('button, [role="button"]')]
          .filter(element => visible(element) && compact(element.innerText || element.textContent || '') === '发布');
        const uploadComplete = /上传成功|重新上传/.test(compact(document.body?.innerText || ''));
        if (!title
          || String(title.value || '').trim() !== expectedTitle
          || saveButtons.length !== 1
          || finalButtons.length !== 1
          || saveButtons[0].disabled
          || finalButtons[0].disabled
          || !uploadComplete) {
          return {
            ok: false,
            title: String(title?.value || ''),
            saveButtons: saveButtons.length,
            finalButtons: finalButtons.length,
            uploadComplete,
            url: location.href,
          };
        }
        saveButtons[0].id = 'oil-save-douyin-draft';
        saveButtons[0].scrollIntoView({ block: 'center', inline: 'center' });
        return { ok: true, selector: '#oil-save-douyin-draft' };
      })(${JSON.stringify(input.expectedTitle)})`);
      if (target?.ok !== true) {
        output({ ok: false, error: "抖音投稿页尚未达到可暂存状态", evidence: target, taskSpace: String(task.id) });
        process.exitCode = 3;
        return;
      }
      await click(target.selector, { label: "保存抖音草稿（暂存离开）" });
      await wait(5);
      const resumed = await resumeSavedDouyinDraft();
      if (resumed?.ok !== true) {
        output({ ok: false, error: "抖音暂存后未出现唯一恢复入口", evidence: resumed, taskSpace: String(task.id) });
        process.exitCode = 3;
        return;
      }
    }
    saved = await inspectSavedDouyinDraft(input.expectedTitle);
  }

  const remoteId = saved?.videoIds?.[0];
  if (saved?.verified !== true || typeof remoteId !== "string" || remoteId === "") {
    output({ ok: false, error: "抖音未通过远端草稿验证", evidence: saved, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    remoteId,
    draftUrl: saved.url,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

try {
  if (input.platform === "bilibili") await runBilibiliDraft();
  else await runDouyinDraft();
} catch (error) {
  output({ ok: false, error: error instanceof Error ? error.message : String(error), taskSpace: String(task.id) });
  process.exitCode = 4;
}
