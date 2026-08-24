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
}

export function ArticlePreview({ path, text, origin, label, richHtml }: ArticlePreviewProps) {
  const format = richHtml === undefined ? articlePreviewFormat(path, text) : "rich-html";
  const source = richHtml ?? text;
  const richDocument = useMemo(() => {
    if (format === "rich-html") return buildRichArticlePreviewDocument(source, origin);
    const markdown = origin === "" ? source : rewriteArticleImages(source, origin);
    return buildMarkdownRichArticlePreviewDocument(markdown, origin);
  }, [format, origin, source]);

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
