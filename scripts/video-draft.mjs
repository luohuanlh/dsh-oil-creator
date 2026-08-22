// 视频平台草稿结束动作保存器。video-publisher 已完成上传和字段验证；本脚本只执行非发布动作并验证其页面后置状态。
const input = typeof OIL_VIDEO_DRAFT_INPUT === "object" && OIL_VIDEO_DRAFT_INPUT !== null
  ? OIL_VIDEO_DRAFT_INPUT
  : undefined;

const BILIBILI_DRAFT_MANAGER_URL = "https://member.bilibili.com/platform/upload-manager/article?group=draft";
const XIAOHONGSHU_DRAFT_URL = "https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video";
const DOUYIN_DRAFT_URL = "https://creator.douyin.com/creator-micro/content/upload";
const WECHAT_CHANNELS_DRAFT_URL = "https://channels.weixin.qq.com/platform/post/create";
const KUAISHOU_DRAFT_URL = "https://cp.kuaishou.com/article/publish/video";
const KUAISHOU_SNAPSHOT_URL = "https://cp.kuaishou.com/rest/cp/works/v2/video/pc/snapshot/info";

const supportedPlatforms = new Set(["bilibili", "douyin", "xiaohongshu", "channels", "kuaishou"]);
const needsTitle = input?.platform === "bilibili"
  || input?.platform === "douyin"
  || input?.platform === "xiaohongshu"
  || input?.platform === "kuaishou";

if (!input
  || !supportedPlatforms.has(input.platform)
  || !input.taskSpace
  || (needsTitle && !input.expectedTitle)
  || (input.platform === "channels" && !input.expectedDescription)
  || (input.platform === "kuaishou" && (!input.expectedCaption || !input.expectedFileName))) {
  throw new Error("video draft input is missing");
}

function output(value) {
  cliLog(JSON.stringify({ platform: input.platform, ...value }));
}

