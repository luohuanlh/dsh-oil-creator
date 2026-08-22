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
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["已自动保存", "草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "id"],
  allowAutosave: true,
  settleMs: 3500,
});

registerArticleAdapter({
  platform: "penguin",

  async inspect() {
    return inspectBrowserDraftForm(penguinDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: penguinDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: penguinDraftForm, articleInput, saved });
  },
});
