import { useEffect, useState } from "react";
import { X, Pencil, Send, MessageCircle } from "lucide-react";
import { SlideViewer } from "./ContentBits";
import { cutLabel } from "../lib/shoot";

/**
 * 촬영 레퍼런스 한 장마다 댓글 (10/14 세원: "촬영 레퍼런스 한장한장에 코멘트도 달 수 있었으면")
 * ref.notes [{by, text, at}] — 신상 관리 상품 댓글과 같은 모양. 누가 썼는지는 업무일지에서 고른 이 기기 사람(세원·지원).
 */
const who = () => {
  try {
    return { sewon: "세원", jiwon: "지원" }[localStorage.getItem("poclo_journal_me")] || "";
  } catch {
    return "";
  }
};

// 단 날 — 이 기기 시각으로(ISO 앞 10자는 세계 표준시라 한국 새벽엔 하루 전으로 나온다)
const when = (at) => {
  const d = new Date(at);
  return Number.isNaN(+d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};

export function RefNotes({ notes = [], onChange, dark = false, autoFocus = false }) {
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(-1);
  const add = () => {
    const text = note.trim();
    if (!text) return;
    setNote("");
    onChange([...notes, { by: who(), text, at: new Date().toISOString() }]);
  };
  const c = dark
    ? { name: "text-white", text: "text-white/90", sub: "text-white/40", icon: "text-white/40 hover:text-white", del: "text-white/40 hover:text-rose-300", input: "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-rose-400", edit: "border-rose-400 bg-white/10 text-white", btn: "bg-rose-700 hover:bg-rose-600" }
    : { name: "text-stone-700", text: "text-stone-700", sub: "text-stone-400", icon: "text-stone-400 hover:text-stone-700", del: "text-stone-400 hover:text-rose-600", input: "border-stone-300 bg-white text-stone-800 placeholder:text-stone-400 focus:border-rose-600", edit: "border-rose-400 bg-white", btn: "bg-stone-800 hover:bg-stone-700" };
  return (
    <div>
      {notes.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {n.by && <span className={"mt-0.5 shrink-0 text-xs font-semibold " + c.name}>{n.by}</span>}
              {editing === i ? (
                <input
                  autoFocus
                  defaultValue={n.text}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    onChange(t ? notes.map((m, k) => (k === i ? { ...m, text: t } : m)) : notes.filter((_, k) => k !== i));
                    setEditing(-1);
                  }}
                  onKeyUp={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && e.currentTarget.blur()}
                  className={"min-w-0 flex-1 rounded-md border px-2 py-0.5 text-sm outline-none " + c.edit}
                />
              ) : (
                <span className={"min-w-0 flex-1 break-words whitespace-pre-wrap " + c.text}>{n.text}</span>
              )}
              <span className={"mt-0.5 shrink-0 text-[11px] tabular-nums " + c.sub}>{when(n.at)}</span>
              <button type="button" onClick={() => setEditing(i)} aria-label="댓글 고치기" className={"shrink-0 p-0.5 " + c.icon}>
                <Pencil size={12} />
              </button>
              <button type="button" onClick={() => window.confirm("이 댓글을 지울까요?") && onChange(notes.filter((_, k) => k !== i))} aria-label="댓글 지우기" className={"shrink-0 p-0.5 " + c.del}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          autoFocus={autoFocus}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyUp={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder="댓글 — 예: 이 포즈로 하의 찍기 (엔터)"
          className={"min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none " + c.input}
        />
        <button type="button" onClick={add} disabled={!note.trim()} aria-label="댓글 달기" className={"shrink-0 rounded-lg px-3 text-white disabled:opacity-40 " + c.btn}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/** 카드 위 댓글 수 */
export function NoteCount({ n }) {
  if (!n) return null;
  return (
    <span className="flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      <MessageCircle size={10} /> {n}
    </span>
  );
}

/**
 * 크게 보기 + 그 장 댓글. 넓은 화면은 오른쪽 칸, 폰은 사진 아래.
 * refs 는 지금 보는 목록 그대로(넘기는 순서), notes 는 refs 의 최신 값을 읽는다(저장하면 바로 보이게).
 */
export function RefViewer({ refs, urls, start = 0, onClose, onNotes, focusNote = false }) {
  const [at, setAt] = useState(start);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && !e.target.closest?.("input, textarea") && onClose();
    document.addEventListener("keydown", k);
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = keep;
    };
  }, [onClose]);
  const r = refs[at];
  if (!r) return null;
  const tags = [r.shop, ...(r.cuts || []).map(cutLabel), r.place].filter(Boolean);
  return (
    <div className="backdrop-in fixed inset-0 z-[60] flex flex-col bg-black lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-3 py-2 text-white">
          <span className="text-sm text-white/70 tabular-nums">
            {at + 1} / {refs.length}
            <span className="ml-2 hidden text-white/50 sm:inline">← → 넘기기 · Esc 닫기</span>
          </span>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 hover:bg-white/10">
            <X size={22} />
          </button>
        </div>
        <SlideViewer urls={refs.map((x) => urls[x.photo] || x.photoUrl || "")} start={start} onAt={setAt} className="min-h-0 w-full flex-1" />
      </div>
      <aside className="flex max-h-[42vh] shrink-0 flex-col border-t border-white/10 bg-stone-950 text-white lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/80">
                  {t}
                </span>
              ))}
            </div>
          )}
          {r.memo && <p className="mb-3 text-sm whitespace-pre-wrap text-white/70">{r.memo}</p>}
          <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-white/50">
            <MessageCircle size={12} /> 댓글{(r.notes || []).length > 0 && ` ${r.notes.length}`}
          </div>
          <RefNotes key={r.id} dark autoFocus={focusNote} notes={r.notes || []} onChange={(notes) => onNotes(r.id, notes)} />
        </div>
      </aside>
    </div>
  );
}
