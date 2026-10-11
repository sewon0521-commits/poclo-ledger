import { useCallback, useEffect, useRef, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import {
  useCreateBlockNote,
  useBlockNoteEditor,
  useComponentsContext,
  useActiveStyles,
  FormattingToolbarController,
  FormattingToolbar,
  BlockTypeSelect,
  BasicTextStyleButton,
  NestBlockButton,
  UnnestBlockButton,
  SideMenuController,
  SideMenu,
  DragHandleMenu,
  RemoveBlockItem,
} from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./journalBlocks.css";
import { Extension, textInputRule } from "@tiptap/core";
import { Highlighter, Loader2, Undo2, Clock, ImagePlus, Sparkles, CornerDownRight } from "lucide-react";
import { shortDay } from "../lib/journal";
import { textToBlocks, blocksToText, todosToBlocks, blocksToRows, findBlock, flatBlocks, kindOf, inlineToText } from "../lib/journalBlocks";

/**
 * 업무일지 노션식 편집기 (10/11 세원: "우리 업무일지 노션 완전 손민수 할 수 있나? 너무 불편하게 많아.
 * 오늘 할 일에 체크박스 앞에 점 붙는 것도 불편하고 … 이렇게 그룹으로 움직일 수 있게.")
 *
 * BlockNote(노션 같은 블록 편집기, MPL-2.0) — 줄 왼쪽 ⋮⋮ 손잡이를 끌면 안쪽 줄까지 묶음째 옮겨지고, '/' 메뉴·'- '·'[] '·'# '·'> '·'---'·탭 들여쓰기·
 * 글을 고르면 뜨는 꾸미기 막대가 노션과 같다. 저장은 예전 글 모양 그대로(lib/journalBlocks) — 읽기 모양·모아 보기·찾기는 안 바뀐다.
 * 이 파일은 업무일지를 열 때만 받는다(JournalPage 의 lazy). 받기에 실패하면 예전 편집기로 돈다.
 */

const S = defaultBlockSpecs;
const NOTE_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: S.paragraph,
    heading: S.heading,
    bulletListItem: S.bulletListItem,
    numberedListItem: S.numberedListItem,
    checkListItem: S.checkListItem,
    toggleListItem: S.toggleListItem,
    quote: S.quote,
    divider: S.divider,
    image: S.image,
  },
});
// 할 일 칸은 한 줄 = 할 일 하나라 글 블록만
const TODO_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: S.paragraph,
    heading: S.heading,
    bulletListItem: S.bulletListItem,
    numberedListItem: S.numberedListItem,
    checkListItem: S.checkListItem,
    toggleListItem: S.toggleListItem,
  },
});

const dict = (placeholders) => ({ ...ko, placeholders: { ...ko.placeholders, ...placeholders } });
const NOTE_DICT = dict({ default: "글을 쓰거나 '/' 를 눌러 블록을 골라요", emptyDocument: "오늘 있었던 일 · '/' 로 제목·체크박스·토글·사진" });

// 지금 ERP 색(stone + rose-700)·Pretendard 에 맞춘다
const THEME = {
  ...lightDefaultTheme,
  colors: {
    ...lightDefaultTheme.colors,
    editor: { text: "#292524", background: "transparent" },
    menu: { text: "#292524", background: "#ffffff" },
    tooltip: { text: "#fafaf9", background: "#292524" },
    hovered: { text: "#292524", background: "#f5f5f4" },
    selected: { text: "#ffffff", background: "#be123c" },
    disabled: { text: "#a8a29e", background: "#f5f5f4" },
    shadow: "#d6d3d1",
    border: "#e7e5e4",
    sideMenu: "#a8a29e",
  },
  borderRadius: 8,
  fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
};

// '->' → '→' 같은 자동 바꾸기 (10/2 세원: "-> 도 화살표로")
const ARROWS = [
  ["->", "→"],
  ["<-", "←"],
  ["=>", "⇒"],
  [">=", "≥"],
  ["<=", "≤"],
  ["!=", "≠"],
];
const Arrows = Extension.create({
  name: "pocloArrows",
  addInputRules() {
    return ARROWS.map(([a, b]) => textInputRule({ find: new RegExp(a.replace(/[-<>=!]/g, "\\$&") + "$"), replace: b }));
  },
});

// 빨간 맞춤법 밑줄 끄기 (한글에 다 그어져서 — 예전 칸도 껐다)
const TIPTAP = { extensions: [Arrows], editorProps: { attributes: { spellcheck: "false" } } };

