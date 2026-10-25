import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Clock, Copy, ExternalLink, Link2, Loader2, Lock, MapPin, Plus, RefreshCw, Shirt, Trash2, Unlock, Users, X } from "lucide-react";
import { FIELD, md, loadKey, changeKey, upsert, remove, codiName, codiItems } from "../lib/shoot";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { stylingLine } from "../lib/styling";
import { buildSheet, createSheet, updateSheet, sheetLink, sheetDm, SHEET_DAYS, SheetError } from "../lib/shootSheet";
import { Photo } from "./ShootBits";
import StylingSheet from "./Styling";

/**
 * 촬영 › 촬영 관리 (10/25) — 세원: "소싱 관리랑 촬영 관리랑 따로 나눠야 할 것 같기도 하고. 모델분들도 다른 건 다 못 보게 하고 촬영 관리만 볼 수 있게"
 *   → 소싱 관리(무엇을 살지)와 나눠, 촬영일마다 그날 찍을 코디 · 스타일링 · 시간·장소·모델을 한 곳에.
 *   모델에게는 계정 대신 '촬영 시트 링크'(lib/shootSheet.js — 고른 칸만 담은 스냅숏, 로그인 없이 #sheet=<토큰>).
 *
 * 촬영일 = 코디들의 촬영일(shoot_codis.shootDate) + 직접 만든 촬영(settings shoot_days).
 * settings shoot_days {items:[{id, on, time, place, models:[이름], modelNote, memo, cuts:[{id,text,done}], videos:[…], sheetToken, sheetAt, sheetClosed}]}
 *   한 날짜에 한 줄. 코디만 있는 날은 창을 열고 무언가 고칠 때 그 날짜 줄이 생긴다.
 */

const DAYS_KEY = "shoot_days";
const STUDIO = "우베리 스튜디오 (서울 서대문구 북아현로 100, 2층)";

const wd = (d) => (d ? "일월화수목금토"[new Date(d + "T00:00:00").getDay()] : "");
const dday = (d) => {
  if (!d) return "";
  const n = Math.round((new Date(d + "T00:00:00") - new Date(dayKey() + "T00:00:00")) / 86400000);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n > 0 ? `D-${n}` : `${-n}일 전`;
};
const timeText = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
function CopyBtn({ text, children, primary }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={
        "flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold " +
        (primary ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-stone-200 bg-white text-stone-700 hover:border-rose-300 hover:text-rose-800")
      }
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "복사했어요" : children}
    </button>
  );
}

/** shoot_days 읽고 쓰기 (서버 최신을 읽어 한 줄만 바꿔 쓰기 — lib/shoot changeKey) */
function useDays(online) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poclo_" + DAYS_KEY) || "null")?.items || [];
    } catch {
      return [];
    }
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    loadKey(DAYS_KEY, online)
      .then((v) => alive && setItems(v.items || []))
      .catch(() => alive && setMsg("촬영 목록을 불러오지 못했어요. 인터넷을 확인해 주세요."));
    return () => {
      alive = false;
    };
  }, [online]);
  const change = useCallback(
    async (fn) => {
      try {
        const next = await changeKey(DAYS_KEY, online, fn);
        setItems(next.items || []);
      } catch (e) {
        setMsg(e.message || "저장하지 못했어요.");
      }
    },
    [online],
  );
  return { items, msg, setMsg, save: (it) => change(upsert(it)), drop: (id) => change(remove(id)) };
}

/** 체크 목록 — 찍을 컷 · 찍을 영상 */
function CheckList({ title, list = [], onChange, placeholder }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v) onChange([...list, { id: newId("k"), text: v, done: false }]);
    setTyped("");
  };
  const done = list.filter((x) => x.done).length;
  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1.5 flex items-center justify-between text-sm font-semibold text-stone-800">
        {title}
        {list.length > 0 && <span className="text-xs font-normal text-stone-400">{done}/{list.length}</span>}
      </div>
      <ul className="space-y-1">
        {list.map((x) => (
          <li key={x.id} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(list.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))}
              aria-pressed={x.done}
              className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 " + (x.done ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white")}
            >
              {x.done && <Check size={12} strokeWidth={3} />}
            </button>
            <span className={"min-w-0 flex-1 text-sm " + (x.done ? "text-stone-400 line-through" : "text-stone-800")}>{x.text}</span>
            <button type="button" onClick={() => onChange(list.filter((y) => y.id !== x.id))} aria-label="빼기" className="p-1 text-stone-300 opacity-0 group-hover:opacity-100 hover:text-rose-700 max-sm:opacity-100">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-400"
      />
    </div>
  );
}

