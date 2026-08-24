import { useEffect, useRef, useState } from "react";
import {
  Button,
  IconBrowseOutline16,
  IconCloseFill14,
  IconProjectAddOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  Input,
  Modal,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

import { resolveContentType } from "../../contentType.ts";
import type { ContentSummary, ContentType, WorkflowStage } from "../../types.ts";
import { CoverThumb, coverThumbRevision } from "../CoverThumb.tsx";
import type { CreatorViewFace } from "../face.ts";
import { useLibraryEpoch, useSelectedContentId } from "../contentSelection.ts";
import type { CreatorKey } from "../locales.ts";
import { formatRelativeTime } from "../relativeTime.ts";
import { WORKFLOW_TONE } from "./workflowStatus.ts";
import "./ContentSidebarPanel.css";

const CREATE_CONTENT_TYPES: ReadonlyArray<{
  id: ContentType;
  label: CreatorKey;
}> = [
  { id: "video", label: "create.type.video" },
  { id: "article", label: "create.type.article" },
];

function WorkflowStatusDot({
  workflow,
  label,
}: {
  workflow: WorkflowStage;
  label: string;
}) {
  return (
    <span
      className={`workflowStatusDot ${WORKFLOW_TONE[workflow]}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

function ContentTypeGlyph({
  type,
  className,
}: {
  type: ContentType;
  className: string;
}) {
  return (
    <svg className={`contentTypeGlyph ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      {type === "video" && (
        <>
          <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="2" />
          <path className="glyphFill" d="m6.7 6 3.2 2-3.2 2z" />
        </>
      )}
      {type === "article" && (
        <>
          <path d="M4 2.25h5.3L12 5v8.75H4z" />
          <path d="M9.25 2.5V5H12M6 7.5h4M6 10h4" />
        </>
      )}
      {type === "audio" && (
        <>
          <path d="M3 9V7a5 5 0 0 1 10 0v2" />
          <path d="M3 8.5h1.5v3H3zM11.5 8.5H13v3h-1.5z" />
        </>
      )}
    </svg>
  );
}

function DeleteGlyph() {
  return (
    <svg className="rowDeleteGlyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 4.5h9M6 2.75h4M5 4.75l.45 8h5.1l.45-8M6.75 6.5v4.25M9.25 6.5v4.25" />
    </svg>
  );
}

function ContentTypeMark({
  type,
  label,
}: {
  type: ContentType;
  label: string;
}) {
  return (
    <span
      className="rowTypeMark"
      data-content-type={type}
      aria-label={label}
      title={label}
    >
      <ContentTypeGlyph type={type} className="rowTypeIcon" />
    </span>
  );
}

function sortByRecency(items: ContentSummary[]): ContentSummary[] {
  return [...items].sort((a, b) => {
    if (a.recordedAt !== b.recordedAt) return b.recordedAt - a.recordedAt;
    return b.createdMs - a.createdMs;
  });
}

export function ContentSidebarPanel({
  t,
  ready,
  listContents,
  getCoverThumb,
  refreshCatalog,
  createContent,
  deleteContent,
}: CreatorViewFace & {
  t: (key: CreatorKey) => string;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const libraryEpoch = useLibraryEpoch();
  const [selectedId, setSelectedId] = useSelectedContentId();
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [items, setItems] = useState<ContentSummary[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<ContentType>("video");
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ContentSummary>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const loadList = async (nextQuery = query) => {
    if (!ready()) {
      setError(t("empty.remote"));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const result = await listContents(nextQuery, "all");
      setItems(sortByRecency(result.items));
      const currentId = selectedIdRef.current;
      if (nextQuery === "" && currentId !== null && !result.items.some((item) => item.id === currentId)) {
        setSelectedId(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("empty.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadList(query);
    }, 200);
    return () => {
      window.clearTimeout(handle);
    };
  }, [query, libraryEpoch]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) {
        return;
      }
      searchInput.current?.blur();
      if (query !== "") return;
      setSearchOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("click", onClick); };
  }, [searchOpen, query]);

  const closeSearch = (): void => {
    setQuery("");
    setSearchOpen(false);
  };

  const closeCreate = (): void => {
    if (creating) return;
    setCreateOpen(false);
    setCreateName("");
    setCreateType("video");
    setCreateError(undefined);
  };

  const onCreate = async () => {
    const title = createName.trim();
    if (title === "" || creating) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      const created = await createContent(title, createType);
      setCreateOpen(false);
      setCreateName("");
      setCreateType("video");
      await loadList(query);
      setSelectedId(created.id);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : t("create.failed"));
    } finally {
      setCreating(false);
    }
  };

  const closeDelete = (): void => {
    if (deleting) return;
    setDeleteTarget(undefined);
    setDeleteError(undefined);
  };

  const onDelete = async (): Promise<void> => {
    if (deleteTarget === undefined || deleting) return;
    const deletedId = deleteTarget.id;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteContent(deletedId);
      setItems((current) => current.filter((item) => item.id !== deletedId));
      if (selectedIdRef.current === deletedId) setSelectedId(null);
      setDeleteTarget(undefined);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : t("delete.failed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="contentPanel" data-surface="content-panel">
      <div className="catalogMasthead">
        <span className="catalogEyebrow">{t("catalog.eyebrow")}</span>
        <span className="catalogTitle">{t("catalog.title")}</span>
        <span className="catalogCount">
          <strong>{String(items.length).padStart(2, "0")}</strong>
          {t("catalog.unit")}
        </span>
      </div>
      <div className="contentHeader">
        <div className={searchOpen ? "searchSlot expanded" : "searchSlot"}>
          <div
            ref={searchRoot}
            className={searchOpen ? "contentSearch expanded" : "contentSearch"}
            onClick={() => {
              if (searchOpen) return;
              setSearchOpen(true);
            }}
          >
            <Tooltip label={t("toolbar.search")} delayMs={500} disabled={searchOpen}>
              <button
                type="button"
                className="searchButton"
                aria-label={t("toolbar.search.aria")}
                aria-expanded={searchOpen}
                onClick={() => { setSearchOpen(true); }}
              >
                <IconSearchOutline16 size={searchOpen ? 11 : 14} />
              </button>
            </Tooltip>
            <input
              ref={searchInput}
              className="searchInput"
              value={query}
              placeholder={t("toolbar.search")}
              tabIndex={searchOpen ? 0 : -1}
              onChange={(event) => { setQuery(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                closeSearch();
              }}
            />
            {searchOpen && (
              <button
                type="button"
                className="clearButton"
                aria-label={t("toolbar.search.clear")}
                onClick={(event) => {
                  event.stopPropagation();
                  closeSearch();
                }}
              >
                <IconCloseFill14 />
              </button>
            )}
          </div>
        </div>
        <div className={searchOpen ? "headerActions hidden" : "headerActions"}>
          <Tooltip label={t("toolbar.refresh")} delayMs={500}>
            <button
              type="button"
              className="iconButton"
              aria-label={t("toolbar.refresh")}
              onClick={() => {
                void refreshCatalog().then(() => loadList(query));
              }}
            >
              <IconRefreshOutline16 size={16} />
            </button>
          </Tooltip>
          <Tooltip label={t("toolbar.create")} delayMs={500}>
            <button
              type="button"
              className="iconButton"
              aria-label={t("toolbar.create.aria")}
              onClick={() => { setCreateOpen(true); }}
            >
              <IconProjectAddOutline16 size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title={t("create.title")}
        closeLabel={t("create.cancel")}
        footer={(
          <>
            <Button variant="outline" disabled={creating} onClick={closeCreate}>
              {t("create.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={creating || createName.trim() === ""}
              onClick={() => { void onCreate(); }}
            >
              {t("create.confirm")}
            </Button>
          </>
        )}
      >
        <div data-plugin="dsh-oil-creator" data-surface="create-dialog">
          <div className="createTypeField">
            <span id="oil-create-type-label" className="createLabel">
              {t("create.type")}
            </span>
            <div
              className="createTypeTabs"
              role="radiogroup"
              aria-labelledby="oil-create-type-label"
            >
              {CREATE_CONTENT_TYPES.map(({ id, label }) => (
                <label key={id} className="createTypeChoice">
                  <input
                    className="createTypeRadio"
                    type="radio"
                    name="oil-create-type"
                    value={id}
                    checked={createType === id}
                    disabled={creating}
                    onChange={() => { setCreateType(id); }}
                  />
                  <span className="createTypeOption">
                    <ContentTypeGlyph type={id} className="createTypeIcon" />
                    <span>{t(label)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="createField">
            <label className="createLabel" htmlFor="oil-create-name">{t("create.name")}</label>
            <Input
              id="oil-create-name"
              className="createInput"
              value={createName}
              placeholder={t("create.name.placeholder")}
              autoFocus={true}
              disabled={creating}
              onChange={(event) => { setCreateName(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void onCreate();
              }}
            />
          </div>
          {createError !== undefined && <div className="createError">{createError}</div>}
        </div>
      </Modal>
      <Modal
        open={deleteTarget !== undefined}
        onClose={closeDelete}
        title={t("delete.title")}
        closeLabel={t("delete.cancel")}
        footer={(
          <>
            <Button variant="outline" disabled={deleting} onClick={closeDelete}>
              {t("delete.cancel")}
            </Button>
            <Button
              className="deleteConfirmButton"
              data-plugin="dsh-oil-creator"
              variant="primary"
              disabled={deleting}
              onClick={() => { void onDelete(); }}
            >
              {deleting ? t("delete.deleting") : t("delete.confirm")}
            </Button>
          </>
        )}
      >
        <div data-plugin="dsh-oil-creator" data-surface="delete-dialog">
          <p className="deletePrompt">{t("delete.prompt")}</p>
          <strong className="deleteTargetTitle">{deleteTarget?.title}</strong>
          <p className="deleteTrashHint">{t("delete.trashHint")}</p>
          {deleteError !== undefined && <div className="deleteError">{deleteError}</div>}
        </div>
      </Modal>
      <div className="contentList">
        {error !== undefined && <div className="contentEmpty">{error}</div>}
        {error === undefined && items.length === 0 && !loading && (
          <div className="contentEmpty">{t("empty.library")}</div>
        )}
        {items.map((item, index) => {
          const contentType = resolveContentType(item);
          return (
            <div key={item.id} className="contentRowShell">
              <button
                type="button"
                className={item.id === selectedId ? "contentRow selected" : "contentRow"}
                data-workflow={item.workflow}
                data-content-type={contentType}
                onClick={() => {
                  setSelectedId(item.id === selectedId ? null : item.id);
                }}
              >
                <span className="rowIndex" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="rowCover">
                  <CoverThumb
                    id={item.id}
                    load={getCoverThumb}
                    revision={coverThumbRevision(item.covers, item.assets.covers)}
                    fallback={<IconBrowseOutline16 className="coverFallback" size={20} />}
                  />
                </span>
                <span className="rowBody">
                  <span className="rowTitleLine">
                    <ContentTypeMark
                      type={contentType}
                      label={t(`create.type.${contentType}` as CreatorKey)}
                    />
                    <span className="rowTitle">{item.title}</span>
                  </span>
                  <span className="rowMeta">
                    <WorkflowStatusDot
                      workflow={item.workflow}
                      label={t(`inspector.stage.${item.workflow}` as CreatorKey)}
                    />
                    <span className="rowDate">{formatRelativeTime(item.recordedAt, Date.now(), t)}</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="rowDeleteButton"
                aria-label={`${t("delete.action")}：${item.title}`}
                title={t("delete.action")}
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteError(undefined);
                  setDeleteTarget(item);
                }}
              >
                <DeleteGlyph />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
