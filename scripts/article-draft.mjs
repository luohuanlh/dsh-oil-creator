// 微信公众号图文草稿执行器。Harness 已冻结全部文案；本脚本只上传、保存和回读验证。
const input = typeof OIL_ARTICLE_INPUT === "object" && OIL_ARTICLE_INPUT !== null
  ? OIL_ARTICLE_INPUT
  : undefined;

function output(value) {
  cliLog(JSON.stringify({ platform: "wechat-mp", ...value }));
}

function publicDraftUrl(value) {
  try {
    const url = new URL(String(value));
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return "";
  }
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/([?&](?:token|ticket)=)[^&\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/((?:token|ticket)%3D)[^%&\s"'<>]+/gi, "$1[REDACTED]");
}

if (!input || input.platform !== "wechat-mp") {
  throw new Error("article draft input is missing");
}

const task = await useOrCreateTaskSpace(input.taskName);

try {
  await openOrReuseTab("https://mp.weixin.qq.com/", { wait: true, timeout: 30 });
  await wait(2);
  const initial = await pageInfo();
  const initialText = await snapshotText();
  if (/扫码登录|请使用微信扫描二维码|请先登录/.test(initialText)
    || /\/login/.test(String(initial?.url || ""))) {
    const handoff = await handOffTaskSpace(task.id);
    output({
      ok: false,
      error: "微信公众号登录态已失效，请在 Ego Browser 完成登录后重试",
      taskSpace: String(task.id),
      handedOff: handoff?.done === true,
    });
    process.exit(2);
  }

  const created = await js(String.raw`(async (input) => {
    const fail = (error, evidence = {}) => ({ ok: false, error, evidence });
    const html = document.documentElement.innerHTML;
    const token = new URL(location.href).searchParams.get('token')
      || html.match(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/)?.[1]
      || '';
    const ticket = html.match(/ticket:\s*["']([^"']+)["']/)?.[1] || '';
    const userName = html.match(/user_name:\s*["']([^"']+)["']/)?.[1] || '';
    const svrTime = html.match(/time:\s*["'](\d+)["']/)?.[1] || String(Math.floor(Date.now() / 1000));
    if (!token || !ticket || !userName) {
      return fail('无法从已登录页面读取微信公众号草稿凭据', {
        hasToken: Boolean(token),
        hasTicket: Boolean(ticket),
        hasUserName: Boolean(userName),
      });
    }

    const bytes = Uint8Array.from(atob(input.coverBase64), char => char.charCodeAt(0));
    const coverBlob = new Blob([bytes], { type: input.coverMime });
    const extension = input.coverMime === 'image/png' ? 'png' : input.coverMime === 'image/webp' ? 'webp' : 'jpg';
    const timestamp = Date.now();
    const coverName = 'oil-cover-' + timestamp + '.' + extension;
    const coverForm = new FormData();
    coverForm.append('type', input.coverMime);
    coverForm.append('id', String(timestamp));
    coverForm.append('name', coverName);
    coverForm.append('lastModifiedDate', new Date().toString());
    coverForm.append('size', String(coverBlob.size));
    coverForm.append('file', coverBlob, coverName);
    const uploadUrl = 'https://mp.weixin.qq.com/cgi-bin/filetransfer?action=upload_material'
      + '&f=json&scene=8&writetype=doublewrite&groupid=1'
      + '&ticket_id=' + encodeURIComponent(userName)
      + '&ticket=' + encodeURIComponent(ticket)
      + '&svr_time=' + encodeURIComponent(svrTime)
      + '&token=' + encodeURIComponent(token)
      + '&lang=zh_CN&seq=' + Date.now()
      + '&t=' + Math.random();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      body: coverForm,
    });
    const upload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok || upload.base_resp?.err_msg !== 'ok' || !upload.cdn_url) {
      return fail('微信公众号封面上传失败', { status: uploadResponse.status, response: upload });
    }
    let coverContent = {};
    try {
      coverContent = typeof upload.content === 'string' ? JSON.parse(upload.content) : upload.content || {};
    } catch {}
    const coverFileId = String(coverContent.file_id || coverContent.id || upload.file_id || '');
    const coverUrl = String(upload.cdn_url);

    const form = new URLSearchParams({
      token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
      random: String(Math.random()),
      AppMsgId: '',
      count: '1',
      data_seq: '0',
      operate_from: 'Chrome',
      isnew: '0',
      ad_video_transition0: '',
      can_reward0: '0',
      related_video0: '',
      is_video_recommend0: '-1',
      title0: input.title,
      author0: '',
      writerid0: '0',
      fileid0: coverFileId,
      digest0: input.summary,
      auto_gen_digest0: input.summary ? '0' : '1',
      content0: input.html,
      sourceurl0: '',
      need_open_comment0: '1',
      only_fans_can_comment0: '0',
      cdn_url0: coverUrl,
      cdn_235_1_url0: coverUrl,
      cdn_1_1_url0: coverUrl,
      cdn_url_back0: coverUrl,
      crop_list0: '',
      music_id0: '',
      video_id0: '',
      voteid0: '',
      voteismlt0: '',
      supervoteid0: '',
      cardid0: '',
      cardquantity0: '',
      cardlimit0: '',
      vid_type0: '',
      show_cover_pic0: '1',
      shortvideofileid0: '',
      copyright_type0: '0',
      releasefirst0: '',
      platform0: '',
      reprint_permit_type0: '',
      allow_reprint0: '',
      allow_reprint_modify0: '',
      original_article_type0: '',
      ori_white_list0: '',
      free_content0: '',
      fee0: '0',
      ad_id0: '',
      guide_words0: '',
      is_share_copyright0: '0',
      share_copyright_url0: '',
      source_article_type0: '',
      reprint_recommend_title0: '',
      reprint_recommend_content0: '',
      share_page_type0: '0',
      share_imageinfo0: JSON.stringify({ list: [{ url: coverUrl }] }),
      share_video_id0: '',
      dot0: '{}',
      share_voice_id0: '',
      insert_ad_mode0: '',
      categories_list0: '[]',
    });
    const saveUrl = 'https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77'
      + '&token=' + encodeURIComponent(token) + '&lang=zh_CN';
    const saveResponse = await fetch(saveUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const saved = await saveResponse.json().catch(() => ({}));
    if (!saveResponse.ok || !saved.appMsgId) {
      return fail('微信公众号保存草稿失败', { status: saveResponse.status, response: saved });
    }
    const remoteId = String(saved.appMsgId);
    return {
      ok: true,
      remoteId,
      draftUrl: 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77'
        + '&appmsgid=' + encodeURIComponent(remoteId)
        + '&token=' + encodeURIComponent(token) + '&lang=zh_CN',
    };
  })(${JSON.stringify(input)})`);

  if (created?.ok !== true) {
    output({ ok: false, error: created?.error || "微信公众号草稿创建失败", evidence: created?.evidence });
    process.exit(3);
  }

  await openOrReuseTab(created.draftUrl, { wait: true, timeout: 30 });
  await wait(3);
  const verification = await js(String.raw`((expectedTitle, expectedId) => {
    const values = [...document.querySelectorAll('input,textarea')]
      .map(element => String(element.value || '').trim())
      .filter(Boolean);
    const text = String(document.body?.innerText || '');
    const titleMatched = values.includes(expectedTitle) || text.includes(expectedTitle);
    const idMatched = new URL(location.href).searchParams.get('appmsgid') === expectedId;
    const loggedOut = /扫码登录|请使用微信扫描二维码|请先登录/.test(text);
    return {
      verified: titleMatched && idMatched && !loggedOut,
      titleMatched,
      idMatched,
      loggedOut,
      url: location.href,
    };
  })(${JSON.stringify(input.title)}, ${JSON.stringify(created.remoteId)})`);
  if (verification?.verified !== true) {
    output({
      ok: false,
      error: "微信公众号未通过草稿页面验证",
      evidence: {
        ...verification,
        url: publicDraftUrl(verification?.url),
      },
    });
    process.exit(4);
  }

  const handoff = await handOffTaskSpace(task.id);
  output({
    ok: true,
    verified: true,
    remoteId: created.remoteId,
    // token 只用于当前浏览器会话内打开编辑页，绝不返回给 Host 或写入 overlay。
    draftUrl: publicDraftUrl(created.draftUrl),
    taskSpace: String(task.id),
    handedOff: handoff?.done === true,
  });
} catch (error) {
  output({
    ok: false,
    error: redactSensitiveText(error instanceof Error ? error.message : String(error)),
    taskSpace: String(task.id),
  });
  process.exit(5);
}
