export type ArticlePreviewFormat = "markdown" | "rich-html";

const WECHAT_RICH_TEXT = /\bdata-wechat-draft\s*=/i;
const FULL_HTML_DOCUMENT = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/i;
const BLOCKED_PAIRED_TAGS = /<(script|iframe|object|embed|form|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCKED_TAGS = /<\/?(?:script|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base)\b[^>]*>/gi;
const EVENT_HANDLER = /\s+on[a-z][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL = /(\s(?:href|src|xlink:href)\s*=\s*)(["'])\s*javascript:[\s\S]*?\2/gi;
const STRONG_LINE = /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/;
const HEADING_LINE = /^\s*(#{1,6})\s+(.+?)\s*$/;
const UNORDERED_ITEM = /^\s*[-+*]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const TABLE_DIVIDER_CELL = /^:?-+:?$/;
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i;
const KEY_MOMENT_LABEL = /^(?:关键时点|关键时刻)[：:]/;
const KEY_MOMENT_ENTRY = /^\s+(?:\*\*|__)(.+?[：:])(?:\*\*|__)\s*(.+?)\s*$/;

interface RenderedMarkdownBlock {
  html: string;
  next: number;
}

const WECHAT_INLINE_STYLE = {
  article: "margin:0 6px;line-height:1.85;font-size:14px;color:#526070;font-family:'Songti SC','Noto Serif CJK SC','STSong',serif;overflow-wrap:anywhere",
  lead: "margin:0 0 16px;padding:15px 17px 14px;border-left:3px solid #bd7d22;background:#fbf8f2",
  kicker: "margin:0 0 8px;color:#b8781e;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;font-weight:750;letter-spacing:.12em",
  paragraph: "margin:0 0 14px",
  disclaimer: "margin:0 0 24px;padding:12px 15px;border:1px solid #e5eaf0;background:#f6f8fa",
  disclaimerTitle: "margin:0 0 5px;color:#657181;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.42",
  disclaimerText: "margin:0;color:#8993a1;font-size:11px",
  heading: "margin:32px 0 14px;color:#273342;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:18px;line-height:1.42",
  sectionTitle: "margin:24px 0 14px;color:#273342;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.42",
  sectionIndex: "margin-top:34px;color:#b8781e;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;font-weight:800;letter-spacing:.08em",
  list: "margin:8px 0 18px;padding-left:1.4em",
  listItem: "margin:8px 0;padding-left:.15em",
  listDetail: "margin:8px 0 0;color:#667486",
  keyMoments: "margin:16px 0 24px;padding:13px 16px 12px;border-left:3px solid #c58a2f;background:#fbf9f4;color:#738195;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
  keyMomentsTitle: "margin:0 0 10px;color:#536071;font-size:12px",
  keyMomentEntry: "margin:0 0 8px;font-size:12px;line-height:1.65",
  signal: "margin:13px 0 14px",
  signalHeading: "display:flex;justify-content:space-between;gap:14px;align-items:baseline;margin-bottom:7px;color:#2f3a47;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:12px",
  signalCount: "color:#b8781e;font-size:11px;white-space:nowrap",
  signalTrack: "height:5px;overflow:hidden;background:#e8edf2",
  tableWrap: "max-width:100%;margin:16px 0;overflow-x:auto",
  table: "width:100%;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
  tableHead: "padding:10px 12px;border:1px solid #e3e7eb;background:#f8f7f4;color:#33404f;font-size:12px;text-align:left;vertical-align:top",
  tableCell: "padding:10px 12px;border:1px solid #e3e7eb;font-size:12px;text-align:left;vertical-align:top",
  quote: "margin:18px 0;padding:10px 14px;border-left:2px solid #c78a33;background:#fbf8f2;color:#687483",
  codeBlock: "overflow:auto;margin:18px 0;padding:14px;background:#22272e;color:#edf2f7",
} as const;

export function articlePreviewFormat(path: string, text: string): ArticlePreviewFormat {
  const pathName = path.split(/[?#]/, 1)[0] ?? "";
  const extension = /\.[^./\\]+$/.exec(pathName)?.[0]?.toLowerCase() ?? "";
  if (extension === ".html" || extension === ".htm") return "rich-html";
  if (WECHAT_RICH_TEXT.test(text) || FULL_HTML_DOCUMENT.test(text)) return "rich-html";
  return "markdown";
}

function safePreviewHtml(value: string): string {
  return value
    .replace(BLOCKED_PAIRED_TAGS, "")
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_HANDLER, "")
    .replace(SCRIPT_URL, "$1$2#$2");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value: string): string {
  return escapeAttribute(value).replaceAll("'", "&#39;");
}

function decodeNumericEntities(value: string): string {
  return value.replace(/&#(?:x([\da-f]{1,6})|(\d{1,7}));/gi, (
    entity,
    hexadecimal: string | undefined,
    decimal: string | undefined,
  ) => {
    const codePoint = Number.parseInt(hexadecimal ?? decimal ?? "", hexadecimal === undefined ? 10 : 16);
    if (!Number.isInteger(codePoint)
      || codePoint <= 0
      || codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
    return String.fromCodePoint(codePoint);
  });
}

function safeMarkdownUrl(value: string, image: boolean): string {
  const url = value.trim().replace(/^<|>$/g, "");
  if (/^(?:https?:|blob:)/i.test(url)) return escapeAttribute(url);
  if (image && SAFE_IMAGE_DATA_URL.test(url)) return escapeAttribute(url);
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) return escapeAttribute(url);
  return "#";
}

function renderInlineMarkdown(value: string): string {
  const fragments: string[] = [];
  const preserve = (html: string): string => {
    const token = `\u0000${fragments.length}\u0000`;
    fragments.push(html);
    return token;
  };

  let rendered = decodeNumericEntities(value)
    .replace(/`([^`\n]+)`/g, (_all, code: string) => preserve(`<code>${escapeHtml(code)}</code>`))
    .replace(
      /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g,
      (_all, alt: string, src: string) => preserve(
        `<img src="${safeMarkdownUrl(src, true)}" alt="${escapeAttribute(alt)}" loading="lazy">`,
      ),
    )
    .replace(
      /\[([^\]]+)]\(\s*([^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g,
      (_all, label: string, href: string) => preserve(
        `<a href="${safeMarkdownUrl(href, false)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
      ),
    );

  rendered = escapeHtml(rendered)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/  \n/g, "<br>");

  return rendered.replace(/\u0000(\d+)\u0000/g, (_all, index: string) => (
    fragments[Number(index)] ?? ""
  ));
}

function renderKeyMoments(lines: string[], index: number, title: string): RenderedMarkdownBlock {
  const entries: string[] = [];
  let next = skipBlankLines(lines, index + 1);
  while (next < lines.length) {
    const entry = KEY_MOMENT_ENTRY.exec(lines[next] ?? "");
    if (entry === null) break;
    entries.push([
      `<p style="${WECHAT_INLINE_STYLE.keyMomentEntry}">`,
      `<strong>${renderInlineMarkdown(entry[1] ?? "")}</strong>`,
      renderInlineMarkdown(entry[2] ?? ""),
      "</p>",
    ].join(""));
    next = skipBlankLines(lines, next + 1);
  }
  return {
    html: [
      `<aside class="key-moments" style="${WECHAT_INLINE_STYLE.keyMoments}">`,
      `<p class="key-moments-title" style="${WECHAT_INLINE_STYLE.keyMomentsTitle}">${renderInlineMarkdown(title)}</p>`,
      `<div class="key-moments-list">${entries.join("")}</div>`,
      "</aside>",
    ].join(""),
    next,
  };
}

function renderListContinuations(lines: string[], index: number): RenderedMarkdownBlock {
  const details: string[] = [];
  let next = index;
  while (next < lines.length) {
    const contentStart = skipBlankLines(lines, next);
    const firstLine = lines[contentStart] ?? "";
    if (!/^\s{2,}\S/.test(firstLine)
      || UNORDERED_ITEM.test(firstLine)
      || ORDERED_ITEM.test(firstLine)) break;

    const paragraph: string[] = [];
    next = contentStart;
    while (next < lines.length) {
      const line = lines[next] ?? "";
      if (line.trim() === "" || !/^\s{2,}\S/.test(line)) break;
      paragraph.push(line.trim());
      next += 1;
    }
    details.push(
      `<p class="list-detail" style="${WECHAT_INLINE_STYLE.listDetail}">${renderInlineMarkdown(paragraph.join("\n"))}</p>`,
    );
  }
  return { html: details.join(""), next };
}

function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function tableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length || !lines[index]?.includes("|")) return false;
  const divider = tableCells(lines[index + 1] ?? "");
  return divider.length > 0 && divider.every((cell) => TABLE_DIVIDER_CELL.test(cell));
}

function plainInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

function renderTable(lines: string[], index: number): RenderedMarkdownBlock {
  const headings = tableCells(lines[index] ?? "");
  let next = index + 2;
  const rows: string[][] = [];
  while (next < lines.length && (lines[next] ?? "").trim() !== "" && (lines[next] ?? "").includes("|")) {
    rows.push(tableCells(lines[next] ?? ""));
    next += 1;
  }

  const plainHeadings = headings.map(plainInline);
  if (plainHeadings.every((heading) => heading === "")) return { html: "", next };
  if (/^\d{2}$/.test(plainHeadings[0] ?? "")
    && plainHeadings.slice(1).every((heading) => heading === "")) {
    return {
      html: `<div class="section-index" style="${WECHAT_INLINE_STYLE.sectionIndex}" aria-hidden="true">${escapeHtml(plainHeadings[0] ?? "")}</div>`,
      next,
    };
  }

  const signalCount = headings.length === 2
    ? /^(\d+)\s*条$/.exec(plainHeadings[1] ?? "")
    : null;
  if (signalCount !== null) {
    const count = Number(signalCount[1]);
    const percentage = Math.min(100, Math.max(12, Math.round(count * 7.7)));
    return {
      html: [
        `<section class="signal-row" style="${WECHAT_INLINE_STYLE.signal}">`,
        `<div class="signal-heading" style="${WECHAT_INLINE_STYLE.signalHeading}">`,
        `<span>${renderInlineMarkdown(headings[0] ?? "")}</span>`,
        `<b style="${WECHAT_INLINE_STYLE.signalCount}">${escapeHtml(plainHeadings[1] ?? "")}</b>`,
        "</div>",
        `<div class="signal-track" style="${WECHAT_INLINE_STYLE.signalTrack}" aria-hidden="true">`,
        `<span style="display:block;width:${percentage}%;height:100%;background:#b77a20"></span>`,
        "</div>",
        "</section>",
      ].join(""),
      next,
    };
  }

  const header = headings.map((cell) => (
    `<th style="${WECHAT_INLINE_STYLE.tableHead}">${renderInlineMarkdown(cell)}</th>`
  )).join("");
  const body = rows.length === 0
    ? ""
    : `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td style="${WECHAT_INLINE_STYLE.tableCell}">${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return {
    html: `<div class="table-scroll" style="${WECHAT_INLINE_STYLE.tableWrap}"><table style="${WECHAT_INLINE_STYLE.table}"><thead><tr>${header}</tr></thead>${body}</table></div>`,
    next,
  };
}

function blockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return line.trim() === ""
    || /^\s*```/.test(line)
    || HEADING_LINE.test(line)
    || STRONG_LINE.test(line)
    || UNORDERED_ITEM.test(line)
    || ORDERED_ITEM.test(line)
    || /^\s*>/.test(line)
    || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || tableStart(lines, index);
}

