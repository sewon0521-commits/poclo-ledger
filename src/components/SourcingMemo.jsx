import { lazy, Suspense, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { addPhoto, photoUrlOf } from "../lib/notePhotos";

/**
 * 노션식 메모 칸 — 소싱 회차 창 메모(kind 'session') · 촬영 창 메모(kind 'day').
 * 10/25 세원: "각 소싱 회차 창 안의 메모 칸(준비물·모델·소품·동선)도 업무일지 같은 노션식 편집기로 — 예전에 적어 둔 메모는 그대로 보이게"
 *   + 10/26 "촬영 관리도 마찬가지로" (촬영 창 '메모(우리만 봐요)').
 * 글은 회차·촬영일의 memo 칸 그대로 — 업무일지와 같은 글 모양(lib/journalBlocks — '• 점', '■ 소제목', '[사진:키]', 꾸밈 표시 글자).
 * 편집기는 업무일지 것(JournalBlocks NoteEditor)을 소제목 칩·틀·안내 글만 바꿔 쓴다. 메모를 열 때만 받는다(못 받으면 글 칸).
 *
 * 10/25~26 에 있던 날짜별 '메모 탭'(소싱 관리 sourcing_memo · 촬영 관리 shoot_memo)은 10/26 세원
 *   "내가 말한 메모는 소싱 회차 내 메모였어 … 촬영 관리도 빼, 어차피 안 쓸 것 같아"로 뺐다(둘 다 적힌 것 없었음).
 */

const SESSION_HEADS = ["준비물", "모델", "소품", "동선"];
const DAY_HEADS = ["스튜디오 예약·결제", "준비물", "동선"];
const tplOf = (label, heads) => ({
  label,
  blocks: heads.flatMap((h) => [{ type: "heading", props: { level: 3 }, content: h }, { type: "bulletListItem" }]),
  focusAt: 1,
});
const KINDS = {
  session: {
    heads: SESSION_HEADS,
    template: tplOf("틀로 시작 (위 소제목 4개)", SESSION_HEADS),
    placeholder: "준비물 · 모델 · 소품 · 동선",
  },
  day: {
    heads: DAY_HEADS,
    template: tplOf("틀로 시작 (위 소제목 3개)", DAY_HEADS),
    placeholder: "예약·결제 · 준비물 · 동선",
  },
};

/** 노션식 편집기를 못 받았을 때(인터넷 끊김 등) — 글 칸 하나 */
function PlainMemo({ initial, onSave, placeholder }) {
  const [v, setV] = useState(initial || "");
  const timer = useRef(null);
  const last = useRef(initial || "");
  const save = (t) => {
    clearTimeout(timer.current);
    if (t === last.current) return;
    last.current = t;
    onSave(t);
  };
  return (
    <textarea
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        clearTimeout(timer.current);
        const t = e.target.value;
        timer.current = setTimeout(() => save(t), 800);
      }}
      onBlur={(e) => save(e.target.value)}
      placeholder={placeholder}
      className="h-40 w-full resize-y rounded-lg border border-stone-200 bg-white p-3 text-sm outline-none focus:border-rose-600"
    />
  );
}

const NoteEditor = lazy(() =>
  import("./JournalBlocks")
    .then((m) => ({ default: m.NoteEditor }))
    .catch(() => ({ default: PlainMemo })),
);

/** 노션식 메모 칸 — kind 'session'(소싱 회차 창) | 'day'(촬영 창) */
export function MemoEditor({ initial, onSave, online, kind = "session", compact }) {
  const k = KINDS[kind] || KINDS.session;
  return (
    <Suspense
      fallback={
        <div className="flex h-24 items-center justify-center text-stone-300">
          <Loader2 size={18} className="animate-spin" />
        </div>
      }
    >
      <NoteEditor
        initial={initial}
        onSave={onSave}
        upload={(f) => addPhoto(f, online)}
        resolve={(key) => photoUrlOf(key, online)}
        compact={compact}
        heads={k.heads}
        template={k.template}
        placeholder={k.placeholder}
        inlineTemplate
      />
    </Suspense>
  );
}
