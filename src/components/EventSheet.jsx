import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { FIELD } from "../lib/shoot";
import { won } from "../lib/sales";
import { newId } from "../lib/id";
import { KINDS, TARGETS, CHANNELS, KIND_TODOS, TEMPLATES, newTodo, resultOf } from "../lib/events";
import { Sheet, SheetHead, Chips } from "./ShootBits";

/**
 * 이벤트 창 — 넣기·보기·고치기 (lib/events.js 머리말).
 * 10/22 이벤트 캘린더(EventsPage)에서 떼어 냄 — 세원: "홈 캘린더 바 선택하면 이벤트 캘린더로 넘어가는 거 — 여기서 수정이나 보거나 하면 좋을텐디"
 *   → 홈 캘린더(HomeCalendar)도 막대를 누르면 이 창을 그 자리에 띄운다. head = 머리 오른쪽에 더 붙일 것(홈: '이벤트 캘린더' 가기).
 */

export function ResultLine({ r }) {
  if (!r) return null;
  const up = r.change != null && r.change >= 0;
  return (
    <span className="text-[11px] text-stone-500 tabular-nums">
      {r.partial ? "지금까지" : "기간"} 매출 <b className="text-stone-800">{won(r.sum)}원</b> · 하루 {won(r.perDay)}원
      {r.change != null && (
        <b className={up ? "text-emerald-700" : "text-rose-700"}>
          {" "}
          ({up ? "+" : ""}
          {Math.round(r.change * 100)}% 직전 {r.days}일보다)
        </b>
      )}
    </span>
  );
}

const EMPTY = { title: "", kind: "promo", start: "", end: "", always: false, target: "", benefit: "", couponNo: "", channels: [], banner: "", todos: [], memo: "" };

