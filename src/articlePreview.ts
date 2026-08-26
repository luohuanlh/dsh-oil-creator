export type ArticlePreviewFormat = "markdown" | "rich-html";

export interface ArticlePreviewMeta {
  title?: string;
  author?: string;
  date?: string;
}

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
  article: "box-sizing:border-box;margin:0 auto;padding:4px 4px 28px;max-width:677px;color:#172033;font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;overflow-wrap:anywhere",
  lead: "margin:0 0 28px;padding:22px 20px;border-left:4px solid #b7791f;background:#f8f6f1",
  kicker: "margin:0 0 8px;color:#b7791f;font-size:12px;font-weight:700;letter-spacing:2px",
  leadText: "margin:0;color:#334155;font-size:16px;line-height:1.9",
  paragraph: "margin:10px 0 0;color:#475569;font-size:15px;line-height:1.9",
  disclaimer: "margin:0 0 26px;padding:18px;border:1px solid #e2e8f0;background:#f8fafc",
  disclaimerTitle: "margin:0 0 8px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:1px",
  disclaimerText: "margin:0;color:#64748b;font-size:13px;line-height:1.8",
  heading: "margin:30px 0 12px;color:#172033;font-size:20px;font-weight:700;line-height:1.4",
  sectionTitle: "margin:26px 0 12px;color:#172033;font-size:17px;font-weight:800;line-height:1.5",
  sectionIndex: "color:#b7791f;font-size:12px;font-weight:700;letter-spacing:1px;vertical-align:middle",
  list: "margin:12px 0 0;padding-left:20px",
  listItem: "margin:0 0 10px;padding:0;color:#475569;font-size:15px;line-height:1.85",
  listCardItem: "margin:0 0 14px;padding:14px 16px;border-left:3px solid #d6b56d;background:#faf8f2;color:#475569;font-size:15px;line-height:1.85;list-style:none",
  listDetail: "margin:10px 0 0;color:#64748b;font-size:14px;line-height:1.8",
  keyMoments: "margin:0 0 14px;padding:14px 16px;border-left:3px solid #d6b56d;background:#faf8f2;color:#475569;font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;list-style:none",
  keyMomentsTitle: "margin:0 0 10px;color:#475569;font-size:15px;line-height:1.85",
  keyMomentEntry: "margin:0 0 8px;color:#64748b;font-size:14px;line-height:1.75",
  signalOverview: "margin:26px 0 0;padding:18px 14px;border:1px solid #e2e8f0;background:#f8fafc",
  signalOverviewTitle: "margin:0;color:#172033;font-size:17px;font-weight:800;line-height:1.5",
  signalOverviewDescription: "margin:4px 0 14px;color:#64748b;font-size:12px;line-height:1.7",
  signalOverviewRule: "height:2px;background:#b7791f",
  signalList: "padding:16px 4px 0",
  signal: "margin:0 0 14px;padding:0",
  signalHeading: "width:100%;border:0;border-collapse:collapse;table-layout:fixed",
  signalName: "width:70%;padding:0;border:0;color:#334155;font-size:13px;font-weight:700;line-height:1.5",
  signalCount: "width:30%;padding:0;border:0;text-align:right;color:#b7791f;font-size:13px;font-weight:800;line-height:1.5",
  signalTrack: "width:100%;margin:6px 0 0;border:0;border-collapse:collapse;table-layout:fixed",
  signalDetail: "margin:5px 0 0;color:#94a3b8;font-size:11px;line-height:1.5",
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
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, (_all, punctuation: string) => (
      preserve(escapeHtml(punctuation))
    ))
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

function markdownTable(lines: string[], index: number): {
  headings: string[];
  rows: string[][];
  next: number;
} {
  const headings = tableCells(lines[index] ?? "");
  let next = index + 2;
  const rows: string[][] = [];
  while (next < lines.length && (lines[next] ?? "").trim() !== "" && (lines[next] ?? "").includes("|")) {
    rows.push(tableCells(lines[next] ?? ""));
    next += 1;
  }
  return { headings, rows, next };
}

function renderSignalRow(name: string, countText: string, detail: string): string {
  const count = Number.parseInt(countText, 10);
  const percentage = Math.min(100, Math.max(12, Math.round(count * 7.7)));
  const remainder = 100 - percentage;
  return [
    `<section class="signal-row" style="${WECHAT_INLINE_STYLE.signal}">`,
    `<table class="signal-heading" style="${WECHAT_INLINE_STYLE.signalHeading}"><tbody><tr>`,
    `<td width="70%" style="${WECHAT_INLINE_STYLE.signalName}">${renderInlineMarkdown(name)}</td>`,
    `<td width="30%" style="${WECHAT_INLINE_STYLE.signalCount}">${escapeHtml(countText)}</td>`,
    "</tr></tbody></table>",
    `<table class="signal-track" style="${WECHAT_INLINE_STYLE.signalTrack}" aria-hidden="true"><tbody><tr>`,
    `<td width="${percentage}%" style="height:8px;padding:0;border:0;background:#b7791f;font-size:0;line-height:8px">&nbsp;</td>`,
    remainder === 0
      ? ""
      : `<td width="${remainder}%" style="height:8px;padding:0;border:0;background:#e2e8f0;font-size:0;line-height:8px">&nbsp;</td>`,
    "</tr></tbody></table>",
    detail === ""
      ? ""
      : `<p class="signal-detail" style="${WECHAT_INLINE_STYLE.signalDetail}">${renderInlineMarkdown(detail)}</p>`,
    "</section>",
  ].join("");
}