function renderParagraph(lines: string[], index: number): RenderedMarkdownBlock {
  const paragraph: string[] = [];
  let next = index;
  while (next < lines.length && !blockStart(lines, next)) {
    paragraph.push((lines[next] ?? "").trim());
    next += 1;
  }
  return {
    html: `<p style="${WECHAT_INLINE_STYLE.paragraph}">${renderInlineMarkdown(paragraph.join("\n"))}</p>`,
    next,
  };
}

function skipBlankLines(lines: string[], index: number): number {
  let next = index;
  while (next < lines.length && (lines[next] ?? "").trim() === "") next += 1;
  return next;
}

export function renderMarkdownWechatHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = skipBlankLines(lines, 0);

  const title = STRONG_LINE.exec(lines[index] ?? "")?.[1]
    ?? (HEADING_LINE.exec(lines[index] ?? "")?.[1] === "#"
      ? HEADING_LINE.exec(lines[index] ?? "")?.[2]
      : undefined);
  if (title !== undefined) {
    const leadStart = skipBlankLines(lines, index + 1);
    const lead = renderParagraph(lines, leadStart);
    blocks.push([
      `<header class="article-lead" style="${WECHAT_INLINE_STYLE.lead}">`,
      `<div class="article-kicker" style="${WECHAT_INLINE_STYLE.kicker}">${renderInlineMarkdown(title)}</div>`,
      lead.next === leadStart ? "" : lead.html,
      "</header>",
    ].join(""));
    index = lead.next;
  }

  while (index < lines.length) {
    index = skipBlankLines(lines, index);
    if (index >= lines.length) break;
    const line = lines[index] ?? "";

    const strongTitle = STRONG_LINE.exec(line)?.[1];
    if (strongTitle !== undefined) {
      const titleText = plainInline(strongTitle);
      if (titleText.includes("免责声明")) {
        const contentStart = skipBlankLines(lines, index + 1);
        const content = renderParagraph(lines, contentStart);
        blocks.push([
          `<aside class="article-disclaimer" style="${WECHAT_INLINE_STYLE.disclaimer}">`,
          `<h2 style="${WECHAT_INLINE_STYLE.disclaimerTitle}">${renderInlineMarkdown(strongTitle)}</h2>`,
          content.next === contentStart
            ? ""
            : content.html.replace(
              `style="${WECHAT_INLINE_STYLE.paragraph}"`,
              `style="${WECHAT_INLINE_STYLE.disclaimerText}"`,
            ),
          "</aside>",
        ].join(""));
        index = content.next;
      } else {
        blocks.push(`<h2 class="article-section-title" style="${WECHAT_INLINE_STYLE.sectionTitle}">${renderInlineMarkdown(strongTitle)}</h2>`);
        index += 1;
      }
      continue;
    }

    const heading = HEADING_LINE.exec(line);
    if (heading !== null) {
      const level = Math.min(6, heading[1]?.length ?? 2);
      blocks.push(`<h${level} style="${WECHAT_INLINE_STYLE.heading}">${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }

    if (tableStart(lines, index)) {
      const table = renderTable(lines, index);
      if (table.html !== "") blocks.push(table.html);
      index = table.next;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const language = /^\s*```([\w-]+)/.exec(line)?.[1];
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      const className = language === undefined ? "" : ` class="language-${escapeAttribute(language)}"`;
      blocks.push(`<pre style="${WECHAT_INLINE_STYLE.codeBlock}"><code${className}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const unordered = UNORDERED_ITEM.exec(line);
    const ordered = ORDERED_ITEM.exec(line);
    if (unordered !== null || ordered !== null) {
      const pattern = unordered === null ? ORDERED_ITEM : UNORDERED_ITEM;
      const tag = unordered === null ? "ol" : "ul";
      const items: string[] = [];
      while (index < lines.length) {
        const item = pattern.exec(lines[index] ?? "");
        if (item === null) break;
        const itemText = item[1] ?? "";
        if (tag === "ul" && KEY_MOMENT_LABEL.test(plainInline(itemText))) {
          if (items.length > 0) {
            blocks.push(`<${tag} style="${WECHAT_INLINE_STYLE.list}">${items.join("")}</${tag}>`);
            items.length = 0;
          }
          const keyMoments = renderKeyMoments(lines, index, itemText);
          blocks.push(keyMoments.html);
          index = keyMoments.next;
          break;
        }
        const continuation = renderListContinuations(lines, index + 1);
        items.push([
          `<li style="${WECHAT_INLINE_STYLE.listItem}">`,
          renderInlineMarkdown(itemText),
          continuation.html,
          "</li>",
        ].join(""));
        index = continuation.next;
      }
      if (items.length > 0) {
        blocks.push(`<${tag} style="${WECHAT_INLINE_STYLE.list}">${items.join("")}</${tag}>`);
      }
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote style="${WECHAT_INLINE_STYLE.quote}">${renderInlineMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const paragraph = renderParagraph(lines, index);
    blocks.push(paragraph.html);
    index = paragraph.next;
  }

  return `<section data-wechat-draft="markdown-frame" class="oil-wechat-article" style="${WECHAT_INLINE_STYLE.article}">${blocks.join("\n")}</section>`;
}

function previewBase(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.href.replace(/\/$/, "")}/`;
  } catch {
    return "";
  }
}

/**
 * 在无脚本 iframe 中呈现微信公众号富文本。
 *
 * 微信稿的关键样式位于正文内联 style 中；这里仅补齐目标预览页的白底、留白和
 * 窄屏适配。sandbox 是主要隔离边界，字符串清理和 CSP 提供第二层防护。
 */
export function buildRichArticlePreviewDocument(html: string, origin: string): string {
  const base = previewBase(origin);
  const baseElement = base === "" ? "" : `<base href="${escapeAttribute(base)}">`;
  const body = safePreviewHtml(html);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: blob:; media-src http: https: data: blob:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'none'">
  ${baseElement}
  <style>
    :root { color-scheme: light; background: #ffffff; }
    * { box-sizing: border-box; }
    html, body { min-width: 0; margin: 0; background: #ffffff; }
    body {
      overflow-x: hidden;
      color: #172033;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .article-preview-page {
      width: 100%;
      margin: 0 auto;
      padding: 28px 32px 40px;
      background: #ffffff;
      overflow-wrap: anywhere;
    }
    img, video, svg { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    @media (max-width: 480px) {
      .article-preview-page { padding: 20px 16px 32px; }
    }
  </style>
</head>
<body>
  <main class="article-preview-page">${body}</main>
</body>
</html>`;
}

/**
 * 将本地 Markdown 转换为自包含的公众号富文本预览。
 *
 * 原始 Markdown 全部经过转义，只有渲染器生成的结构进入 iframe；因此即使没有
 * 伴随 HTML 文件，也能安全地复用与公众号稿一致的排版框架。
 */
export function buildMarkdownRichArticlePreviewDocument(markdown: string, origin: string): string {
  const base = previewBase(origin);
  const baseElement = base === "" ? "" : `<base href="${escapeAttribute(base)}">`;
  const body = renderMarkdownWechatHtml(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: blob:; media-src http: https: data: blob:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'none'">
  ${baseElement}
  <style>
    :root { color-scheme: light; background: #ffffff; }
    * { box-sizing: border-box; }
    html, body { min-width: 0; margin: 0; background: #ffffff; }
    body {
      overflow-x: hidden;
      color: #526070;
      font-family: "Songti SC", "Noto Serif CJK SC", "STSong", serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .oil-wechat-article {
      width: 100%;
      margin: 0 auto;
      padding: 28px 32px 44px;
      background: #ffffff;
      overflow-wrap: anywhere;
      font-size: 14px;
      line-height: 1.85;
    }
    .article-lead {
      margin: 0 0 16px;
      padding: 15px 17px 14px;
      border-left: 3px solid #bd7d22;
      background: #fbf8f2;
    }
    .article-kicker {
      margin-bottom: 8px;
      color: #b8781e;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 11px;
      font-weight: 750;
      letter-spacing: .12em;
    }
    .article-lead p { margin: 0; color: #4e5967; }
    .article-disclaimer {
      margin: 0 0 24px;
      padding: 12px 15px;
      border: 1px solid #e5eaf0;
      background: #f6f8fa;
    }
    .article-disclaimer h2 {
      margin: 0 0 5px;
      color: #657181;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 12px;
    }
    .article-disclaimer p { margin: 0; color: #8993a1; font-size: 11px; }
    h1, h2, h3, h4, h5, h6 {
      color: #273342;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.42;
    }
    h1 { margin: 30px 0 14px; font-size: 23px; }
    h2 { margin: 32px 0 14px; font-size: 18px; }
    h3 { margin: 26px 0 10px; font-size: 16px; }
    h4, h5, h6 { margin: 22px 0 8px; font-size: 14px; }
    .article-section-title { margin-top: 24px; font-size: 15px; }
    .section-index {
      width: max-content;
      margin-top: 34px;
      color: #b8781e;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
    }
    .section-index + h2 { margin-top: 3px; }
    p { margin: 0 0 14px; }
    strong { color: #2d3948; font-weight: 750; }
    a { color: #9d661a; text-decoration: underline; text-underline-offset: 3px; }
    ul, ol { margin: 8px 0 18px; padding-left: 1.4em; }
    li { margin: 8px 0; padding-left: .15em; }
    li::marker { color: #bd7d22; }
    blockquote {
      margin: 18px 0;
      padding: 10px 14px;
      border-left: 2px solid #c78a33;
      background: #fbf8f2;
      color: #687483;
    }
    .key-moments {
      margin: 16px 0 24px;
      padding: 13px 16px 12px;
      border-left: 3px solid #c58a2f;
      background: #fbf9f4;
      color: #738195;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .key-moments-title { margin: 0 0 10px; color: #536071; font-size: 12px; }
    .key-moments-list p { margin: 0 0 8px; font-size: 12px; line-height: 1.65; }
    .key-moments-list p:last-child { margin-bottom: 0; }
    .key-moments strong { color: #526175; }
    hr { height: 1px; margin: 24px 0; border: 0; background: #e8e3da; }
    img, video, svg { display: block; max-width: 100%; height: auto; margin: 18px auto; }
    code {
      padding: .12em .35em;
      border-radius: 3px;
      background: #f1f3f5;
      color: #875c20;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: .9em;
    }
    pre { overflow: auto; margin: 18px 0; padding: 14px; background: #22272e; color: #edf2f7; }
    pre code { padding: 0; background: transparent; color: inherit; }
    .signal-row { margin: 13px 0 14px; }
    .signal-heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: baseline;
      margin-bottom: 7px;
      color: #2f3a47;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 12px;
    }
    .signal-heading b { color: #b8781e; font-size: 11px; white-space: nowrap; }
    .signal-track { height: 5px; overflow: hidden; background: #e8edf2; }
    .signal-track span { display: block; height: 100%; background: #b77a20; }
    .signal-row + p {
      margin-top: -9px;
      color: #a1a9b3;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 10px;
    }
    .table-scroll { max-width: 100%; margin: 16px 0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    th, td { padding: 10px 12px; border: 1px solid #e3e7eb; text-align: left; vertical-align: top; }
    th { background: #f8f7f4; color: #33404f; font-size: 12px; }
    td { font-size: 12px; }
    @media (max-width: 480px) {
      .oil-wechat-article { padding: 20px 16px 34px; font-size: 13px; }
      .article-lead { padding: 13px 14px 12px; }
      h2 { font-size: 17px; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
