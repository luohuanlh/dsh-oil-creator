import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from "react";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup, EditorView } from "codemirror";

export interface ArticleEditorHandle {
  insertMarkdown: (markdown: string) => void;
  focus: () => void;
}

interface ArticleEditorProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onImageFiles: (files: File[]) => void;
}

function imageFiles(files: FileList | null): File[] {
  return files === null
    ? []
    : [...files].filter((file) => file.type.startsWith("image/")
      || /\.(?:png|jpe?g|webp|gif|avif)$/i.test(file.name));
}

export const ArticleEditor = forwardRef<ArticleEditorHandle, ArticleEditorProps>(
  function ArticleEditor({ value, label, onChange, onSave, onImageFiles }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView>();
    const onChangeRef = useRef(onChange);
    const onSaveRef = useRef(onSave);
    const onImageFilesRef = useRef(onImageFiles);
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    onImageFilesRef.current = onImageFiles;

    useEffect(() => {
      if (hostRef.current === null) return;
      const view = new EditorView({
        doc: value,
        parent: hostRef.current,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event) {
              const files = imageFiles(event.clipboardData?.files ?? null);
              if (files.length === 0) return false;
              event.preventDefault();
              onImageFilesRef.current(files);
              return true;
            },
            drop(event) {
              const files = imageFiles(event.dataTransfer?.files ?? null);
              if (files.length === 0) return false;
              event.preventDefault();
              onImageFilesRef.current(files);
              return true;
            },
          }),
        ],
      });
      viewRef.current = view;
      return () => {
        viewRef.current = undefined;
        view.destroy();
      };
    }, [label]);

    useEffect(() => {
      const view = viewRef.current;
      if (view === undefined || view.state.doc.toString() === value) return;
      const anchor = Math.min(view.state.selection.main.head, value.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor },
      });
    }, [value]);

    useImperativeHandle(ref, () => ({
      insertMarkdown(markdownText) {
        const view = viewRef.current;
        if (view === undefined) return;
        const selection = view.state.selection.main;
        const before = view.state.doc.sliceString(Math.max(0, selection.from - 1), selection.from);
        const after = view.state.doc.sliceString(selection.to, selection.to + 1);
        const prefix = selection.from > 0 && before !== "\n" ? "\n\n" : "";
        const suffix = selection.to < view.state.doc.length && after !== "\n" ? "\n\n" : "\n";
        const insert = `${prefix}${markdownText}${suffix}`;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert },
          selection: { anchor: selection.from + insert.length },
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
    }), []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRef.current();
      }
    };

    return <div className="articleCodeEditor" ref={hostRef} onKeyDownCapture={onKeyDown} />;
  },
);
