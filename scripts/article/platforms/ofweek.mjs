const ofweekDraftForm = Object.freeze({
  platformName: "维科网",
  workspaceUrl: "https://mp.ofweek.com/article/publish.html",
  loggedOutUrlPatterns: ["/index/login_member\\.html", "/user/ulogin"],
  loggedOutTextPatterns: ["账号密码登录", "手机快捷登录", "入驻维科号"],
  titleSelectors: [
    "input[name='title']",
    "#title",
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
  ],
  contentSelectors: [
    ".edui-body-container",
    "iframe[id*='editor']",
    "iframe[id*='ueditor']",
    ".ProseMirror",
    "[contenteditable='true']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "ofweek",

  async inspect() {
    return inspectBrowserDraftForm(ofweekDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: ofweekDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: ofweekDraftForm, articleInput, saved });
  },
});