const HEADS = ["오늘 한 일", "도매·거래처", "상품·촬영", "콘텐츠", "CS·배송", "메모·생각"];
const nowText = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} `;
};

/** 형광펜 단추 (노란 바탕) — Ctrl+Shift+H 와 같다 */
function HighlightButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();
  const styles = useActiveStyles(editor);
  const on = styles.backgroundColor === "yellow";
  return (
    <Components.FormattingToolbar.Button
      mainTooltip="형광펜"
      secondaryTooltip="Ctrl+Shift+H"
      icon={<Highlighter size={16} />}
      isSelected={on}
      onClick={() => editor.toggleStyles({ backgroundColor: "yellow" })}
    />
  );
}

/** 글을 고르면 뜨는 꾸미기 막대 — 색·링크·정렬은 저장할 수 없어서 뺐다 */
function Bars() {
  return (
    <>
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            <BlockTypeSelect key="type" />
            <BasicTextStyleButton basicTextStyle="bold" key="b" />
            <BasicTextStyleButton basicTextStyle="italic" key="i" />
            <BasicTextStyleButton basicTextStyle="underline" key="u" />
            <BasicTextStyleButton basicTextStyle="strike" key="s" />
            <HighlightButton key="h" />
            <BasicTextStyleButton basicTextStyle="code" key="c" />
            <NestBlockButton key="nest" />
            <UnnestBlockButton key="unnest" />
          </FormattingToolbar>
        )}
      />
      <SideMenuController
        sideMenu={() => (
          <SideMenu
            dragHandleMenu={() => (
              <DragHandleMenu>
                <RemoveBlockItem>지우기</RemoveBlockItem>
              </DragHandleMenu>
            )}
          />
        )}
      />
    </>
  );
}

/** Ctrl+Shift+H 형광펜 · Ctrl+엔터 체크박스 켜고 끄기 (노션과 같게) */
function useKeys(editor) {
  return (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.code === "KeyH") {
      e.preventDefault();
      e.stopPropagation();
      editor.toggleStyles({ backgroundColor: "yellow" });
    } else if (mod && !e.shiftKey && e.key === "Enter") {
      const b = editor.getTextCursorPosition().block;
      if (b?.type === "checkListItem") {
        e.preventDefault();
        e.stopPropagation();
        editor.updateBlock(b, { props: { checked: !b.props.checked } });
      }
    }
  };
}

// ---------------------------------------------------------------- 하루 글

export function NoteEditor({ initial, onSave, upload, resolve, compact }) {
  const [start] = useState(() => textToBlocks(initial));
  const editor = useCreateBlockNote(
    {
      schema: NOTE_SCHEMA,
      dictionary: NOTE_DICT,
      initialContent: start.length ? start : undefined,
      uploadFile: async (file) => `photo:${await upload(file)}`,
      resolveFileUrl: async (url) => (url.startsWith("photo:") ? (await resolve(url.slice(6))) || "" : url),
      _tiptapOptions: TIPTAP,
    },
    [],
  );
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [empty, setEmpty] = useState(() => !start.length);
  const [uploading, setUploading] = useState(0);
  const latest = useRef(null);
  const saved = useRef(null);
  const timer = useRef(null);
  const saveRef = useRef(onSave);
  const file = useRef(null);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(() => {
    // 처음 글(정리된 모양) — 고치지 않았으면 저장 안 함
    const t = blocksToText(editor.document);
    latest.current = t;
    saved.current = t;
  }, [editor]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const t = latest.current;
    if (t == null || t === saved.current) return;
    setState("saving");
    try {
      await saveRef.current(t);
      saved.current = t;
      setState("saved");
    } catch {
      setState("error");
    }
  }, []);
  // 다른 날로 넘기거나 화면을 떠날 때 치던 글을 마저 저장
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  const onChange = () => {
    latest.current = blocksToText(editor.document);
    setEmpty(editor.isEmpty);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  /** 지금 줄 뒤에(빈 줄이면 그 자리에) 블록 넣고 마지막 블록 끝으로 */
  const put = (blocks, focusAt = -1) => {
    const cur = editor.getTextCursorPosition().block;
    const blank = cur && cur.type === "paragraph" && !inlineToText(cur.content).trim() && !cur.children?.length;
    const got = blank ? editor.replaceBlocks([cur], blocks).insertedBlocks : editor.insertBlocks(blocks, cur, "after");
    const last = got.at(focusAt);
    if (last) editor.setTextCursorPosition(last, "end");
    editor.focus();
  };
  // 틀 넣고 커서는 '오늘 한 일' 아래 점으로
  const template = () =>
    put(
      [
        { type: "heading", props: { level: 3 }, content: "오늘 한 일" },
        { type: "bulletListItem" },
        { type: "heading", props: { level: 3 }, content: "메모·생각" },
        { type: "paragraph" },
      ],
      1,
    );
  const addPhotos = async (files) => {
    const list = [...(files || [])].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setUploading((n) => n + list.length);
    try {
      for (const f of list) {
        const key = await upload(f);
        put([{ type: "image", props: { url: `photo:${key}` } }]);
        setUploading((n) => n - 1);
      }
    } catch {
      setUploading(0);
      setState("error");
    }
  };
  const onKey = useKeys(editor);

  return (
    <div className={"poclo-bn" + (compact ? " compact" : "")}>
      {/* 소제목·지금 시각·사진 — 폰에서도 누르기 쉽게 위에 */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-stone-100 px-4 py-2 [scrollbar-width:none]">
        {HEADS.map((h) => (
          <button
            key={h}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => put([{ type: "heading", props: { level: 3 }, content: h }, { type: "bulletListItem" }])}
            className="shrink-0 rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-800"
          >
            {h}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.focus();
            editor.insertInlineContent(nowText());
          }}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
        >
          <Clock size={12} /> 지금 시각
        </button>
        <button type="button" onClick={() => file.current?.click()} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} 사진
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="ml-auto shrink-0 pl-2 text-[11px] text-stone-400">
          {state === "saving" ? "저장 중…" : state === "saved" ? "저장됨" : state === "error" ? <span className="text-rose-600">저장 못 함</span> : ""}
        </span>
      </div>
      <div className="relative py-3" onKeyDownCapture={onKey}>
        {empty && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={template}
            className="absolute top-14 left-11 z-10 flex items-center gap-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/70 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50"
          >
            <Sparkles size={12} /> 오늘 틀로 시작 — 오늘 한 일 · 메모·생각
          </button>
        )}
        <BlockNoteView editor={editor} theme={THEME} onChange={onChange} formattingToolbar={false} sideMenu={false} emojiPicker={false} className="min-h-[11rem]">
          <Bars />
        </BlockNoteView>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 할 일

const sigOf = (items) => items.map((t) => `${t.id}|${t.text}|${t.depth || 0}|${kindOf(t)}|${t.done ? 1 : 0}`).join("\n");

/**
 * 할 일 한 칸 — 블록 하나 = 할 일 하나(블록 id = 할 일 id). 체크박스만 있는 줄(점 없음), '- ' 면 점 목록(그룹 제목처럼).
 * 체크하면 0.7초 뒤 '끝낸 일'로 빠진다(안쪽에 안 끝낸 줄이 있으면 남겨 둠). Ctrl+Z 또는 '되돌리기'로 돌아오면 같은 할 일(적은 날 그대로).
 */
export function TodoEditor({ items, date, today, startOn, hideDone, placeholder, onCommit }) {
  const [start] = useState(() => todosToBlocks(items));
  const editor = useCreateBlockNote(
    {
      schema: TODO_SCHEMA,
      dictionary: dict({ default: placeholder, emptyDocument: placeholder, checkListItem: "할 일" }),
      initialContent: start,
      trailingBlock: false,
      _tiptapOptions: TIPTAP,
    },
    [],
  );
  const latest = useRef({ items, onCommit });
  useEffect(() => {
    latest.current = { items, onCommit };
  });
  // 개발 서버에서만 — 화면 시험이 편집기를 들여다볼 수 있게
  useEffect(() => {
    if (import.meta.env.DEV && startOn === today) window.__todoEditor = editor;
  }, [editor, startOn, today]);
  const hidden = useRef(new Map()); // 끝내서 뺀 것: id → {todo, snap, prevId, nextId, parentId}
  const gone = useRef(new Map()); // 지운 것: id → 할 일
  const lastSig = useRef(sigOf(items));
  const inflight = useRef(0);
  const focused = useRef(false);
  const timer = useRef(null);
  const noteTimer = useRef(null);
  const [note, setNote] = useState(null); // {text, ids}

  const say = (text, ids = []) => {
    setNote({ text, ids });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 7000);
  };

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const { items: before, onCommit: commit } = latest.current;
    // 1) Ctrl+Z·되돌리기로 돌아온 끝낸 할 일 → 체크 풀고 다시 할 일로
    const back = new Map();
    for (const b of flatBlocks(editor.document)) {
      const h = hidden.current.get(b.id);
      if (!h) continue;
      hidden.current.delete(b.id);
      back.set(b.id, { ...h.todo, done: false, doneOn: null });
      if (b.type === "checkListItem" && b.props.checked) editor.updateBlock(b.id, { props: { checked: false } });
    }
    const rows = blocksToRows(editor.document).filter((r) => r.plain);
    const pool = new Map([...before, ...gone.current.values(), ...back.values()].map((x) => [x.id, x]));
    const next = rows.map((r) => {
      const old = pool.get(r.id);
      gone.current.delete(r.id);
      return {
        ...(old || { id: r.id, createdOn: today, ...(startOn !== today ? { startOn } : {}) }),
        text: r.text,
        depth: r.depth,
        kind: r.kind,
        box: r.kind === "check",
        done: r.done,
        doneOn: r.done ? old?.doneOn || today : null,
      };
    });
    const ids = new Set(next.map((x) => x.id));
    const removed = before.filter((x) => !ids.has(x.id) && !hidden.current.has(x.id));
    for (const x of removed) gone.current.set(x.id, x);

    const sig = sigOf(next);
    if (sig !== lastSig.current || removed.length) {
      lastSig.current = sigOf(next.filter((x) => !(hideDone && x.done)));
      inflight.current++;
      Promise.resolve(commit(next, removed.map((x) => x.id))).finally(() => {
        inflight.current--;
      });
    }

    // 2) 끝낸 할 일은 칸에서 빼서 '끝낸 일'로 (10/3 세원: "다 한 일은 체크하면 사라지고 어디 따로 모아지게")
    if (hideDone) {
      const doc = editor.document;
      const doneNow = rows.filter((r) => r.done && !flatBlocks(findBlock(doc, r.id)?.block.children || []).some((c) => c.type === "checkListItem" ? !c.props.checked : inlineToText(c.content).trim()));
      if (doneNow.length) {
        for (const r of doneNow) {
          const at = findBlock(editor.document, r.id);
          if (!at) continue;
          hidden.current.set(r.id, {
            todo: next.find((x) => x.id === r.id),
            snap: { id: at.block.id, type: at.block.type, props: at.block.props, content: at.block.content },
            prevId: at.prev?.id,
            nextId: at.next?.id,
            parentId: at.parent?.id,
          });
          editor.removeBlocks([r.id]);
        }
        // 비면 빈 체크박스 하나 (빈 문단이면 체크가 아니라 글 줄이 돼서)
        const left = editor.document;
        if (left.length === 1 && left[0].type === "paragraph" && !inlineToText(left[0].content).trim() && !left[0].children?.length)
          editor.replaceBlocks([left[0]], [{ type: "checkListItem", props: { checked: false } }]);
        say(`끝낸 일로 옮겼어요${doneNow.length > 1 ? ` (${doneNow.length}개)` : ""}`, doneNow.map((r) => r.id));
      } else if (removed.length) say(`할 일 ${removed.length}개를 지웠어요`);
    }
  }, [editor, today, startOn, hideDone]);
  useEffect(() => () => flush(), [flush]);

  // 다른 데서 바뀐 할 일(끝낸 일 되돌리기·다른 기기) — 쓰는 중이 아니고 보낸 게 없을 때만 칸을 새로
  const sig = sigOf(items);
  useEffect(() => {
    for (const x of items) hidden.current.delete(x.id);
    if (focused.current || inflight.current > 0 || sig === lastSig.current) return;
    lastSig.current = sig;
    editor.replaceBlocks(editor.document, todosToBlocks(items));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const restore = (ids) => {
    for (const id of ids) {
      const h = hidden.current.get(id);
      if (!h) continue;
      const blk = { ...h.snap, props: { ...h.snap.props, checked: false } };
      const doc = editor.document;
      if (h.prevId && findBlock(doc, h.prevId)) editor.insertBlocks([blk], h.prevId, "after");
      else if (h.nextId && findBlock(doc, h.nextId)) editor.insertBlocks([blk], h.nextId, "before");
      else if (h.parentId && findBlock(doc, h.parentId)) {
        const p = findBlock(doc, h.parentId).block;
        editor.updateBlock(p.id, { children: [...(p.children || []), blk] });
      } else if (doc[0]) editor.insertBlocks([blk], doc[0].id, "before");
    }
    setNote(null);
    flush();
  };

  const onKey = useKeys(editor);
  const carried = items.filter((r) => !r.done && kindOf(r) === "check" && (r.startOn || r.createdOn) < date);

  return (
    <div
      className="poclo-bn todo"
      onKeyDownCapture={onKey}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        focused.current = false;
        flush();
      }}
    >
      <BlockNoteView
        editor={editor}
        theme={THEME}
        onChange={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 700);
        }}
        formattingToolbar={false}
        sideMenu={false}
        emojiPicker={false}
      >
        <Bars />
      </BlockNoteView>
      {note && (
        <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-stone-500">
          {note.text}
          {note.ids.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => restore(note.ids)}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
            >
              <Undo2 size={11} /> 되돌리기 <span className="font-normal text-stone-400">Ctrl+Z</span>
            </button>
          )}
        </p>
      )}
      {carried.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-amber-700">
          <CornerDownRight size={10} /> 넘어온 일:{" "}
          {carried.map((r, i) => (
            <span key={r.id}>
              {i > 0 && " · "}
              {r.text.replace(/[⁠-⁤]/g, "")} ({shortDay(r.startOn || r.createdOn)}부터)
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
