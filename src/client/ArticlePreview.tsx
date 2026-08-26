import { useMemo } from "react";

import { rewriteArticleImages } from "../articleMarkdown.ts";
import {
  articlePreviewFormat,
  buildMarkdownRichArticlePreviewDocument,
  buildRichArticlePreviewDocument,
} from "../articlePreview.ts";

export interface ArticlePreviewProps {
  path: string;
  text: string;
  origin: string;
  label: string;
  richHtml: string | undefined;
  title: string;
  author?: string;
  date?: string;
}

export function ArticlePreview({
  path,
  text,
  origin,
  label,
  richHtml,
  title,
  author,
  date,
}: ArticlePreviewProps) {
  const format = richHtml === undefined ? articlePreviewFormat(path, text) : "rich-html";
  const source = richHtml ?? text;
  const richDocument = useMemo(() => {
    const meta = { title, ...(author === undefined ? {} : { author }), ...(date === undefined ? {} : { date }) };
    if (format === "rich-html") return buildRichArticlePreviewDocument(source, origin, meta);
    const markdown = origin === "" ? source : rewriteArticleImages(source, origin);
    return buildMarkdownRichArticlePreviewDocument(markdown, origin, meta);
  }, [author, date, format, origin, source, title]);

  return (
    <div className="article workflowPreview articleLivePreview articleRichPreview">
      <iframe
        className="articleRichPreviewFrame"
        title={label}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={richDocument}
      />
    </div>
  );
}
