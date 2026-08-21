// B站远端草稿保存器。video-publisher 已完成上传和字段验证；本脚本只点击“存草稿”并回读 draftId。
const input = typeof OIL_VIDEO_DRAFT_INPUT === "object" && OIL_VIDEO_DRAFT_INPUT !== null
  ? OIL_VIDEO_DRAFT_INPUT
  : undefined;

const DRAFT_MANAGER_URL = "https://member.bilibili.com/platform/upload-manager/article?group=draft";

function output(value) {
  cliLog(JSON.stringify({ platform: "bilibili", ...value }));
}

if (!input || input.platform !== "bilibili" || !input.taskSpace || !input.expectedTitle) {
  throw new Error("video draft input is missing");
}

const task = await useOrCreateTaskSpace(String(input.taskSpace));

async function inspectSavedDraft(expectedTitle) {
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
    return {
      verified: cards.length === 1,
      matches: cards,
      url: location.href,
    };
  })(${JSON.stringify(expectedTitle)})`);
}

try {
  let saved = await inspectSavedDraft(input.expectedTitle);
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
      const currentDraftId = new URL(String(current?.url || ""), DRAFT_MANAGER_URL)
        .searchParams.get("draftId");
      if (!currentDraftId) {
        await openOrReuseTab(DRAFT_MANAGER_URL, { wait: true, timeout: 30 });
        await wait(2);
      }
    }

    const current = await pageInfo();
    if (!String(current?.url || "").includes("group=draft")) {
      await openOrReuseTab(DRAFT_MANAGER_URL, { wait: true, timeout: 30 });
      await wait(2);
    }
    saved = await inspectSavedDraft(input.expectedTitle);
  }

  if (saved?.verified !== true || saved.matches?.[0]?.draftId === undefined) {
    output({
      ok: false,
      error: "B站未通过远端草稿验证",
      evidence: saved,
      taskSpace: String(task.id),
    });
    process.exitCode = 3;
  } else {
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
} catch (error) {
  output({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    taskSpace: String(task.id),
  });
  process.exitCode = 4;
}
