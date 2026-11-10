import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus, Undo2 } from "lucide-react";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "../lib/shoot";

/**
 * 매일 보고 맨 위 '세원 할 일' (2026-11-10, 세원: "내가 맨날 말해야 되는데 일일보고에 할 일 적어 주면 안 돼? 너가 말하는 것처럼").
 * 저장 settings 'sewon_todo' {items:[{id, group, title, how, window, addedOn, done, doneOn, doneBy}]}
 * 어느 창의 Claude 든 사무실 PC 에서 `python poclo-cafe24/todo.py add 급함 "제목" --how "…" --window "창 이름"` / `done <번호>` 로 넣고 끝낸다.
 * 여기서는 체크 = 끝(끝난 건 접힘) · 되돌리기 · 직접 넣기.
 */

const KEY = "sewon_todo";
const GROUPS = [
  ["urgent", "🔥 급함", "border-rose-200 bg-rose-50/40"],
  ["office", "🏢 사무실에서 손으로", "border-stone-200 bg-white"],
  ["answer", "✋ 답만 주면 됨", "border-stone-200 bg-white"],
];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const newId = () => "t" + Date.now().toString(16).slice(-7);

function Item({ x, onToggle }) {
  return (
    <li className="flex gap-2.5 py-2">
      <button type="button" onClick={() => onToggle(x)} aria-label={x.done ? "다시 안 끝난 것으로" : "끝냄"} className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition " + (x.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white hover:border-rose-500")}>
        {x.done && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={"text-sm font-medium leading-snug " + (x.done ? "text-stone-400 line-through" : "text-stone-900")}>{x.title}</div>
        {x.how && !x.done && <p className="mt-0.5 text-xs leading-relaxed whitespace-pre-line text-stone-500">{x.how}</p>}
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-stone-400">
          {x.window && <span className="rounded bg-stone-100 px-1.5 text-stone-600">{x.window}</span>}
          {x.addedOn && <span>{md(x.addedOn)} 넣음</span>}
          {x.done && x.doneOn && <span>{md(x.doneOn)} 끝냄</span>}
        </div>
      </div>
    </li>
  );
}

function AddForm({ onAdd, onClose }) {
  const [group, setGroup] = useState("urgent");
  const [title, setTitle] = useState("");
  const [how, setHow] = useState("");
  const [win, setWin] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ id: newId(), group, title: title.trim(), how: how.trim(), window: win.trim(), addedOn: today(), done: false });
    onClose();
  };
  return (
    <form onSubmit={submit} className="space-y-2 border-t border-stone-100 px-4 py-3">
      <div className="flex flex-wrap gap-1">
        {GROUPS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setGroup(k)} className={"rounded-full border px-2.5 py-0.5 text-xs " + (group === k ? "border-rose-700 bg-rose-700 font-semibold text-white" : "border-stone-200 text-stone-600")}>
            {l}
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="할 일 한 줄" className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-600" />
      <textarea value={how} onChange={(e) => setHow(e.target.value)} rows={2} placeholder="방법 (화면 이름 그대로 클릭 순서, 선택)" className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-600" />
      <div className="flex gap-2">
        <input value={win} onChange={(e) => setWin(e.target.value)} placeholder="어느 창 일 (선택)" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm outline-none focus:border-rose-600" />
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
          닫기
        </button>
        <button type="submit" disabled={!title.trim()} className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          넣기
        </button>
      </div>
    </form>
  );
}

export default function SewonTodo({ online }) {
  const [items, setItems] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadKey(KEY, online, { items: [] })
        .then((v) => alive && setItems(v.items || []))
        .catch(() => alive && setItems((s) => s || []));
    load();
    const off1 = onSettingsChange((k) => k === KEY && load());
    const off2 = watchKeys([KEY], load, 15000); // 다른 창의 Claude 가 todo.py 로 넣으면 15초 안에 보인다
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);

  const save = async (change) => {
    setErr("");
    setItems((s) => change({ items: s || [] }).items); // 누르면 바로 바뀌고, 저장은 뒤에서
    try {
      const v = await changeKey(KEY, online, change, { items: [] });
      setItems(v.items || []);
    } catch (e) {
      setErr(e.message || "저장하지 못했어요. 한 번 더 눌러 주세요.");
      loadKey(KEY, online, { items: [] }).then((v) => setItems(v.items || [])).catch(() => {});
    }
  };
  const toggle = (x) =>
    save((v) => ({
      ...v,
      items: (v.items || []).map((y) => (y.id === x.id ? (y.done ? { ...y, done: false, doneOn: "", doneBy: "" } : { ...y, done: true, doneOn: today(), doneBy: "ERP" }) : y)),
    }));
  const add = (item) => save((v) => ({ ...v, items: [...(v.items || []), item] }));

  if (!items) return null;
  const open = items.filter((x) => !x.done);
  const done = items.filter((x) => x.done).sort((a, b) => (b.doneOn || "").localeCompare(a.doneOn || ""));

  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h3 className="text-sm font-bold text-stone-900">
          세원 할 일 <span className="ml-1 font-semibold text-rose-700">{open.length}</span>
        </h3>
        <button type="button" onClick={() => setAdding(!adding)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100">
          <Plus size={13} /> 넣기
        </button>
      </div>
      {err && <p className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{err}</p>}
      {!open.length ? (
        <p className="px-4 pb-3 text-xs text-stone-400">지금은 할 일이 없어요.</p>
      ) : (
        <div className="grid gap-3 px-4 pb-3 lg:grid-cols-3">
          {GROUPS.map(([k, label, tone]) => {
            const rows = open.filter((x) => (x.group || "urgent") === k);
            return (
              <div key={k} className={"rounded-xl border px-3 pt-2.5 " + tone}>
                <div className="text-xs font-bold text-stone-700">
                  {label} <span className="font-normal text-stone-400">{rows.length}</span>
                </div>
                {rows.length ? (
                  <ul className="divide-y divide-stone-100">
                    {rows.map((x) => (
                      <Item key={x.id} x={x} onToggle={toggle} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-xs text-stone-400">없어요</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {adding && <AddForm onAdd={add} onClose={() => setAdding(false)} />}
      {done.length > 0 && (
        <div className="border-t border-stone-100 px-4">
          <button type="button" onClick={() => setShowDone(!showDone)} className="flex w-full items-center gap-1 py-2 text-xs text-stone-500 hover:text-stone-800">
            <ChevronDown size={13} className={showDone ? "rotate-180" : ""} /> 끝난 것 {done.length}개
          </button>
          {showDone && (
            <ul className="divide-y divide-stone-100 pb-2">
              {done.slice(0, 30).map((x) => (
                <li key={x.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <Check size={12} className="shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-stone-500 line-through">{x.title}</span>
                  <span className="shrink-0 text-stone-400">{md(x.doneOn)}</span>
                  <button type="button" onClick={() => toggle(x)} className="flex shrink-0 items-center gap-0.5 text-stone-400 hover:text-rose-700">
                    <Undo2 size={11} /> 되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
