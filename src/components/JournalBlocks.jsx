import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { SideMenuExtension } from "@blocknote/core/extensions";
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
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  useExtensionState,
} from "@blocknote/react";
import { BlockNoteView, lightDefaultTheme } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./journalBlocks.css";
import { Extension, textInputRule } from "@tiptap/core";
import { Highlighter, Loader2, Undo2, Clock, ImagePlus, Sparkles, CornerDownRight, CircleCheck } from "lucide-react";
import { shortDay } from "../lib/journal";
import { textToBlocks, blocksToText, todosToBlocks, blocksToRows, findBlock, flatBlocks, kindOf, isTask, inlineToText } from "../lib/journalBlocks";

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
// 할 일 칸은 한 줄 = 할 일 하나 — 점 · 번호 · 글 줄 · 제목만 (10/11 저녁 세원: "체크박스 없애고 점으로 통일하자")
const TODO_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: S.paragraph,
    heading: S.heading,
    bulletListItem: S.bulletListItem,
    numberedListItem: S.numberedListItem,
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
// 빈 칸에 뜨는 '오늘 틀로 시작' — heads 처럼 쓰는 곳(소싱 관리 메모 등)마다 바꿔 줄 수 있다
const JOURNAL_TEMPLATE = {
  label: "오늘 틀로 시작 — 오늘 한 일 · 메모·생각",
  blocks: [
    { type: "heading", props: { level: 3 }, content: "오늘 한 일" },
    { type: "bulletListItem" },
    { type: "heading", props: { level: 3 }, content: "메모·생각" },
    { type: "paragraph" },
  ],
  focusAt: 1,
};
/** 소제목 이름들로 틀 만들기 — 소제목마다 점 한 줄, 커서는 첫 점 */
export const headsTemplate = (label, heads) => ({
  label,
  blocks: heads.flatMap((h) => [{ type: "heading", props: { level: 3 }, content: h }, { type: "bulletListItem" }]),
  focusAt: 1,
});
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

// 할 일 칸의 '끝냄' — 줄 왼쪽 ✓ 단추·Ctrl+엔터가 부른다
const DoneCtx = createContext(null);

/** 줄에 마우스를 올리면 ⋮⋮ 앞에 뜨는 ✓ — 누르면 그 줄(안쪽 줄까지)을 끝냄 · 끝낸 줄이면 풀기 */
function DoneButton() {
  const Components = useComponentsContext();
  const ctx = useContext(DoneCtx);
  const block = useExtensionState(SideMenuExtension, { selector: (st) => st?.block });
  if (!block || !ctx || !["bulletListItem", "numberedListItem"].includes(block.type)) return null;
  const on = ctx.done.has(block.id);
  return (
    <Components.SideMenu.Button
      className={"bn-button poclo-done" + (on ? " on" : "")}
      label={on ? "끝냄 풀기 (Ctrl+엔터)" : "끝냄 (Ctrl+엔터)"}
      icon={<CircleCheck size={17} />}
      onClick={() => ctx.toggle(block.id)}
    />
  );
}

const dragMenu = () => (
  <DragHandleMenu>
    <RemoveBlockItem>지우기</RemoveBlockItem>
  </DragHandleMenu>
);

/** 글을 고르면 뜨는 꾸미기 막대 — 색·링크·정렬은 저장할 수 없어서 뺐다 */
function Bars({ todo }) {
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
        sideMenu={() =>
          todo ? (
            <SideMenu>
              <DoneButton />
              <DragHandleButton dragHandleMenu={dragMenu} />
            </SideMenu>
          ) : (
            <SideMenu dragHandleMenu={dragMenu} />
          )
        }
      />
    </>
  );
}

/** Ctrl+Shift+H 형광펜 · Ctrl+엔터 체크박스 켜고 끄기 (노션과 같게) · 할 일 칸은 Ctrl+엔터 = 끝냄 */
function useKeys(editor, onDone) {
  return (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.code === "KeyH") {
      e.preventDefault();
      e.stopPropagation();
      editor.toggleStyles({ backgroundColor: "yellow" });
    } else if (mod && !e.shiftKey && e.key === "Enter") {
      const b = editor.getTextCursorPosition().block;
      if (onDone && (b?.type === "bulletListItem" || b?.type === "numberedListItem") && inlineToText(b.content).trim()) {
        e.preventDefault();
        e.stopPropagation();
        onDone(b.id);
      } else if (b?.type === "checkListItem") {
        e.preventDefault();
        e.stopPropagation();
        editor.updateBlock(b, { props: { checked: !b.props.checked } });
      }
    }
  };
}