function renderTable(lines: string[], index: number): RenderedMarkdownBlock {
  const { headings, rows, next } = markdownTable(lines, index);

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
    return {
      html: renderSignalRow(headings[0] ?? "", plainHeadings[1] ?? "", ""),
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

function sectionHeading(index: string, title: string): string {
  return [
    '<header class="article-section-heading" style="margin:30px 0 12px;padding:0">',
    '<table style="width:100%;margin:0;border:0;border-collapse:collapse"><tbody><tr>',
    `<td class="section-index" width="34" style="padding:0;border:0;${WECHAT_INLINE_STYLE.sectionIndex}">${escapeHtml(index)}</td>`,
    '<td style="padding:0;border:0;vertical-align:middle">',
    `<h2 style="margin:0;color:#172033;font-size:20px;font-weight:700;line-height:1.4">${renderInlineMarkdown(title)}</h2>`,
    "</td></tr></tbody></table>",
    "</header>",
  ].join("");
}

function renderSignalOverview(
  lines: string[],
  index: number,
  title: string,
): RenderedMarkdownBlock {
  const descriptionStart = skipBlankLines(lines, index + 1);
  const description = renderParagraph(lines, descriptionStart);
  let next = skipBlankLines(lines, description.next);
  const signals: string[] = [];

  while (next < lines.length) {
    if (tableStart(lines, next)) {
      const table = markdownTable(lines, next);
      const plainHeadings = table.headings.map(plainInline);
      if (plainHeadings.every((heading) => heading === "")) {
        next = skipBlankLines(lines, table.next);
        continue;
      }
      const count = table.headings.length === 2
        ? /^(\d+)\s*条$/.exec(plainHeadings[1] ?? "")
        : null;
      if (count === null) break;

      next = skipBlankLines(lines, table.next);
      while (tableStart(lines, next)) {
        const spacer = markdownTable(lines, next);
        if (!spacer.headings.map(plainInline).every((heading) => heading === "")) break;
        next = skipBlankLines(lines, spacer.next);
      }

      let detail = "";
      if (next < lines.length && !blockStart(lines, next)) {
        const paragraph = renderParagraph(lines, next);
        detail = lines.slice(next, paragraph.next).map((line) => line.trim()).join("\n");
        next = skipBlankLines(lines, paragraph.next);
      }
      signals.push(renderSignalRow(
        table.headings[0] ?? "",
        plainHeadings[1] ?? "",
        detail,
      ));
      continue;
    }
    break;
  }

  return {
    html: [
      `<section class="signal-overview" style="${WECHAT_INLINE_STYLE.signalOverview}">`,
      `<h2 style="${WECHAT_INLINE_STYLE.signalOverviewTitle}">${renderInlineMarkdown(title)}</h2>`,
      description.next === descriptionStart
        ? ""
        : description.html.replace(
          `style="${WECHAT_INLINE_STYLE.paragraph}"`,
          `style="${WECHAT_INLINE_STYLE.signalOverviewDescription}"`,
        ),
      `<div class="signal-overview-rule" style="${WECHAT_INLINE_STYLE.signalOverviewRule}" aria-hidden="true"></div>`,
      `<div class="signal-list" style="${WECHAT_INLINE_STYLE.signalList}">${signals.join("")}</div>`,
      "</section>",
    ].join(""),
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
      lead.next === leadStart
        ? ""
        : lead.html.replace(
          `style="${WECHAT_INLINE_STYLE.paragraph}"`,
          `style="${WECHAT_INLINE_STYLE.leadText}"`,
        ),
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
      } else if (titleText === "市场关注方向线索分布") {
        const overview = renderSignalOverview(lines, index, strongTitle);
        blocks.push(overview.html);
        index = overview.next;
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
      const sectionIndex = /^\d{2}$/.test(plainInline(tableCells(lines[index] ?? "")[0] ?? ""))
        ? plainInline(tableCells(lines[index] ?? "")[0] ?? "")
        : undefined;
      if (sectionIndex !== undefined) {
        const headingIndex = skipBlankLines(lines, table.next);
        const heading = HEADING_LINE.exec(lines[headingIndex] ?? "");
        if (heading !== null) {
          blocks.push(sectionHeading(sectionIndex, heading[2] ?? ""));
          index = headingIndex + 1;
          continue;
        }
      }
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
          `<li style="${continuation.html === "" ? WECHAT_INLINE_STYLE.listItem : WECHAT_INLINE_STYLE.listCardItem}">`,
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

  const template = markdown.includes("市场关注方向线索分布") && /\|\s*\*\*\d{2}\*\*\s*\|/.test(markdown)
    ? "pre-market"
    : "markdown-frame";
  return `<section data-wechat-draft="${template}" class="oil-wechat-article" style="${WECHAT_INLINE_STYLE.article}">${blocks.join("\n")}</section>`;
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

function previewHeader(meta: ArticlePreviewMeta | undefined): string {
  const title = meta?.title?.trim() ?? "";
  if (title === "") return "";
  const author = meta?.author?.trim() ?? "";
  const date = meta?.date?.trim() ?? "";
  const details = [author, date]
    .filter((value) => value !== "")
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("");
  return [
    '<header class="wechat-preview-header">',
    `<h1>${escapeHtml(title)}</h1>`,
    details === "" ? "" : `<div class="wechat-preview-meta">${details}</div>`,
    "</header>",
  ].join("");
}

/**
 * 在无脚本 iframe 中呈现微信公众号富文本。
 *
 * 微信稿的关键样式位于正文内联 style 中；这里仅补齐目标预览页的白底、留白和
 * 窄屏适配。sandbox 是主要隔离边界，字符串清理和 CSP 提供第二层防护。
 */
export function buildRichArticlePreviewDocument(
  html: string,
  origin: string,
  meta?: ArticlePreviewMeta,
): string {
  const base = previewBase(origin);
  const baseElement = base === "" ? "" : `<base href="${escapeAttribute(base)}">`;
  const body = safePreviewHtml(html);
  const header = previewHeader(meta);
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
      max-width: 717px;
      margin: 0 auto;
      padding: 20px;
      background: #ffffff;
      overflow-wrap: anywhere;
    }
    .wechat-preview-header { max-width: 677px; margin: 0 auto 22px; }
    .wechat-preview-header h1 {
      margin: 0 0 14px;
      color: rgba(0, 0, 0, .9);
      font-size: 22px;
      font-weight: 500;
      line-height: 1.4;
    }
    .wechat-preview-meta { display: flex; flex-wrap: wrap; gap: 8px; color: rgba(0, 0, 0, .3); font-size: 15px; line-height: 20px; }
    img, video, svg { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    @media (max-width: 480px) {
      .article-preview-page { padding: 20px 16px 32px; }
    }
  </style>
</head>
<body>
  <main class="article-preview-page">${header}${body}</main>
</body>
</html>`;
}

/**
 * 将本地 Markdown 转换为自包含的公众号富文本预览。
 *
 * 原始 Markdown 全部经过转义，只有渲染器生成的结构进入 iframe；因此即使没有
 * 伴随 HTML 文件，也能安全地复用与公众号稿一致的排版框架。
 */
export function buildMarkdownRichArticlePreviewDocument(
  markdown: string,
  origin: string,
  meta?: ArticlePreviewMeta,
): string {
  const base = previewBase(origin);
  const baseElement = base === "" ? "" : `<base href="${escapeAttribute(base)}">`;
  const body = renderMarkdownWechatHtml(markdown);
  const header = previewHeader(meta);
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
      font-family: "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .wechat-preview-page {
      width: 100%;
      max-width: 717px;
      margin: 0 auto;
      padding: 20px;
      background: #ffffff;
    }
    .oil-wechat-article {
      width: 100%;
      margin: 0 auto;
      max-width: 677px;
      background: #ffffff;
      overflow-wrap: anywhere;
    }
    .wechat-preview-header { max-width: 677px; margin: 0 auto 22px; }
    .wechat-preview-header h1 {
      margin: 0 0 14px;
      color: rgba(0, 0, 0, .9);
      font-size: 22px;
      font-weight: 500;
      line-height: 1.4;
    }
    .wechat-preview-meta { display: flex; flex-wrap: wrap; gap: 8px; color: rgba(0, 0, 0, .3); font-size: 15px; line-height: 20px; }
    .key-moments-list p:last-child { margin-bottom: 0; }
    strong { color: #334155; font-weight: 700; }
    a { color: #9d661a; text-decoration: underline; text-underline-offset: 3px; }
    li::marker { color: #b7791f; }
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
    .table-scroll { max-width: 100%; margin: 16px 0; overflow-x: auto; }
    table { max-width: 100%; }
    @media (max-width: 480px) {
      .wechat-preview-page { padding: 20px 16px 32px; }
    }
  </style>
</head>
<body><main class="wechat-preview-page">${header}${body}</main></body>
</html>`;
}
