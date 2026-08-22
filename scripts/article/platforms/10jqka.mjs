const jqkaDraftForm = Object.freeze({
  platformName: "同顺号",
  workspaceUrl: "https://t.10jqka.com.cn/newcircle/creation/adviserEnterGuide/",
  loggedOutUrlPatterns: ["/login", "/signin"],
  loggedOutTextPatterns: ["未登录", "请登录"],
  titleSelectors: [
    "input[placeholder*='标题']",
    "textarea[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
  ],
  contentSelectors: [
    ".ql-editor",
    ".ProseMirror",
    ".edui-body-container",
    "iframe[id*='editor']",
    "[contenteditable='true'][data-placeholder*='内容']",
  ],
  saveLabels: ["保存草稿", "存草稿", "保存"],
  savedTextPatterns: ["草稿已保存", "保存成功", "已保存"],
  idKeys: ["draftId", "draft_id", "articleId", "article_id", "postId", "id"],
  allowAutosave: false,
  settleMs: 3000,
});

registerArticleAdapter({
  platform: "10jqka",

  async inspect() {
    return inspectBrowserDraftForm(jqkaDraftForm);
  },

  async saveDraft({ input: articleInput, inspection }) {
    return saveBrowserDraftForm({ config: jqkaDraftForm, articleInput, inspection });
  },

  async verify({ input: articleInput, saved }) {
    return verifyBrowserDraftForm({ config: jqkaDraftForm, articleInput, saved });
  },
});