// ---------------------------------------------------------------- 하루 글

/** heads·template·placeholder 를 안 주면 업무일지 그대로. 소싱 관리 메모(10/25)는 소제목·틀·안내 글만 바꿔 쓴다 */
export function NoteEditor({ initial, onSave, upload, resolve, compact, heads = HEADS, template: tpl = JOURNAL_TEMPLATE, placeholder, inlineTemplate }) {
  const [start] = useState(() => textToBlocks(initial));
  const editor = useCreateBlockNote(
    {
      schema: NOTE_SCHEMA,
      dictionary: placeholder ? dict({ default: "글을 쓰거나 '/' 를 눌러 블록을 골라요", emptyDocument: placeholder }) : NOTE_DICT,
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
  // 틀 넣고 커서는 첫 소제목 아래 점으로
  const template = () => put(tpl.blocks, tpl.focusAt ?? 1);
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
        {heads.map((h) => (
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
      {/* 메모 칸(소싱·촬영)은 '틀로 시작'을 글 위 한 줄로 — 폰에서 안내 글이 두 줄로 꺾이면 겹쳐서 (10/26) */}
      {inlineTemplate && empty && (
        <div className="px-4 pt-2.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={template}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/70 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50"
          >
            <Sparkles size={12} /> {tpl.label}
          </button>
        </div>
      )}
      <div className="relative py-3" onKeyDownCapture={onKey}>
        {empty && !inlineTemplate && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={template}
            className="absolute top-14 left-11 z-10 flex items-center gap-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/70 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-50"
          >
            <Sparkles size={12} /> {tpl.label}
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
 * 할 일 한 칸 — 블록 하나 = 할 일 하나(블록 id = 할 일 id). **점으로 통일**(10/11 저녁 세원: "작대기나 버그가 너무 많아서 체크박스 없애고 점으로").
 * 끝냄 = 줄에 마우스를 올리면 ⋮⋮ 앞에 뜨는 ✓ · Ctrl+엔터 → 그 줄(안쪽 줄까지 묶음째)에 **줄만 긋고 그 자리에 둔다**
 * (10/16 세원: "체크하면 바로 내려가지 말고 그 자리에 그대로 있되 작대기만 그어 줘. 다음 날이 되면 끝낸 일로").
 * 다음 날엔 오늘 칸이 '안 끝낸 것 + 오늘 끝낸 것'만 받으니(JournalPage Todos) 어제 끝낸 줄은 저절로 '끝낸 일'에만 남는다.
 * 한 번 더 누르면 끝냄을 푼다. 끝냄은 글이 아니라 표시라서 줄 긋기는 블록 id 로 거는 CSS(doneCss)로 그린다.
 */
export function TodoEditor({ items, date, today, startOn, placeholder, onCommit }) {
  const [start] = useState(() => todosToBlocks(items));
  const editor = useCreateBlockNote(
    {
      schema: TODO_SCHEMA,
      dictionary: dict({ default: placeholder, emptyDocument: placeholder, bulletListItem: "할 일" }),
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
  const doneOf = (list) => new Map(list.filter((t) => t.done).map((t) => [t.id, t.doneOn || today]));
  const doneMap = useRef(null); // 끝낸 줄: id → 끝낸 날
  if (doneMap.current === null) doneMap.current = doneOf(items);
  const [doneIds, setDoneIds] = useState(() => items.filter((t) => t.done).map((t) => t.id));
  const gone = useRef(new Map()); // 지운 것: id → 할 일
  const lastSig = useRef(sigOf(items));
  const inflight = useRef(0);
  const focused = useRef(false);
  const timer = useRef(null);
  const noteTimer = useRef(null);
  const [note, setNote] = useState(null); // {text, id}

  const say = useCallback((text, id = null) => {
    setNote({ text, id });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 7000);
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const { items: before, onCommit: commit } = latest.current;
    const rows = blocksToRows(editor.document).filter((r) => r.plain);
    const pool = new Map([...before, ...gone.current.values()].map((x) => [x.id, x]));
    const next = rows.map((r) => {
      const old = pool.get(r.id);
      gone.current.delete(r.id);
      const doneOn = doneMap.current.get(r.id) || null;
      return {
        ...(old || { id: r.id, createdOn: today, ...(startOn !== today ? { startOn } : {}) }),
        text: r.text,
        depth: r.depth,
        kind: r.kind,
        box: false,
        done: !!doneOn,
        doneOn,
      };
    });
    const ids = new Set(next.map((x) => x.id));
    const removed = before.filter((x) => !ids.has(x.id));
    for (const x of removed) gone.current.set(x.id, x);

    const sig = sigOf(next);
    if (sig !== lastSig.current || removed.length) {
      lastSig.current = sig;
      inflight.current++;
      Promise.resolve(commit(next, removed.map((x) => x.id))).finally(() => {
        inflight.current--;
      });
    }
    if (removed.length) say(`할 일 ${removed.length}개를 지웠어요 · Ctrl+Z 로 되살려요`);
  }, [editor, today, startOn, say]);
  useEffect(() => () => flush(), [flush]);

  /** 끝냄 켜고 끄기 — 그 줄과 안쪽 줄 묶음째, 바로 저장 */
  const toggleDone = useCallback(
    (id) => {
      const at = findBlock(editor.document, id);
      if (!at) return;
      const group = flatBlocks([at.block]).map((b) => b.id);
      const undo = doneMap.current.has(id);
      for (const b of group) {
        if (undo) doneMap.current.delete(b);
        else doneMap.current.set(b, today);
      }
      setDoneIds([...doneMap.current.keys()]);
      flush();
      if (undo) setNote(null);
      else say(`끝냈어요${group.length > 1 ? ` (${group.length}줄)` : ""} — 줄 그은 채로 두었다가 내일 '끝낸 일'로 옮겨져요`, id);
    },
    [editor, today, flush, say],
  );

  // 다른 데서 바뀐 할 일(끝낸 일 되돌리기·다른 기기) — 쓰는 중이 아니고 보낸 게 없을 때만 칸을 새로
  const sig = sigOf(items);
  useEffect(() => {
    if (focused.current || inflight.current > 0 || sig === lastSig.current) return;
    lastSig.current = sig;
    doneMap.current = doneOf(items);
    setDoneIds([...doneMap.current.keys()]);
    editor.replaceBlocks(editor.document, todosToBlocks(items));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const onKey = useKeys(editor, toggleDone);
  const carried = items.filter((r) => !r.done && isTask(r) && (r.startOn || r.createdOn) < date);
  // 끝낸 줄 — 그 블록 글자만(안쪽 줄은 따로 id 로 걸린다) 줄 긋고 흐리게, 점도 흐리게
  const doneCss = doneIds
    .map((id) => String(id).replace(/[^\w-]/g, ""))
    .filter(Boolean)
    .map(
      (id) =>
        `.poclo-bn.todo .bn-block-outer[data-id="${id}"]>.bn-block>.bn-block-content{opacity:.5}` +
        `.poclo-bn.todo .bn-block-outer[data-id="${id}"]>.bn-block>.bn-block-content .bn-inline-content{text-decoration:line-through;text-decoration-color:#a8a29e}`,
    )
    .join("");
  const ctx = useMemo(() => ({ toggle: toggleDone, done: new Set(doneIds) }), [toggleDone, doneIds]);

  return (
    <DoneCtx.Provider value={ctx}>
      {doneCss && <style>{doneCss}</style>}
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
          <Bars todo />
        </BlockNoteView>
        {note && (
          <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-stone-500">
            {note.text}
            {note.id && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleDone(note.id)}
                className="flex items-center gap-0.5 rounded px-1 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
              >
                <Undo2 size={11} /> 끝냄 풀기
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
                {r.text.replace(/[\u2060-\u2064]/g, "")} ({shortDay(r.startOn || r.createdOn)}부터)
              </span>
            ))}
          </p>
        )}
      </div>
    </DoneCtx.Provider>
  );
}
