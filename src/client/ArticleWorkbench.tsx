import { useEffect, useRef, useState } from "react";

import type { ArticleMediaResult } from "../types.ts";
import type { CreatorViewFace } from "./face.ts";
import type { CreatorKey } from "./locales.ts";
import { ArticleEditor, type ArticleEditorHandle } from "./ArticleEditor.tsx";
import { ArticlePreview } from "./ArticlePreview.tsx";
import "./ArticleWorkbench.css";

type ArticleWorkbenchProps = Pick<
  CreatorViewFace,
  "getArticleMedia" | "saveArticle" | "prepareArticleImageUpload"
> & {
  id: string;
  path: string;
  previewTitle: string;
  previewAuthor?: string;
  previewDate?: string;
  libraryEpoch: number;
  t: (key: CreatorKey) => string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
};

type ViewMode = "edit" | "preview";

function imageAlt(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[\[\]]/g, "")
    .trim() || "插图";
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function ArticleWorkbench({
  id,
  path,
  previewTitle,
  previewAuthor,
  previewDate,
  libraryEpoch,
  t,
  getArticleMedia,
  saveArticle,
  prepareArticleImageUpload,
  onDirtyChange,
  onSaved,
}: ArticleWorkbenchProps) {
  const [document, setDocument] = useState<ArticleMediaResult>();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ViewMode>("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string>();
  const editorRef = useRef<ArticleEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<ArticleMediaResult>();
  const textRef = useRef("");
  documentRef.current = document;
  textRef.current = text;

  const dirty = document?.found === true && document.editable && text !== document.text;

  const applyDocument = (next: ArticleMediaResult): void => {
    const previous = documentRef.current;
    setDocument(next);
    setText(next.text);
    setMode((current) => previous === undefined
      ? next.editable ? "edit" : "preview"
      : next.editable ? current : "preview");
    setConflict(false);
    setError(undefined);
    if (previous === undefined || previous.revision !== next.revision) setSavedOnce(false);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getArticleMedia(id, path).then((next) => {
      if (cancelled) return;
      const current = documentRef.current;
      const hasLocalChanges = current?.editable === true && textRef.current !== current.text;
      if (hasLocalChanges) {
        if (next.revision !== current.revision) setConflict(true);
        setLoading(false);
        return;
      }
      applyDocument(next);
      setLoading(false);
    }, (cause) => {
      if (cancelled) return;
      setError(errorMessage(cause, t("inspector.article.loadError")));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id, path, libraryEpoch, getArticleMedia, t]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => { onDirtyChange(false); };
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => { window.removeEventListener("beforeunload", protect); };
  }, [dirty]);

  const reloadFromDisk = (): void => {
    setLoading(true);
    void getArticleMedia(id, path).then((next) => {
      applyDocument(next);
      setLoading(false);
    }, (cause) => {
      setError(errorMessage(cause, t("inspector.article.loadError")));
      setLoading(false);
    });
  };

  const save = (): void => {
    if (document?.found !== true || !document.editable || !dirty || saving || uploading) return;
    setSaving(true);
    setError(undefined);
    void saveArticle({
      id,
      path,
      text,
      expectedRevision: document.revision,
    }).then((result) => {
      setDocument((current) => {
        if (current === undefined) return current;
        const next = { ...current, text, revision: result.revision };
        delete next.previewHtml;
        return next;
      });
      setConflict(false);
      setSavedOnce(true);
      setSaving(false);
      onSaved();
    }, (cause) => {
      const message = errorMessage(cause, t("inspector.article.saveError"));
      setConflict(message.includes("外部修改"));
      setError(message);
      setSaving(false);
    });
  };

  const uploadImages = async (files: File[]): Promise<void> => {
    if (files.length === 0 || uploading || document?.editable !== true) return;
    setMode("edit");
    setUploading(true);
    setError(undefined);
    try {
      for (const file of files) {
        const prepared = await prepareArticleImageUpload({
          id,
          articlePath: path,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        });
        const response = await fetch(prepared.url, {
          method: "PUT",
          body: file,
          ...(file.type === "" ? {} : { headers: { "Content-Type": file.type } }),
        });
        const payload = await response.json().catch(() => undefined) as
          | { asset?: { name?: unknown }; error?: unknown }
          | undefined;
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string"
            ? payload.error
            : t("inspector.article.imageError"));
        }
        if (typeof payload?.asset?.name !== "string") {
          throw new Error(t("inspector.article.imageError"));
        }
        editorRef.current?.insertMarkdown(
          `![${imageAlt(file.name)}](${prepared.markdownPrefix}${payload.asset.name})`,
        );
      }
    } catch (cause) {
      setError(errorMessage(cause, t("inspector.article.imageError")));
    } finally {
      setUploading(false);
    }
  };

  if (loading && document === undefined) {
    return <div className="articleWorkbenchEmpty">{t("empty.loading")}</div>;
  }
  if (document?.found !== true) {
    return <div className="articleWorkbenchEmpty">{error ?? t("inspector.article.loadError")}</div>;
  }

  const status = saving
    ? t("inspector.article.saving")
    : uploading
      ? t("inspector.article.imageUploading")
      : conflict
        ? t("inspector.article.conflict")
        : dirty
          ? t("inspector.article.unsaved")
          : savedOnce
            ? t("inspector.article.saved")
            : "";

  return (
    <section className="articleWorkbench" aria-label={t("inspector.article.editor")}>
      <div className="articleEditorToolbar">
        <div className="articleViewSwitch" role="tablist" aria-label={t("inspector.article.viewMode")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            disabled={!document.editable}
            onClick={() => { setMode("edit"); }}
          >
            {t("inspector.article.edit")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => { setMode("preview"); }}
          >
            {t("inspector.article.preview")}
          </button>
        </div>
        <span className={`articleSaveState${conflict ? " conflict" : ""}`} aria-live="polite">
          {status}
        </span>
        {document.editable && (
          <>
            <button
              type="button"
              className="articleToolbarButton"
              disabled={uploading || saving}
              onClick={() => {
                setMode("edit");
                imageInputRef.current?.click();
              }}
            >
              {t("inspector.article.insertImage")}
            </button>
            <input
              ref={imageInputRef}
              className="assetFileInput"
              type="file"
              multiple={true}
              accept=".png,.jpg,.jpeg,.webp,.gif,.avif,image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={(event) => {
                const files = event.currentTarget.files === null
                  ? []
                  : [...event.currentTarget.files];
                event.currentTarget.value = "";
                void uploadImages(files);
              }}
            />
            <button
              type="button"
              className="articleToolbarButton primary"
              disabled={!dirty || saving || uploading || conflict}
              title="⌘/Ctrl + S"
              onClick={save}
            >
              {saving ? t("inspector.article.saving") : t("inspector.article.save")}
            </button>
          </>
        )}
      </div>

      {conflict && (
        <div className="articleConflictBanner">
          <span>{t("inspector.article.conflictHint")}</span>
          <button type="button" onClick={reloadFromDisk}>{t("inspector.article.reload")}</button>
        </div>
      )}
      {error !== undefined && !conflict && <div className="articleEditorError">{error}</div>}
      {!document.editable && (
        <div className="articleReadonlyHint">{t("inspector.article.readonly")}</div>
      )}

      {mode === "edit" && document.editable ? (
        <ArticleEditor
          ref={editorRef}
          value={text}
          label={t("inspector.article.editor")}
          onChange={(next) => {
            setText(next);
            setSavedOnce(false);
            setConflict(false);
          }}
          onSave={save}
          onImageFiles={(files) => { void uploadImages(files); }}
        />
      ) : (
        <ArticlePreview
          path={path}
          text={text}
          origin={document.origin}
          label={t("inspector.article.preview")}
          richHtml={dirty ? undefined : document.previewHtml}
          title={previewTitle}
          {...(previewAuthor === undefined ? {} : { author: previewAuthor })}
          {...(previewDate === undefined ? {} : { date: previewDate })}
        />
      )}
    </section>
  );
}
