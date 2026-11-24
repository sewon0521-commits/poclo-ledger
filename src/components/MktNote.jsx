import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { KEY, FIELDS, noteOf, putMonth, monthStats, yearsOf, man } from "../lib/mktCalendar";

/**
 * 마케팅 캘린더의 '1년 한눈에' + '이 달 노트' (lib/mktCalendar.js 머리말). 마케팅 캘린더(EventsPage) 달력 위에 붙는다.
 * 1년 한눈에 = 1~12월 칸(막대 = 그 달 총매출, 가장 최근 해) — 누르면 그 달로.
 * 이 달 노트 = 올릴 것 · 준비할 것(크게) → 시즌·날씨 · 업계 이슈 · 쇼핑 이슈 → 지난 기록(매출 장부 숫자 + 메모). '고치기'로 그 달만 고쳐 저장.
 */

const BOX = {
  rose: "border-rose-200 bg-rose-50/60",
  amber: "border-amber-200 bg-amber-50/70",
};
const TITLE = { rose: "text-rose-800", amber: "text-amber-800" };

function Lines({ text, empty = "—" }) {
  const ls = (text || "").split("\n").map((x) => x.trim()).filter(Boolean);
  if (!ls.length) return <p className="text-xs text-stone-400">{empty}</p>;
  return (
    <ul className="space-y-0.5 text-[13px] leading-snug text-stone-700">
      {ls.map((l, i) => (
        <li key={i} className={"flex gap-1.5 " + (l.startsWith("⭐") ? "font-semibold text-stone-900" : "")}>
          {!l.startsWith("⭐") && <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-stone-400" />}
          <span className="min-w-0">{l}</span>
        </li>
      ))}
    </ul>
  );
}

function Field({ f, note, form, setForm, editing }) {
  return (
    <div className={"rounded-xl border p-3 " + (f.tone ? BOX[f.tone] : "border-stone-200 bg-white")}>
      <h4 className={"mb-1.5 text-xs font-bold " + (f.tone ? TITLE[f.tone] : "text-stone-500")}>{f.label}</h4>
      {editing ? (
        <textarea
          value={form[f.k] || ""}
          onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
          placeholder={f.hint + " — 한 줄에 하나, 중요한 건 ⭐ 로 시작"}
          rows={f.tone ? 4 : 3}
          className="w-full resize-y rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] leading-snug text-stone-800 focus:border-rose-300 focus:outline-none"
        />
      ) : (
        <Lines text={note[f.k]} />
      )}
    </div>
  );
}

export default function MktNote({ ym, rows, online, onPick, today }) {
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const m = Number(ym.slice(5, 7));

  const load = useCallback(async () => {
    try {
      setSaved(await loadKey(KEY, online));
    } catch {
      setMsg("노트를 불러오지 못했어요. 인터넷을 확인해 주세요.");
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const off = onSettingsChange((k) => k === KEY && load());
    const stop = watchKeys([KEY], (k) => k === KEY && load());
    return () => {
      off();
      stop();
    };
  }, [load]);
  // 달을 바꾸면 고치던 것은 접는다
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setEditing(false);
  }, [ym]);

  const note = noteOf(saved, m);
  const strip = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const mm = i + 1;
        const yy = yearsOf(rows, mm)[0];
        return { m: mm, s: yy ? monthStats(rows, yy, mm) : null };
      }),
    [rows],
  );
  const top = Math.max(1, ...strip.map((x) => x.s?.gross || 0));
  const past = yearsOf(rows, m).map((yy) => monthStats(rows, yy, m));
  const daysIn = (yy, mm) => new Date(yy, mm, 0).getDate();
  const nowYm = today.slice(0, 7);

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      setSaved(await changeKey(KEY, online, putMonth(m, form)));
      setEditing(false);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 1년 한눈에 */}
      <div className="rounded-2xl border border-stone-200 bg-white px-3 pt-2.5 pb-2">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-800">1년 한눈에</h3>
          <span className="text-[11px] text-stone-400">막대 = 그 달 총매출(가장 최근 해) · 누르면 그 달로</span>
        </div>
        <div className="grid grid-cols-12 gap-1">
          {strip.map(({ m: mm, s }) => {
            const on = mm === m;
            const h = s ? Math.max(3, Math.round((s.gross / top) * 44)) : 0;
            return (
              <button
                key={mm}
                type="button"
                // 다음 해 대비라서 '앞으로 올 그 달'로 간다 — 11월에 8월을 누르면 내년 8월(아래 달력·이벤트도 그 달)
                onClick={() => onPick(`${mm >= Number(today.slice(5, 7)) ? today.slice(0, 4) : Number(today.slice(0, 4)) + 1}-${String(mm).padStart(2, "0")}`)}
                aria-pressed={on}
                title={s ? `${s.y}년 ${mm}월 총매출 ${man(s.gross)} · 광고비 ${man(s.ads)}` : `${mm}월 — 매출 기록 없음`}
                className={"flex min-w-0 flex-col items-center rounded-lg px-0.5 pt-1 pb-1 " + (on ? "bg-rose-50 ring-1 ring-rose-300" : "hover:bg-stone-50")}
              >
                <span className="flex h-11 w-full items-end justify-center">
                  {s ? <span className={"w-3/5 max-w-5 rounded-t " + (on ? "bg-rose-600" : "bg-stone-300")} style={{ height: h }} /> : <span className="h-px w-3/5 max-w-5 bg-stone-200" />}
                </span>
                <span className={"mt-0.5 text-[11px] font-semibold tabular-nums " + (on ? "text-rose-800" : "text-stone-600")}>{mm}월</span>
                <span className="hidden truncate text-[9px] text-stone-400 tabular-nums sm:block">{s ? man(s.gross) : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 이 달 노트 */}
      <section className="rounded-2xl border border-stone-200 bg-stone-50/50 p-3">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-stone-900">{m}월 노트</h3>
          {note.draft && !editing && (
            <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
              <Sparkles size={11} /> 초안 — 고쳐서 저장하면 세원님 글로 바뀌어요
            </span>
          )}
          <span className="ml-auto flex gap-1.5">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600">
                  취소
                </button>
                <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  {busy ? "저장 중…" : `${m}월 노트 저장`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setForm(Object.fromEntries(FIELDS.map((f) => [f.k, note[f.k] || ""])));
                  setEditing(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-rose-300"
              >
                <Pencil size={12} /> 고치기
              </button>
            )}
          </span>
        </div>
        {msg && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.slice(0, 2).map((f) => (
            <Field key={f.k} f={f} note={note} form={form} setForm={setForm} editing={editing} />
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {FIELDS.slice(2, 5).map((f) => (
            <Field key={f.k} f={f} note={note} form={form} setForm={setForm} editing={editing} />
          ))}
        </div>
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3">
          <h4 className="mb-1.5 text-xs font-bold text-stone-500">지난 기록</h4>
          {past.length ? (
            <ul className="mb-1.5 space-y-0.5 text-[13px] text-stone-700">
              {past.map((s) => {
                const cur = `${s.y}-${String(s.m).padStart(2, "0")}` === nowYm;
                const part = !cur && s.days < daysIn(s.y, s.m);
                return (
                  <li key={s.y} className="tabular-nums">
                    <b className="font-semibold text-stone-900">
                      {s.y}년 {s.m}월
                    </b>{" "}
                    총매출 {man(s.gross)} · 광고비 {man(s.ads)}
                    {cur && <span className="text-stone-400"> · 오늘까지</span>}
                    {part && <span className="text-amber-700"> · 장부에 {s.days}일치만 있어요</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-1.5 text-xs text-stone-400">이 달 매출 기록이 아직 없어요.</p>
          )}
          {editing ? (
            <textarea
              value={form.record || ""}
              onChange={(e) => setForm({ ...form, record: e.target.value })}
              placeholder={FIELDS[5].hint}
              rows={2}
              className="w-full resize-y rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] leading-snug text-stone-800 focus:border-rose-300 focus:outline-none"
            />
          ) : (
            note.record && <Lines text={note.record} />
          )}
        </div>
      </section>
    </div>
  );
}
