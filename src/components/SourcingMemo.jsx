import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, X, CalendarDays } from "lucide-react";
import { changeKey, loadKey, onSettingsChange, watchKeys, md } from "../lib/shoot";
import { dayKey, dayTitle } from "../lib/journal";
import { addPhoto, photoUrlOf } from "../lib/notePhotos";
import { meWho } from "../lib/calendar";

/**
 * 촬영 › 소싱 관리 › 메모 (10/25 세원: "소싱 관리에 업무일지 같은 메모장 —
 *   업무일지에서 쓰는 노션식 편집기(점·번호·체크·제목·⋮⋮ 끌어서 묶음째 옮기기·형광펜·사진 붙여넣기) 그대로,
 *   날짜별 페이지(오늘 날짜로 시작) + 지난 메모 넘겨 보기 + 찾기. 거래처 메모, 신마 검색어, 이번 주 트렌드 생각처럼 소싱 회차를 넘나드는 메모"
 *   + "각 소싱 회차 창 안의 메모 칸(준비물·모델·소품·동선)도 같은 편집기로 — 예전에 적어 둔 메모는 그대로 보이게")
 *
 * 저장: settings 'sourcing_memo' {days: {'YYYY-MM-DD': {text, at, by}}} — 세원·지원이 같이 보고 쓴다(업무일지와 달리 한 장).
 *   글 모양은 업무일지와 같다(lib/journalBlocks — '• 점', '■ 소제목', '[사진:키]', 꾸밈 표시 글자). 빈 날은 지운다.
 *   쓸 때마다 서버 최신을 읽어 그날 것만 바꿔 쓴다(changeKey 조건부 쓰기) — 다른 날 메모는 안 덮는다.
 *   다른 기기에서 바뀌면(방송·4초 확인) 쓰고 있지 않을 때만 칸을 새로 그린다.
 * 소싱 회차 메모는 회차의 memo 칸 그대로(같은 글 모양) — MemoEditor kind="session".
 * 편집기는 업무일지 것(JournalBlocks NoteEditor)을 소제목 칩·틀·안내 글만 바꿔 쓴다. 이 화면을 열 때만 받는다.
 *
 * 10/26 세원: "촬영 관리도 마찬가지로" → 같은 부품(MemoTab)을 촬영 관리 › 메모(settings 'shoot_memo', kind 'shoot')와
 *   촬영 창 메모(촬영일의 memo 칸, kind 'day')가 같이 쓴다. 찾기는 그 화면의 회차·촬영일 메모도 같이(others).
 */

export const MEMO_KEY = "sourcing_memo";
export const SHOOT_MEMO_KEY = "shoot_memo";