export default function EventSheet({ seed, rows, today, onSave, onRemove, onClose, head }) {
  const [x, setX] = useState(() => {
    const v = { ...EMPTY, ...seed };
    return v.todos.length || seed.id ? v : { ...v, todos: (KIND_TODOS[v.kind] || []).map(newTodo) };
  });
  const [todo, setTodo] = useState("");
  const set = (p) => setX((v) => ({ ...v, ...p }));
  const pickKind = (k) => {
    // 할 일을 아직 안 건드렸으면 그 종류의 할 일로 바꿔 깐다
    const untouched = x.todos.every((t) => !t.done) && x.todos.map((t) => t.text).join("|") === (KIND_TODOS[x.kind] || []).join("|");
    set({ kind: k, ...(untouched ? { todos: (KIND_TODOS[k] || []).map(newTodo) } : {}) });
  };
  const applyTemplate = (t) =>
    setX((v) => ({
      ...v,
      title: t.title,
      kind: t.kind,
      always: !!t.always,
      target: t.target || v.target,
      benefit: t.benefit || v.benefit,
      channels: t.channels || v.channels,
      todos: (t.todos || KIND_TODOS[t.kind] || []).map(newTodo),
    }));
  const addTodo = () => {
    const t = todo.trim();
    if (!t) return;
    set({ todos: [...x.todos, newTodo(t)] });
    setTodo("");
  };
  const ok = x.title.trim() && (x.always || x.start);
  const r = resultOf(x, rows, today);
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={seed.id ? x.title || "이벤트" : "이벤트 넣기"} onClose={onClose} right={head} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {!seed.id && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400">틀로 시작</span>
            {TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => applyTemplate(t)} className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-800">
                {t.label}
              </button>
            ))}
          </div>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">이름</span>
          <input value={x.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 겨울 아우터 얼리버드" className={FIELD + " text-base font-semibold"} />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map(([k, label, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={"flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium " + (x.kind === k ? "border-transparent text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                style={x.kind === k ? { background: c } : undefined}
              >
                {x.kind !== k && <span className="h-2 w-2 rounded-full" style={{ background: c }} />}
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">기간</span>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input type="checkbox" checked={x.always} onChange={(e) => set({ always: e.target.checked })} className="accent-rose-700" />
              상시 (기간 없이 계속)
            </label>
          </span>
          {!x.always && (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={x.start} onChange={(e) => set({ start: e.target.value, end: !x.end || x.end < e.target.value ? e.target.value : x.end })} className={FIELD} />
              <input type="date" value={x.end} min={x.start || undefined} onChange={(e) => set({ end: e.target.value })} className={FIELD} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">누구에게</span>
          <Chips list={TARGETS} value={x.target} onChange={(v) => set({ target: v })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-stone-500">혜택</span>
            <input value={x.benefit} onChange={(e) => set({ benefit: e.target.value })} placeholder="예: 3,000원 할인 · 3만 원 이상 · 14일" className={FIELD} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-stone-500">카페24 쿠폰 번호</span>
            <input value={x.couponNo} onChange={(e) => set({ couponNo: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="만든 뒤 적기" className={FIELD + " tabular-nums"} />
          </label>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">어디에 알리나</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => {
              const on = x.channels.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ channels: on ? x.channels.filter((y) => y !== c) : [...x.channels, c] })}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">배너·알림 문구</span>
          <textarea value={x.banner} onChange={(e) => set({ banner: e.target.value })} placeholder={"예: 가을 아우터 얼리버드 10%\n3만 원 이상 · 10/20 ~ 10/26"} className={FIELD + " min-h-[3.5rem] [field-sizing:content]"} />
        </label>
        <div className="space-y-1.5 rounded-xl border border-stone-200 p-3">
          <span className="text-xs font-semibold text-stone-500">
            할 일 <span className="font-normal text-stone-400">{x.todos.filter((t) => t.done).length}/{x.todos.length}</span>
          </span>
          {x.todos.map((t) => (
            <div key={t.id} className="group flex items-center gap-2">
              <input type="checkbox" checked={t.done} onChange={() => set({ todos: x.todos.map((y) => (y.id === t.id ? { ...y, done: !y.done } : y)) })} className="h-4 w-4 shrink-0 accent-rose-700" />
              <input
                value={t.text}
                onChange={(e) => set({ todos: x.todos.map((y) => (y.id === t.id ? { ...y, text: e.target.value } : y)) })}
                className={"min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm outline-none hover:border-stone-200 focus:border-rose-400 " + (t.done ? "text-stone-400 line-through" : "text-stone-800")}
              />
              <button type="button" onClick={() => set({ todos: x.todos.filter((y) => y.id !== t.id) })} aria-label="할 일 빼기" className="p-1 text-stone-300 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <input
              value={todo}
              onChange={(e) => setTodo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTodo();
                }
              }}
              placeholder="할 일 더하기 (엔터)"
              className={FIELD + " py-1.5"}
            />
            <button type="button" onClick={addTodo} aria-label="할 일 더하기" className="rounded-lg border border-stone-200 px-2.5 text-stone-500 hover:border-rose-300 hover:text-rose-700">
              <Plus size={15} />
            </button>
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">메모 · 결과 기록</span>
          <textarea value={x.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 쿠폰 발급 42 · 사용 9 — 다음엔 2만 원 이상으로" className={FIELD + " min-h-[3rem] [field-sizing:content]"} />
        </label>
        {r && (
          <p className="rounded-lg bg-stone-50 px-3 py-2">
            <ResultLine r={r} />
          </p>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {seed.id ? (
          <button type="button" onClick={() => window.confirm(`'${x.title}' 이벤트를 지울까요?`) && onRemove(seed.id)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600">
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span className="text-xs text-stone-400">{!ok ? "이름과 날짜(또는 상시)를 넣으면 저장돼요" : ""}</span>
        )}
        <button
          type="button"
          disabled={!ok}
          onClick={() =>
            onSave({
              ...x,
              title: x.title.trim(),
              end: x.always ? "" : x.end || x.start,
              start: x.always ? "" : x.start,
              todos: x.todos.filter((t) => t.text.trim()),
              id: seed.id || newId("ev"),
              createdAt: seed.createdAt || new Date().toISOString(),
            })
          }
          className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}
