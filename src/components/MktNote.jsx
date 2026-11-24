import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Sparkles, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { dayTitle } from "../lib/journal";
import {
  KEY,
  FIELDS,
  noteOf,
  putMonth,
  monthStats,
  yearsOf,
  man,
  catOf,
} from "../lib/mktCalendar";

/**
 * 마케팅 캘린더 오른쪽 칸 (lib/mktCalendar.js 머리말) — 11/25 세원 "아이보스 마케팅 캘린더처럼 우리 것만 녹여서".
 * 아이보스 오른쪽(시즌 키워드 · 상세 일정 · 마케팅 키워드)을 우리 것으로: 상세 일정 → M월 키워드 → M월 노트(올릴 것·준비할 것·시즌·업계·쇼핑) → 지난 기록 → 1년 한눈에.
 * 넓은 화면에선 달력 오른쪽, 폰에선 달력 아래.
 */

const F = Object.fromEntries(FIELDS.map((f) => [f.k, f]));
const lines = (t) =>
  (t || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const chips = (t) =>
  (t || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function Lines({ text }) {
  const ls = lines(text);
  if (!ls.length) return <p className="text-xs text-stone-400">—</p>;
  return (
    <ul className="space-y-0.5 text-[13px] leading-snug text-stone-700">
      {ls.map((l, i) => (
        <li
          key={i}
          className={
            "flex gap-1.5 " +
            (l.startsWith("⭐") ? "font-semibold text-stone-900" : "")
          }
        >
          {!l.startsWith("⭐") && (
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-stone-400" />
          )}
          <span className="min-w-0">{l}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, right }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-stone-900">{title}</h3>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

const Area = ({ k, form, setForm, rows = 3 }) => (
  <textarea
    value={form[k] || ""}
    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
    placeholder={
      F[k].hint + (F[k].chips ? "" : " — 한 줄에 하나, 중요한 건 ⭐ 로 시작")
    }
    rows={rows}
    className="w-full resize-y rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[13px] leading-snug text-stone-800 focus:border-rose-300 focus:outline-none"
  />
);

export default function MktNote({
  ym,
  rows,
  online,
  onPick,
  today,
  picked,
  onUnpick,
  onOpenEvent,
}) {
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

  const startEdit = () => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.k, note[f.k] || ""])));
    setEditing(true);
  };
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
  const editBtns = editing ? (
    <span className="flex gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600"
      >
        취소
      </button>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        {busy ? "저장 중…" : "저장"}
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={startEdit}
      className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-600 hover:border-rose-300"
    >
      <Pencil size={11} /> 고치기
    </button>
  );
  const pc = picked ? catOf(picked.c) : null;

  return (
    <div className="space-y-3">
      {/* 상세 일정 — 달력에서 누른 것 (폰에선 누르면 여기로 내려온다 — EventsPage pickIssue) */}
      <div id="mkt-detail">
        <Card
          title="상세 일정"
          right={
            picked && (
              <button
                type="button"
                onClick={onUnpick}
                aria-label="상세 닫기"
                className="rounded p-0.5 text-stone-400 hover:text-stone-700"
              >
                <X size={15} />
              </button>
            )
          }
        >
          {picked ? (
            <div className="space-y-1.5">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                style={{ background: pc.bg, color: pc.dot }}
              >
                {pc.label}
              </span>
              <p className="text-base font-bold text-stone-900">{picked.t}</p>
              <p className="text-xs text-stone-500 tabular-nums">
                {picked.period || dayTitle(picked.d)}
              </p>
              {picked.tip && (
                <p className="rounded-lg bg-stone-50 px-2.5 py-2 text-[13px] leading-snug text-stone-700">
                  {picked.tip}
                </p>
              )}
              {picked.event && (
                <button
                  type="button"
                  onClick={() => onOpenEvent(picked.event)}
                  className="text-xs font-semibold text-rose-700 hover:underline"
                >
                  이벤트 열어서 고치기 ›
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-stone-400">
              달력에서 일정을 누르면 자세한 내용이 여기에 보여요.
            </p>
          )}
        </Card>
      </div>

      {/* M월 키워드 */}
      <Card
        title={`${m}월 키워드`}
        right={
          !editing && note.draft ? (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-violet-600">
              <Sparkles size={10} /> 초안
            </span>
          ) : null
        }
      >
        {editing ? (
          <Area k="keywords" form={form} setForm={setForm} rows={2} />
        ) : (
          <div className="flex flex-wrap gap-1">
            {chips(note.keywords).map((c) => (
              <span
                key={c}
                className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-700"
              >
                {c}
              </span>
            ))}
            {!chips(note.keywords).length && (
              <span className="text-xs text-stone-400">—</span>
            )}
          </div>
        )}
      </Card>

      {/* M월 노트 */}
      <Card title={`${m}월 노트`} right={editBtns}>
        {note.draft && !editing && (
          <p className="-mt-1 mb-2 flex items-center gap-1 text-[11px] text-violet-700">
            <Sparkles size={11} /> 초안 — 고쳐서 저장하면 세원님 글로 바뀌어요
          </p>
        )}
        {msg && (
          <p className="mb-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
            {msg}
          </p>
        )}
        <div className="space-y-2">
          {["upload", "prep"].map((k) => (
            <div
              key={k}
              className={
                "rounded-xl border p-2.5 " +
                (k === "upload"
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-amber-200 bg-amber-50/70")
              }
            >
              <h4
                className={
                  "mb-1 text-xs font-bold " +
                  (k === "upload" ? "text-rose-800" : "text-amber-800")
                }
              >
                {F[k].label}
              </h4>
              {editing ? (
                <Area k={k} form={form} setForm={setForm} />
              ) : (
                <Lines text={note[k]} />
              )}
            </div>
          ))}
          {["season", "industry", "shopping"].map((k) => (
            <div key={k} className="border-t border-stone-100 pt-2">
              <h4 className="mb-1 text-[11px] font-bold text-stone-500">
                {F[k].label}
              </h4>
              {editing ? (
                <Area k={k} form={form} setForm={setForm} rows={2} />
              ) : (
                <Lines text={note[k]} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 지난 기록 */}
      <Card title="지난 기록">
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
                  {part && (
                    <span className="text-amber-700">
                      {" "}
                      · 장부에 {s.days}일치만
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mb-1.5 text-xs text-stone-400">
            이 달 매출 기록이 아직 없어요.
          </p>
        )}
        {editing ? (
          <Area k="record" form={form} setForm={setForm} rows={2} />
        ) : (
          note.record && <Lines text={note.record} />
        )}
      </Card>

      {/* 1년 한눈에 */}
      <Card
        title="1년 한눈에"
        right={
          <span className="text-[10px] text-stone-400">
            그 달 총매출 · 누르면 그 달로
          </span>
        }
      >
        <div className="grid grid-cols-12 gap-0.5">
          {strip.map(({ m: mm, s }) => {
            const on = mm === m;
            const h = s ? Math.max(3, Math.round((s.gross / top) * 40)) : 0;
            return (
              <button
                key={mm}
                type="button"
                // 다음 해 대비 — '앞으로 올 그 달'로(11월에 8월 → 내년 8월)
                onClick={() =>
                  onPick(
                    `${mm >= Number(today.slice(5, 7)) ? today.slice(0, 4) : Number(today.slice(0, 4)) + 1}-${String(mm).padStart(2, "0")}`,
                  )
                }
                aria-pressed={on}
                title={
                  s
                    ? `${s.y}년 ${mm}월 총매출 ${man(s.gross)} · 광고비 ${man(s.ads)}`
                    : `${mm}월 — 매출 기록 없음`
                }
                className={
                  "flex min-w-0 flex-col items-center rounded-md pt-1 pb-0.5 " +
                  (on ? "bg-rose-50 ring-1 ring-rose-300" : "hover:bg-stone-50")
                }
              >
                <span className="flex h-10 w-full items-end justify-center">
                  {s ? (
                    <span
                      className={
                        "w-3/5 rounded-t " +
                        (on ? "bg-rose-600" : "bg-stone-300")
                      }
                      style={{ height: h }}
                    />
                  ) : (
                    <span className="h-px w-3/5 bg-stone-200" />
                  )}
                </span>
                <span
                  className={
                    "mt-0.5 text-[10px] font-semibold tabular-nums " +
                    (on ? "text-rose-800" : "text-stone-500")
                  }
                >
                  {mm}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