/** 모델 이름 칩 — 적고 엔터 */
function Models({ value = [], onChange }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setTyped("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((m) => (
        <span key={m} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
          {m}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== m))} aria-label={`${m} 빼기`} className="text-rose-400 hover:text-rose-800">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder="모델 이름 (엔터)"
        className="w-36 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
      />
    </div>
  );
}

/** 그날 코디 카드 — 누르면 스타일링 */
function CodiRow({ c, d, onStyle }) {
  const its = codiItems(c, d.items);
  const line = stylingLine(c.styling, d.items);
  return (
    <button type="button" onClick={onStyle} className="flex w-full gap-3 rounded-xl border border-stone-200 bg-white p-2.5 text-left hover:border-rose-300">
      <span className="flex shrink-0 gap-1">
        {its.slice(0, 3).map((x) => (
          <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-11 rounded-md" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold text-stone-900">{codiName(c, d.items)}</span>
        {line ? (
          <span className="mt-0.5 block truncate text-xs text-rose-800">{line}</span>
        ) : (
          <span className="mt-0.5 block text-xs text-amber-700">스타일링 정하기 — 헤어 · 신발 · 악세서리</span>
        )}
        {c.uploadOn && <span className="block text-[11px] text-stone-400">{md(c.uploadOn)} 업로드</span>}
      </span>
    </button>
  );
}

/** 모델에게 보낼 촬영 시트 링크 */
function SheetLink({ day, set, codis, d, online }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const today = dayKey();
  const run = async (what) => {
    setBusy(what);
    setErr("");
    try {
      if (what === "make") {
        const data = await buildSheet(day, codis, d, online);
        const token = await createSheet(online, data);
        set({ sheetToken: token, sheetAt: new Date().toISOString(), sheetClosed: false });
      } else if (what === "refresh") {
        const data = await buildSheet(day, codis, d, online);
        await updateSheet(online, day.sheetToken, { data, closed: false });
        set({ sheetAt: new Date().toISOString(), sheetClosed: false });
      } else if (what === "close") {
        await updateSheet(online, day.sheetToken, { closed: true });
        set({ sheetClosed: true });
      } else if (what === "open") {
        await updateSheet(online, day.sheetToken, { closed: false });
        set({ sheetClosed: false });
      }
    } catch (e) {
      setErr(e instanceof SheetError && e.code === "missing" ? "missing" : e.message || "하지 못했어요.");
    } finally {
      setBusy("");
    }
  };
  const age = day.sheetAt ? Math.round((new Date(today + "T00:00:00") - new Date(dayKey(new Date(day.sheetAt)) + "T00:00:00")) / 86400000) : 0;
  const old = age >= SHEET_DAYS - 1;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <Link2 size={15} className="text-rose-700" /> 모델에게 보낼 촬영 시트
      </div>
      <p className="mb-2 text-xs text-stone-500">
        모델은 로그인 없이 이 날 시간·장소·코디·스타일링·참고 사진만 봐요. 도매가·판매가·거래처·내부 메모는 안 들어가요.
      </p>
      {err === "missing" ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          촬영 시트 준비가 아직 안 됐어요 — Supabase SQL 을 한 번 실행해 주세요:{" "}
          <a href="https://supabase.com/dashboard/project/prbsdwmlnigpjcfkvivd/sql/new" target="_blank" rel="noreferrer" className="font-semibold underline">
            SQL Editor 열기
          </a>{" "}
          → <b>poclo-ledger/supabase/shoot_sheets.sql</b> 전부 붙여넣고 Run.
        </div>
      ) : err ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>
      ) : null}
      {!day.sheetToken ? (
        <button
          type="button"
          disabled={!!busy || !day.on}
          onClick={() => run("make")}
          className="mt-1 flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          {busy === "make" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} 모델에게 보낼 링크 만들기
        </button>
      ) : (
        <div className="mt-1 space-y-2">
          <div className={"flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 " + (day.sheetClosed ? "border-stone-200 opacity-60" : "border-stone-200")}>
            <input readOnly value={sheetLink(day.sheetToken)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-xs text-stone-700 outline-none" />
            {day.sheetClosed ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                <Lock size={11} /> 닫힘
              </span>
            ) : (
              <a href={sheetLink(day.sheetToken)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-700">
                열어 보기 <ExternalLink size={11} />
              </a>
            )}
          </div>
          {!day.sheetClosed && (
            <div className="flex flex-wrap gap-1.5">
              <CopyBtn text={sheetLink(day.sheetToken)}>링크 복사</CopyBtn>
              <CopyBtn primary text={sheetDm(day.models?.[0], day.sheetToken, day.on, today)}>
                DM 문구 복사
              </CopyBtn>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" disabled={!!busy} onClick={() => run("refresh")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 hover:border-rose-300 disabled:opacity-50">
              {busy === "refresh" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 내용 새로 보내기
            </button>
            {day.sheetClosed ? (
              <button type="button" disabled={!!busy} onClick={() => run("open")} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 disabled:opacity-50">
                <Unlock size={12} /> 다시 열기
              </button>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => window.confirm("링크를 닫을까요? 모델이 더 이상 못 열어요.") && run("close")}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-stone-500 hover:text-rose-700 disabled:opacity-50"
              >
                <Lock size={12} /> 링크 닫기
              </button>
            )}
            {day.sheetAt && <span className="text-stone-400">마지막으로 보낸 내용 {md(dayKey(new Date(day.sheetAt)))}</span>}
          </div>
          <p className={"text-[11px] " + (old ? "font-semibold text-amber-700" : "text-stone-400")}>
            코디·스타일링을 바꿨으면 '내용 새로 보내기'를 눌러야 모델 화면에 반영돼요. 사진은 보낸 날로부터 {SHEET_DAYS}일 동안 보여요{old ? " — 곧 사진이 안 보여요, 새로 보내 주세요" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

/** 촬영 창 — 고치는 대로 저장 */
function DaySheet({ day: start, d, online, onSave, onRemove, onClose, canRemove }) {
  const [s, setS] = useState(start);
  const latest = useRef(s);
  const timer = useRef(null);
  const saved = useRef(JSON.stringify(start));
  const [styling, setStyling] = useState(null);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const j = JSON.stringify(latest.current);
    if (j === saved.current) return;
    saved.current = j;
    onSave(latest.current);
  }, [onSave]);
  useEffect(() => () => flush(), [flush]);
  const set = (v) => {
    const n = { ...latest.current, ...v };
    latest.current = n;
    setS(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };
  const codis = d.codis.filter((c) => s.on && c.shootDate === s.on);
  const styled = codis.filter((c) => stylingLine(c.styling, d.items)).length;
  const live = styling && d.codis.find((c) => c.id === styling.id);
  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className="sheet relative z-10 flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-stone-900">
              {s.on ? `${md(s.on)}(${wd(s.on)}) 촬영` : "날짜 미정"} {s.on && <span className="ml-1 text-sm font-semibold text-rose-700">{dday(s.on)}</span>}
            </div>
            <p className="text-xs text-stone-400">고치는 대로 저장돼요</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <label className="block text-xs font-medium text-stone-500">
              촬영일
              <input type="date" value={s.on || ""} onChange={(e) => set({ on: e.target.value })} className={FIELD + " mt-1"} />
            </label>
            <label className="block text-xs font-medium text-stone-500">
              시작 시각
              <input type="time" value={s.time || ""} onChange={(e) => set({ time: e.target.value })} className={FIELD + " mt-1"} />
            </label>
            <label className="block text-xs font-medium text-stone-500 sm:col-span-1">
              장소
              <input value={s.place || ""} onChange={(e) => set({ place: e.target.value })} placeholder={STUDIO} className={FIELD + " mt-1"} />
            </label>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-stone-500">모델</div>
            <Models value={s.models || []} onChange={(v) => set({ models: v })} />
          </div>
          <label className="block text-xs font-medium text-stone-500">
            모델에게 한 줄 — 촬영 시트에 같이 가요
            <input value={s.modelNote || ""} onChange={(e) => set({ modelNote: e.target.value })} placeholder="예: 화장은 가볍게, 머리끈·누드톤 속옷 챙겨 주세요" className={FIELD + " mt-1"} />
          </label>

          <div className="rounded-xl border border-stone-200 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
              <Shirt size={15} className="text-rose-700" /> 그날 코디 {codis.length > 0 && <span className="font-normal text-stone-400">{codis.length}개 · 스타일링 {styled}/{codis.length}</span>}
            </div>
            {codis.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {codis.map((c) => (
                  <CodiRow key={c.id} c={c} d={d} onStyle={() => setStyling(c)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400">신상 관리 › 코디에서 촬영일을 {s.on ? md(s.on) : "이날"}로 정한 코디가 여기 떠요. 누르면 헤어·신발·악세서리를 골라요.</p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <CheckList title="찍을 컷" list={s.cuts || []} onChange={(v) => set({ cuts: v })} placeholder="+ 컷 (예: 거울 셀카 전신) 엔터" />
            <CheckList title="찍을 영상" list={s.videos || []} onChange={(v) => set({ videos: v })} placeholder="+ 영상 (예: 10초 걷기) 엔터" />
          </div>

          <SheetLink day={s} set={set} codis={codis} d={d} online={online} />

          <label className="block text-xs font-medium text-stone-500">
            메모 (우리만 봐요)
            <textarea value={s.memo || ""} onChange={(e) => set({ memo: e.target.value })} placeholder="스튜디오 예약·결제 · 준비물 · 동선" className={FIELD + " mt-1 h-20 resize-y"} />
          </label>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
          {canRemove ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("이 촬영을 지울까요? (코디는 그대로 남아요)")) {
                  saved.current = JSON.stringify(latest.current);
                  onRemove(s.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
            >
              <Trash2 size={13} /> 지우기
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="rounded-xl bg-rose-700 px-5 py-2 text-sm font-semibold text-white">
            닫기
          </button>
        </footer>
      </div>
      {live && <StylingSheet codi={live} d={d} online={online} onClose={() => setStyling(null)} />}
    </div>
  );
}

// 촬영일 미정 코디 (10/25 세원: "신상 관리에서 코디 짜면 촬영 관리에서 바로 업뎃되게") — 신상 관리 코디는 촬영일이 '(선택)'이라
// 비워 두면 촬영 관리에 안 나왔다. 촬영 전·촬영일 없는 코디를 맨 위에 모으고, 여기서 촬영일을 정하면 그날 카드로 들어간다.
function UndatedCodis({ codis, d, onStyle }) {
  const [busy, setBusy] = useState("");
  if (!codis.length) return null;
  const setDate = async (c, on) => {
    if (!on) return;
    setBusy(c.id);
    try {
      await d.saveCodis(upsert({ ...c, shootDate: on }));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-bold text-amber-900">촬영일 미정 코디 {codis.length}</h3>
        <span className="text-xs text-amber-800/80">신상 관리에서 짠 코디가 바로 여기로 와요 · 촬영일을 정하면 그날 카드로 옮겨져요</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {codis.map((c) => {
          const its = codiItems(c, d.items);
          const line = stylingLine(c.styling, d.items);
          return (
            <div key={c.id} className="flex gap-2.5 rounded-xl border border-stone-200 bg-white p-2.5">
              <button type="button" onClick={() => onStyle(c)} className="flex shrink-0 gap-1" title="스타일링 고르기">
                {its.slice(0, 3).map((x) => (
                  <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-12 rounded-md" />
                ))}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button type="button" onClick={() => onStyle(c)} className="line-clamp-2 text-left text-[13px] leading-snug font-semibold text-stone-900 hover:text-rose-800">
                  {codiName(c, d.items)}
                </button>
                <span className={"truncate text-[11px] " + (line ? "text-emerald-700" : "text-stone-400")}>{line ? `스타일링 · ${line}` : "스타일링 아직"}</span>
                <label className="mt-auto flex items-center gap-1.5 text-[11px] text-stone-500">
                  촬영일
                  <input
                    type="date"
                    disabled={busy === c.id}
                    onChange={(e) => setDate(c, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none focus:border-rose-600"
                  />
                  {busy === c.id && <Loader2 size={12} className="animate-spin" />}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ShootDays({ d, online }) {
  const days = useDays(online);
  const [open, setOpen] = useState(null); // 날짜 또는 기록 id
  const [styling, setStyling] = useState(null); // 촬영일 미정 코디 id
  const today = dayKey();
  const undated = useMemo(() => d.codis.filter((c) => !c.shootDate && !c.done), [d.codis]);
  const liveStyling = styling && d.codis.find((c) => c.id === styling);
  // 촬영일 = 코디 촬영일 + 직접 만든 촬영
  const list = useMemo(() => {
    const m = new Map();
    for (const x of days.items) if (x.on && !m.has(x.on)) m.set(x.on, x);
    for (const c of d.codis) if (c.shootDate && !m.has(c.shootDate)) m.set(c.shootDate, null);
    const rows = [...m.entries()].map(([on, rec]) => ({ on, rec, codis: d.codis.filter((c) => c.shootDate === on) }));
    const noDate = days.items.filter((x) => !x.on).map((rec) => ({ on: "", rec, codis: [] }));
    const up = [...noDate, ...rows.filter((r) => r.on >= today).sort((a, b) => a.on.localeCompare(b.on))];
    const past = rows.filter((r) => r.on < today).sort((a, b) => b.on.localeCompare(a.on));
    return { up, past };
  }, [days.items, d.codis, today]);
  const blank = (on) => ({ id: newId("sd"), on, time: "12:00", place: STUDIO, models: [], modelNote: "", memo: "", cuts: [], videos: [], createdAt: new Date().toISOString() });
  const openDay = open && (days.items.find((x) => x.id === open.id) || open);

  const card = (r) => {
    const rec = r.rec || {};
    const styled = r.codis.filter((c) => stylingLine(c.styling, d.items)).length;
    return (
      <button
        key={rec.id || r.on}
        type="button"
        onClick={() => setOpen(r.rec || blank(r.on))}
        className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-rose-300 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold text-stone-900 tabular-nums">{r.on ? `${md(r.on)}(${wd(r.on)}) 촬영` : "날짜 미정"}</span>
          {r.on && <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + (r.on === today ? "bg-rose-700 text-white" : r.on > today ? "bg-rose-50 text-rose-800" : "bg-stone-100 text-stone-500")}>{dday(r.on)}</span>}
        </div>
        <div className="mt-1.5 space-y-0.5 text-xs text-stone-600">
          {rec.time && (
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-stone-400" /> {timeText(rec.time)}
            </div>
          )}
          {rec.place && (
            <div className="flex items-center gap-1 truncate">
              <MapPin size={12} className="shrink-0 text-stone-400" /> <span className="truncate">{rec.place}</span>
            </div>
          )}
          {(rec.models || []).length > 0 && (
            <div className="flex items-center gap-1">
              <Users size={12} className="text-stone-400" /> {rec.models.join(", ")}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex gap-1 overflow-hidden">
          {r.codis.slice(0, 4).flatMap((c) => codiItems(c, d.items).slice(0, 1)).map((x) => (
            <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-10 shrink-0 rounded-md" />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>코디 {r.codis.length}</span>
          {r.codis.length > 0 && <span className={styled < r.codis.length ? "text-amber-700" : "text-emerald-700"}>스타일링 {styled}/{r.codis.length}</span>}
          {rec.sheetToken && <span className={"flex items-center gap-0.5 " + (rec.sheetClosed ? "text-stone-400" : "text-rose-700")}>{rec.sheetClosed ? <Lock size={11} /> : <Link2 size={11} />} 시트 {rec.sheetClosed ? "닫힘" : "보냄"}</span>}
        </div>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">촬영 관리</h2>
          <p className="mt-0.5 text-sm text-stone-500">촬영일마다 그날 코디 · 스타일링(헤어·신발·악세서리) · 시간·장소·모델. 모델에게는 로그인 없이 보는 촬영 시트 링크로 보내요.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const t = new Date();
            t.setDate(t.getDate() + 1);
            const x = blank(dayKey(t));
            days.save(x);
            setOpen(x);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> 새 촬영
        </button>
      </div>
      {days.msg && (
        <p className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {days.msg}
          <button type="button" onClick={() => days.setMsg("")} aria-label="닫기">
            <X size={14} />
          </button>
        </p>
      )}
      <UndatedCodis codis={undated} d={d} onStyle={(c) => setStyling(c.id)} />
      {!list.up.length && !list.past.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          <CalendarDays size={20} className="mx-auto mb-2 text-stone-300" />
          신상 관리 › 코디에서 촬영일을 정하거나 '새 촬영'을 누르면 여기에 촬영일이 생겨요.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.up.map(card)}</div>
          {list.past.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-xs font-semibold text-stone-400">지난 촬영</div>
              <div className="grid gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3">{list.past.map(card)}</div>
            </>
          )}
        </>
      )}
      {open && openDay && (
        <DaySheet
          key={openDay.id}
          day={openDay}
          d={d}
          online={online}
          canRemove={days.items.some((x) => x.id === openDay.id)}
          onSave={days.save}
          onRemove={days.drop}
          onClose={() => setOpen(null)}
        />
      )}
      {liveStyling && <StylingSheet codi={liveStyling} d={d} online={online} onClose={() => setStyling(null)} />}
    </div>
  );
}

