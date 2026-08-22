const laohuDraftForm = Object.freeze({
  platformName: "老虎财经",
  workspaceUrl: "https://www.laohu8.com/",
  loggedOutUrlPatterns: ["/login", "/signin"],
  loggedOutTextPatterns: ["登录后可发布", "登录/注册", "手机号登录"],
  titleSelectors: [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
  ],
  contentSelectors: [
    ".ProseMirror",
    ".ql-editor",
    "[contenteditable='true'][data-placeholder*='正文']",
    "[contenteditable='true'][data-placeholder*='内容']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "postId", "post_id", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "laohu",

  async inspect() {
    return inspectBrowserDraftForm(laohuDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: laohuDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: laohuDraftForm, articleInput, saved });
  },
});