const MEMO_HEADS = ["거래처", "신마 검색어", "트렌드·생각", "소싱할 것"];
const SESSION_HEADS = ["준비물", "모델", "소품", "동선"];
const SHOOT_HEADS = ["스튜디오", "모델", "소품", "컷 아이디어"];
const DAY_HEADS = ["스튜디오 예약·결제", "준비물", "동선"];
const tplOf = (label, heads) => ({
  label,
  blocks: heads.flatMap((h) => [{ type: "heading", props: { level: 3 }, content: h }, { type: "bulletListItem" }]),
  focusAt: 1,
});
const KINDS = {
  memo: {
    heads: MEMO_HEADS,
    template: tplOf("틀로 시작 (위 소제목 4개)", MEMO_HEADS),
    placeholder: "거래처 · 검색어 · 트렌드 생각",
  },
  session: {
    heads: SESSION_HEADS,
    template: tplOf("틀로 시작 (위 소제목 4개)", SESSION_HEADS),
    placeholder: "준비물 · 모델 · 소품 · 동선",
  },
  shoot: {
    heads: SHOOT_HEADS,
    template: tplOf("틀로 시작 (위 소제목 4개)", SHOOT_HEADS),
    placeholder: "스튜디오 · 모델 · 소품 · 컷",
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

/** 노션식 메모 칸 — kind 'memo'(메모 탭) | 'session'(소싱 회차 창) */
export function MemoEditor({ initial, onSave, online, kind = "memo", compact }) {
  const k = KINDS[kind];
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

// ---------------------------------------------------------------- 찾기 · 미리 보기

/** 저장 글 → 한 줄 보통 글(꾸밈 표시·점·소제목 기호를 떼고, 사진 줄은 '(사진)') */
export function plainOf(text) {
  return String(text || "")
    .replace(/[⁠-⁤]/g, "")
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*\[사진:[^\]]*\]\s*$/, "(사진)")
        .replace(/^\s*(?:[•◦☐☑✓▾▸>]|■|#{1,3}|\d+[.)]|-{3,}|-(?=\s))\s*/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" · ");
}
const isEmpty = (text) => !plainOf(text).replace(/\(사진\)/g, "x").trim();

/** 찾은 말 둘레만 잘라 보여 주기 + 찾은 말 칠하기 */
function Snippet({ text, q }) {
  const p = plainOf(text);
  const i = q ? p.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <span>{p.slice(0, 90)}</span>;
  const s = Math.max(0, i - 24);
  return (
    <span>
      {s > 0 && "…"}
      {p.slice(s, i)}
      <mark className="rounded bg-amber-200 px-0.5 text-stone-900">{p.slice(i, i + q.length)}</mark>
      {p.slice(i + q.length, i + q.length + 70)}
    </span>
  );
}

// ---------------------------------------------------------------- 메모 탭

export function SourcingMemoTab({ online, sessions = [], onOpenSession }) {
  return (
    <MemoTab
      storeKey={MEMO_KEY}
      kind="memo"
      online={online}
      others={sessions.map((x) => ({ id: x.id, on: x.on || "", title: x.title, memo: x.memo }))}
      otherLabel="소싱 회차"
      onOpenOther={onOpenSession}
    />
  );
}

/** 날짜별 노션식 메모 한 장 — storeKey(settings) · kind(소제목 칩) · others(찾기에 같이 나올 다른 메모 [{id, on, title, memo}]) */
export function MemoTab({ storeKey, kind, online, others = [], otherLabel = "", onOpenOther }) {
  const MEMO_KEY = storeKey;
  const today = dayKey();
  const [days, setDays] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + MEMO_KEY) || "null")?.days || {};
    } catch {
      return {};
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(today);
  const [gen, setGen] = useState(0); // 다른 기기에서 바뀐 글로 칸을 새로 그릴 때
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const focused = useRef(false);
  const shown = useRef(days[today]?.text || ""); // 지금 칸에 있는(내가 마지막으로 저장한) 글
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const reload = useCallback(async () => {
    try {
      const v = await loadKey(MEMO_KEY, online, { days: {} });
      const next = v?.days || {};
      setDays(next);
      setLoaded(true);
      const t = next[dateRef.current]?.text || "";
      if (!focused.current && t !== shown.current) {
        shown.current = t;
        setGen((n) => n + 1);
      }
    } catch (e) {
      setLoaded(true);
      setMsg("메모를 불러오지 못했어요 — " + (e.message || e));
    }
  }, [online, MEMO_KEY]);

  useEffect(() => {
    reload();
    const off = onSettingsChange((k) => k === MEMO_KEY && reload());
    const stop = watchKeys([MEMO_KEY], () => reload());
    return () => {
      off();
      stop();
    };
  }, [reload, MEMO_KEY]);

  // 날짜를 바꾸면 그날 글로 새 칸
  const go = (d) => {
    if (!d || d === date) return;
    shown.current = days[d]?.text || "";
    dateRef.current = d;
    setDate(d);
  };

  const save = useCallback(
    async (d, text) => {
      const empty = isEmpty(text);
      try {
        const v = await changeKey(
          MEMO_KEY,
          online,
          (cur) => {
            const next = { ...(cur?.days || {}) };
            if (empty) delete next[d];
            else next[d] = { text, at: new Date().toISOString(), by: meWho() };
            return { ...(cur || {}), days: next };
          },
          { days: {} },
        );
        if (d === dateRef.current) shown.current = empty ? "" : text;
        setDays(v?.days || {});
      } catch (e) {
        setMsg("저장하지 못했어요 — " + (e.message || e));
        throw e;
      }
    },
    [online, MEMO_KEY],
  );

  const memoDays = useMemo(() => Object.keys(days).filter((k) => !isEmpty(days[k]?.text)).sort().reverse(), [days]);
  const prev = memoDays.find((k) => k < date);
  const next = [...memoDays].reverse().find((k) => k > date && k <= today) || (date < today ? today : null);
  const cur = days[date];

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const mine = memoDays.filter((k) => plainOf(days[k].text).toLowerCase().includes(s)).map((k) => ({ type: "memo", key: k, on: k, text: days[k].text }));
    const ses = others
      .filter((x) => x.memo && plainOf(x.memo).toLowerCase().includes(s))
      .map((x) => ({ type: "other", key: x.id, on: x.on || "", title: x.title, text: x.memo }));
    return [...mine, ...ses].sort((a, b) => (b.on || "").localeCompare(a.on || ""));
  }, [q, memoDays, days, others]);

  return (
    <div className="space-y-3">
      {msg && (
        <p className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}

      {/* 찾기 — 메모 탭 글 + 소싱 회차 메모 */}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder={otherLabel ? `메모 찾기 (${otherLabel} 메모도 같이)` : "메모 찾기"}
          aria-label="메모 찾기"
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pr-9 pl-9 text-sm outline-none focus:border-rose-600"
        />
        {q && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQ("")}
            aria-label="찾기 지우기"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-stone-400 hover:text-stone-700"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {q.trim() ? (
        <section className="rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-500">
            &apos;{q.trim()}&apos; 찾은 것 {hits.length}
          </div>
          {!hits.length ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">없어요 — 다른 말로 찾아 보세요.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {hits.map((h) => (
                <li key={h.type + h.key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (h.type === "memo") {
                        go(h.key);
                        setQ("");
                      } else onOpenOther?.(h.key);
                    }}
                    className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                  >
                    <span className="w-24 shrink-0 text-xs text-stone-500">
                      {h.type === "memo" ? dayTitle(h.on) : `${h.on ? md(h.on) + " " : ""}${otherLabel}`}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-relaxed text-stone-700">
                      {h.type === "other" && h.title && <b className="mr-1 font-semibold text-stone-800">{h.title}</b>}
                      <Snippet text={h.text} q={q.trim()} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* 날짜 넘기기 — ‹ › 는 메모를 적은 날끼리 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!prev}
              onClick={() => go(prev)}
              title={prev ? `${dayTitle(prev)} 메모` : "앞 메모 없음"}
              aria-label="앞 메모"
              className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:border-rose-300 disabled:opacity-30"
            >
              <ChevronLeft size={17} />
            </button>
            <label className="relative flex items-center gap-1.5 rounded-lg px-1 text-base font-bold text-stone-900">
              {dayTitle(date)}
              <CalendarDays size={15} className="text-stone-400" />
              <input type="date" value={date} max={today} onChange={(e) => go(e.target.value)} aria-label="날짜 고르기" className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <button
              type="button"
              disabled={!next}
              onClick={() => go(next)}
              title={next ? `${dayTitle(next)} 메모` : "다음 메모 없음"}
              aria-label="다음 메모"
              className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:border-rose-300 disabled:opacity-30"
            >
              <ChevronRight size={17} />
            </button>
            {date !== today && (
              <button type="button" onClick={() => go(today)} className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100">
                오늘로
              </button>
            )}
            <span className="ml-auto text-[11px] text-stone-400">{cur?.at ? `${cur.by || ""} ${new Date(cur.at).toTimeString().slice(0, 5)} 저장` : ""}</span>
          </div>

          {/* 지난 메모 — 날짜마다 첫 줄 */}
          {memoDays.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" aria-label="지난 메모">
              {memoDays.slice(0, 30).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => go(k)}
                  className={
                    "w-40 shrink-0 rounded-xl border px-2.5 py-1.5 text-left " +
                    (k === date ? "border-rose-300 bg-rose-50" : "border-stone-200 bg-white hover:border-rose-200")
                  }
                >
                  <span className={"block text-[11px] font-semibold " + (k === date ? "text-rose-800" : "text-stone-500")}>{k === today ? `오늘 · ${md(k)}` : dayTitle(k)}</span>
                  <span className="block truncate text-xs text-stone-700">{plainOf(days[k].text).slice(0, 40)}</span>
                </button>
              ))}
            </div>
          )}

          <section
            className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) focused.current = false;
            }}
          >
            {!loaded && !cur ? (
              <div className="flex h-40 items-center justify-center text-stone-300">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              <MemoEditor key={`${date}:${gen}`} initial={cur?.text || ""} onSave={(t) => save(date, t)} online={online} kind={kind} />
            )}
          </section>
          <p className="px-1 text-[11px] leading-relaxed text-stone-400">
            세원·지원이 같이 보는 메모예요. &apos;- &apos; 점 · &apos;1. &apos; 번호 · &apos;[] &apos; 체크 · &apos;/&apos; 메뉴 · 줄 왼쪽 ⋮⋮ 를 끌면 안쪽 줄까지 같이 옮겨져요. 사진은 붙여넣기·끌어다 놓기.
          </p>
        </>
      )}
    </div>
  );
}