function actionReceipt(action) {
  return `${input.platform}:${action}:task-space:${task.id}`;
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
      .filter(element => ![...element.children].some(child => visible(child)
        && compact(child.innerText || child.textContent || '') === '继续编辑'))
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

async function inspectDouyinTemporaryExit() {
  return js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const url = new URL(location.href);
    const continueControls = [...document.querySelectorAll('button, [role="button"], div, span')]
      .filter(element => visible(element)
        && compact(element.innerText || element.textContent || '') === '继续编辑')
      .filter(element => ![...element.children].some(child => visible(child)
        && compact(child.innerText || child.textContent || '') === '继续编辑'))
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
    const titleInput = [...document.querySelectorAll('input')]
      .find(element => (element.placeholder || '').includes('作品标题') && visible(element));
    const landing = url.pathname.includes('/content/upload');
    return {
      verified: landing && continueControls.length === 1 && !titleInput,
      landing,
      continueControls: continueControls.length,
      titleInputVisible: Boolean(titleInput),
      url: location.href,
    };
  })()`);
}

async function runDouyinDraft() {
  const current = await pageInfo();
  if (String(current?.url || "").includes("/content/upload")) {
    const resumed = await resumeSavedDouyinDraft();
    if (resumed?.ok !== true) {
      output({ ok: false, error: "抖音已暂存草稿恢复入口不唯一", evidence: resumed, taskSpace: String(task.id) });
      process.exitCode = 3;
      return;
    }
  }

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
        videoIds,
        url: location.href,
      };
    }
    saveButtons[0].id = 'oil-save-douyin-draft';
    saveButtons[0].scrollIntoView({ block: 'center', inline: 'center' });
    return { ok: true, selector: '#oil-save-douyin-draft', videoIds };
  })(${JSON.stringify(input.expectedTitle)})`);
  if (target?.ok !== true) {
    output({ ok: false, error: "抖音投稿页尚未达到可暂存状态", evidence: target, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  await click(target.selector, { label: "保存抖音草稿（暂存离开）" });
  let exited;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(.5);
    exited = await inspectDouyinTemporaryExit();
    if (exited?.verified === true) break;
  }
  if (exited?.verified !== true) {
    output({ ok: false, error: "抖音暂存离开后未出现唯一恢复入口", evidence: exited, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const remoteId = target.videoIds?.length === 1 ? target.videoIds[0] : undefined;
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    ...(remoteId ? { remoteId } : {}),
    draftReceipt: actionReceipt("temporary-leave"),
    draftUrl: exited.url || DOUYIN_DRAFT_URL,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

async function inspectXiaohongshuTemporaryExit(beforeUrl) {
  return js(String.raw`((beforeUrl) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const titleInput = [...document.querySelectorAll('input, textarea')]
      .find(element => visible(element)
        && /标题/.test(String(element.placeholder || element.getAttribute('aria-label') || '')));
    const temporaryButtons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(element => visible(element)
        && compact(element.innerText || element.textContent || '') === '暂存离开');
    const continueControls = [...document.querySelectorAll('button, [role="button"], div, span')]
      .filter(element => visible(element)
        && /^(继续发布|继续编辑)$/.test(compact(element.innerText || element.textContent || '')))
      .filter(element => ![...element.children].some(child => visible(child)
        && /^(继续发布|继续编辑)$/.test(compact(child.innerText || child.textContent || ''))))
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
    const routeChanged = location.href !== beforeUrl;
    const editorExited = !titleInput && temporaryButtons.length === 0;
    return {
      verified: editorExited && (routeChanged || continueControls.length === 1),
      editorExited,
      routeChanged,
      continueControls: continueControls.length,
      titleInputVisible: Boolean(titleInput),
      temporaryButtons: temporaryButtons.length,
      url: location.href,
    };
  })(${JSON.stringify(beforeUrl)})`);
}

async function runXiaohongshuDraft() {
  const target = await js(String.raw`((expectedTitle) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const title = [...document.querySelectorAll('input, textarea')]
      .find(element => visible(element)
        && /标题/.test(String(element.placeholder || element.getAttribute('aria-label') || '')));
    const saveButtons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(element => visible(element)
        && compact(element.innerText || element.textContent || '') === '暂存离开');
    const finalButtons = [...document.querySelectorAll('button, [role="button"]')]
      .filter(element => visible(element)
        && /^(发布笔记|发布)$/.test(compact(element.innerText || element.textContent || '')));
    const guard = window.__VIDEO_PUBLISHER_FINAL_GUARD__;
    const ready = title
      && String(title.value || '').trim() === expectedTitle
      && saveButtons.length === 1
      && finalButtons.length === 1
      && !saveButtons[0].disabled
      && !finalButtons[0].disabled
      && guard?.armed === true
      && (guard?.blockedAttempts?.length || 0) === 0;
    if (!ready) {
      return {
        ok: false,
        title: String(title?.value || ''),
        saveButtons: saveButtons.length,
        finalButtons: finalButtons.length,
        guardArmed: guard?.armed === true,
        blockedAttempts: guard?.blockedAttempts?.length || 0,
        url: location.href,
      };
    }
    saveButtons[0].id = 'oil-save-xiaohongshu-draft';
    saveButtons[0].scrollIntoView({ block: 'center', inline: 'center' });
    return { ok: true, selector: '#oil-save-xiaohongshu-draft', beforeUrl: location.href };
  })(${JSON.stringify(input.expectedTitle)})`);
  if (target?.ok !== true) {
    output({ ok: false, error: "小红书投稿页尚未达到可暂存状态", evidence: target, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  await click(target.selector, { label: "保存小红书草稿（暂存离开）" });
  let exited;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(.5);
    exited = await inspectXiaohongshuTemporaryExit(target.beforeUrl);
    if (exited?.verified === true) break;
  }
  if (exited?.verified !== true) {
    output({ ok: false, error: "小红书暂存离开后未退出编辑器", evidence: exited, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    draftReceipt: actionReceipt("temporary-leave"),
    draftUrl: exited.url || XIAOHONGSHU_DRAFT_URL,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

async function activateWechatChannels() {
  await cdp("Page.bringToFront", {}).catch(() => undefined);
  await cdp("Page.setWebLifecycleState", { state: "active" }).catch(() => undefined);
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
}

async function inspectWechatDraftSaved(beforeUrl, networkAccepted) {
  return js(String.raw`((beforeUrl, networkAccepted) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const roots = [document, ...[...document.querySelectorAll('*')]
      .map(element => element.shadowRoot).filter(Boolean)];
    const controls = roots.flatMap(root => [...root.querySelectorAll('button, [role="button"]')]);
    const saveButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '保存草稿');
    const finalButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '发表');
    const text = compact(roots.map(root => root.body?.innerText || root.host?.innerText || '').join('\n'));
    const savedNotice = /草稿已保存|保存草稿成功|保存成功|已保存/.test(text);
    const routeChanged = location.href !== beforeUrl;
    const editorExited = saveButtons.length === 0 && finalButtons.length === 0;
    return {
      verified: networkAccepted === true,
      networkAccepted,
      savedNotice,
      routeChanged,
      editorExited,
      saveButtons: saveButtons.length,
      finalButtons: finalButtons.length,
      url: location.href,
    };
  })(${JSON.stringify(beforeUrl)}, ${JSON.stringify(networkAccepted)})`);
}

async function runWechatChannelsDraft() {
  await activateWechatChannels();
  const target = await js(String.raw`((expectedDescription) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const roots = [document, ...[...document.querySelectorAll('*')]
      .map(element => element.shadowRoot).filter(Boolean)];
    const editors = roots.flatMap(root => [...root.querySelectorAll('[contenteditable="true"], [contenteditable=""], textarea')])
      .filter(element => visible(element))
      .filter(element => /input-editor|视频描述|editor/i.test(String(element.className || ''))
        && !/chatInput/.test(String(element.className || '')));
    const description = compact(editors[0]?.innerText || editors[0]?.value || editors[0]?.textContent || '');
    const controls = roots.flatMap(root => [...root.querySelectorAll('button, [role="button"]')]);
    const saveButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '保存草稿');
    const finalButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '发表');
    const guard = window.__VIDEO_PUBLISHER_FINAL_GUARD__;
    const button = saveButtons[0];
    const rect = button?.getBoundingClientRect();
    const ready = description === compact(expectedDescription)
      && saveButtons.length === 1
      && finalButtons.length === 1
      && !button.disabled
      && !finalButtons[0].disabled
      && guard?.armed === true
      && (guard?.blockedAttempts?.length || 0) === 0;
    return ready
      ? { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, beforeUrl: location.href }
      : {
          ok: false,
          description,
          expectedDescription: compact(expectedDescription),
          saveButtons: saveButtons.length,
          finalButtons: finalButtons.length,
          guardArmed: guard?.armed === true,
          blockedAttempts: guard?.blockedAttempts?.length || 0,
          url: location.href,
        };
  })(${JSON.stringify(input.expectedDescription)})`);
  if (target?.ok !== true) {
    output({ ok: false, error: "视频号投稿页尚未达到可保存草稿状态", evidence: target, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  await cdp("Network.enable", {});
  await drainEvents();
  await click([target.x, target.y], { label: "保存视频号草稿" });
  let saved;
  let networkAccepted = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(.5);
    await activateWechatChannels();
    const events = await drainEvents();
    networkAccepted ||= events.some((event) => {
      const response = event?.params?.response;
      return event?.method === "Network.responseReceived"
        && /\/post\/post_draft(?:\?|$)/.test(String(response?.url || ""))
        && Number(response?.status) >= 200
        && Number(response?.status) < 300;
    });
    saved = await inspectWechatDraftSaved(target.beforeUrl, networkAccepted);
    if (saved?.verified === true) break;
  }
  if (saved?.verified !== true) {
    output({ ok: false, error: "视频号保存草稿后没有可验证的页面结果", evidence: saved, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    draftReceipt: actionReceipt("save-draft"),
    draftUrl: saved.url || WECHAT_CHANNELS_DRAFT_URL,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

function kuaishouSnapshotCaptionToText(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u200b/g, "")
    .trim();
}

async function inspectKuaishouSnapshot() {
  const raw = await browserFetch(KUAISHOU_SNAPSHOT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const response = typeof raw === "string" ? JSON.parse(raw) : raw;
  const draft = response?.result === 1 && response?.data && typeof response.data === "object"
    ? response.data
    : undefined;
  const remoteCaption = kuaishouSnapshotCaptionToText(draft?.caption);
  const remoteId = Number(draft?.fileId);
  const verified = Number.isFinite(remoteId)
    && remoteId > 0
    && String(draft?.fileName || "") === input.expectedFileName
    && remoteCaption === input.expectedCaption
    && Number(draft?.photoStatus) === 1
    && String(draft?.mediaId || "") !== ""
    && Number(draft?.videoDuration || 0) > 0;
  return {
    verified,
    remoteId: verified ? String(remoteId) : "",
    evidence: {
      result: response?.result,
      fileId: Number.isFinite(remoteId) ? remoteId : null,
      fileNameMatched: String(draft?.fileName || "") === input.expectedFileName,
      captionMatched: remoteCaption === input.expectedCaption,
      photoStatus: Number(draft?.photoStatus),
      mediaIdPresent: String(draft?.mediaId || "") !== "",
      videoDuration: Number(draft?.videoDuration || 0),
    },
  };
}

async function inspectSavedKuaishouDraft() {
  const page = await js(String.raw`((expectedCaption) => {
    const compact = value => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u200b/g, '').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const captionEditor = [...document.querySelectorAll('#work-description-edit, #vp2-kuaishou-caption, [contenteditable="true"][placeholder*="作品描述"]')]
      .find(element => visible(element));
    const caption = compact(captionEditor?.innerText || '');
    const finalButtons = [...document.querySelectorAll('button, [role="button"], div')]
      .filter(element => visible(element)
        && String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() === '发布'
        && /button-primary/.test(String(element.className || '')));
    const guard = window.__VIDEO_PUBLISHER_FINAL_GUARD__;
    return {
      caption,
      captionMatched: caption === expectedCaption,
      finalButtons: finalButtons.length,
      finalButtonEnabled: finalButtons.length === 1
        && !finalButtons[0].disabled
        && finalButtons[0].getAttribute('aria-disabled') !== 'true'
        && !/disabled/.test(String(finalButtons[0].className || '')),
      guardArmed: guard?.armed === true,
      blockedAttempts: guard?.blockedAttempts?.length || 0,
      url: location.href,
    };
  })(${JSON.stringify(input.expectedCaption)})`);
  const snapshot = await inspectKuaishouSnapshot();
  const verified = page?.captionMatched === true
    && page?.finalButtons === 1
    && page?.finalButtonEnabled === true
    && page?.guardArmed === true
    && page?.blockedAttempts === 0
    && snapshot.verified === true;
  return {
    verified,
    remoteId: verified ? snapshot.remoteId : "",
    draftUrl: KUAISHOU_DRAFT_URL,
    evidence: {
      page,
      ...snapshot.evidence,
    },
  };
}

async function inspectKuaishouCancelledEditor(beforeUrl) {
  return js(String.raw`((beforeUrl) => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const captionEditor = [...document.querySelectorAll('#work-description-edit, #vp2-kuaishou-caption, [contenteditable="true"][placeholder*="作品描述"]')]
      .find(element => visible(element));
    const finalButtons = [...document.querySelectorAll('button, [role="button"], div')]
      .filter(element => visible(element)
        && compact(element.innerText || element.textContent || '') === '发布'
        && /button-primary/.test(String(element.className || '')));
    const continueControls = [...document.querySelectorAll('button, [role="button"], div, span')]
      .filter(element => visible(element)
        && compact(element.innerText || element.textContent || '') === '继续编辑')
      .filter(element => ![...element.children].some(child => visible(child)
        && compact(child.innerText || child.textContent || '') === '继续编辑'))
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
    const routeChanged = location.href !== beforeUrl;
    const editorExited = !captionEditor && finalButtons.length === 0;
    return {
      verified: editorExited && (routeChanged || continueControls.length === 1),
      editorExited,
      routeChanged,
      continueControls: continueControls.length,
      captionEditorVisible: Boolean(captionEditor),
      finalButtons: finalButtons.length,
      url: location.href,
    };
  })(${JSON.stringify(beforeUrl)})`);
}

async function runKuaishouDraft() {
  let saved;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    saved = await inspectSavedKuaishouDraft();
    if (saved.verified) break;
    await wait(.5);
  }
  if (saved?.verified !== true || saved.remoteId === "") {
    output({ ok: false, error: "快手未通过远端草稿验证", evidence: saved?.evidence, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  const target = await js(String.raw`(() => {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 8 && rect.height > 8
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const controls = [...document.querySelectorAll('button, [role="button"]')];
    const cancelButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '取消');
    const finalButtons = controls.filter(element => visible(element)
      && compact(element.innerText || element.textContent || '') === '发布'
      && /button-primary/.test(String(element.className || '')));
    const guard = window.__VIDEO_PUBLISHER_FINAL_GUARD__;
    if (cancelButtons.length !== 1
      || finalButtons.length !== 1
      || cancelButtons[0].disabled
      || finalButtons[0].disabled
      || guard?.armed !== true
      || (guard?.blockedAttempts?.length || 0) !== 0) {
      return {
        ok: false,
        cancelButtons: cancelButtons.length,
        finalButtons: finalButtons.length,
        guardArmed: guard?.armed === true,
        blockedAttempts: guard?.blockedAttempts?.length || 0,
        url: location.href,
      };
    }
    cancelButtons[0].id = 'oil-cancel-kuaishou-draft';
    cancelButtons[0].scrollIntoView({ block: 'center', inline: 'center' });
    return { ok: true, selector: '#oil-cancel-kuaishou-draft', beforeUrl: location.href };
  })()`);
  if (target?.ok !== true) {
    output({ ok: false, error: "快手编辑页没有唯一可取消控件", evidence: target, taskSpace: String(task.id) });
    process.exitCode = 3;
    return;
  }
  await click(target.selector, { label: "取消并保存快手草稿" });
  let exited;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(.5);
    exited = await inspectKuaishouCancelledEditor(target.beforeUrl);
    if (exited?.verified === true) break;
  }
  const snapshot = await inspectKuaishouSnapshot();
  if (exited?.verified !== true || snapshot.verified !== true || snapshot.remoteId !== saved.remoteId) {
    output({
      ok: false,
      error: "快手取消编辑后没有保留同一份服务器草稿",
      evidence: { exited, snapshot: snapshot.evidence, beforeRemoteId: saved.remoteId },
      taskSpace: String(task.id),
    });
    process.exitCode = 3;
    return;
  }
  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    remoteId: saved.remoteId,
    draftReceipt: actionReceipt("cancel-editor"),
    draftUrl: exited.url || saved.draftUrl,
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
}

try {
  if (input.platform === "bilibili") await runBilibiliDraft();
  else if (input.platform === "douyin") await runDouyinDraft();
  else if (input.platform === "xiaohongshu") await runXiaohongshuDraft();
  else if (input.platform === "channels") await runWechatChannelsDraft();
  else await runKuaishouDraft();
} catch (error) {
  output({ ok: false, error: error instanceof Error ? error.message : String(error), taskSpace: String(task.id) });
  process.exitCode = 4;
}
