import { useEffect, useMemo, useState } from "react";
import { RotateCcw, RefreshCw, Copy, Check, ExternalLink, ChevronDown, ChevronRight, TriangleAlert, ChartColumn, ListChecks, Truck } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { orderAdminUrl, when } from "../lib/cs";
import { todayStr } from "../lib/orderTrack";
import { newId } from "../lib/id";
import { returnRows, returnSummary, exchStock, draftOf, draftBlank, smsDraft, SMS_KINDS, rateOf, pct, won, md, shortName, naverLabel, reasonParts, jobsByReturn, npReasonOf, NP_REASONS, KIND, KIND_TONE, CLS, STAGE_LABEL, STALE, DONE_KEEP } from "../lib/returns";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * CS 관리 › 반품·교환 (lib/returns.js 머리말 — 11/24 방향성 창 전달, 1단계).
 * 사무실 PC(returns_track.py)가 10분마다 모은 반품·교환·취소를 한 줄씩 + 판단 초안(사유·배송비·7일·교환 재고·안내 글).
 * 세원 버튼은 ERP 기록만(넥스트팩 회수 접수함 · 입고됨 · 메모 · 사유 고침). 환불·손님에게 보내기·넥스트팩 입력은 안 한다.
 */

const KEYS = ["returns_live", "returns_stats", "returns_marks", "stock", "cs_templates", "np_returns", "np_pickup", "orders_track"];
const FALLBACK = { returns_marks: { marks: {} }, stock: null, cs_templates: null, returns_live: null, returns_stats: null, np_returns: null, np_pickup: { items: [] }, orders_track: null };
function useReturnsData(online) {
  const [d, setD] = useState({});
  useEffect(() => {
    let alive = true;
    const load = (k) =>
      loadKey(k, online, FALLBACK[k] ?? null)
        .then((v) => alive && setD((s) => ({ ...s, [k]: v })))
        .catch(() => {});
    KEYS.forEach(load);
    const off = onSettingsChange((k) => KEYS.includes(k) && load(k));
    const offs = KEYS.map((k) => watchKeys([k], () => load(k), 20000));
    return () => {
      alive = false;
      off();
      offs.forEach((f) => f());
    };
  }, [online]);
  const reload = (k) => loadKey(k, online, FALLBACK[k] ?? null).then((v) => setD((s) => ({ ...s, [k]: v })));
  return { ...d, reload, setD };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const VIEW_KEY = "poclo_returns_view";
const FILTERS = [
  ["open", "진행 중"],
  ["req", "회수 접수 필요"],
  ["pickup", "회수 중"],
  ["check", "입고·검수"],
  ["stale", "오래 멈춤"],
  ["done", `완료(${DONE_KEEP}일)`],
];
const hit = (x, f) => (f === "open" ? x.stage !== "done" : f === "stale" ? x.stale : x.stage === f);
const CHANNEL_TONE = { 카페24: "bg-sky-50 text-sky-800 ring-sky-200", 네이버페이: "bg-green-50 text-green-800 ring-green-200", 톡체크아웃: "bg-yellow-50 text-yellow-900 ring-yellow-200" };
const STAGE_TONE = { req: "bg-amber-100 text-amber-900", pickup: "bg-sky-100 text-sky-900", check: "bg-violet-100 text-violet-900", done: "bg-emerald-100 text-emerald-800" };

export default function ReturnsBoard({ online }) {
  const D = useReturnsData(online);
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || "list";
    } catch {
      return "list";
    }
  });
  const pickView = (v) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 무시 */
    }
  };
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(() => new Set());
  const [msg, setMsg] = useState("");
  const today = todayStr();
  const live = D.returns_live;
  const marks = useMemo(() => D.returns_marks?.marks || {}, [D.returns_marks]);
  const methods = useMemo(() => Object.fromEntries((D.orders_track?.rows || []).map((o) => [o.id, o.method || ""])), [D.orders_track]);
  const ctx = useMemo(() => ({ npRows: D.np_returns?.rows || [], jobs: jobsByReturn(D.np_pickup), methods }), [D.np_returns, D.np_pickup, methods]);
  const list = useMemo(() => (live ? returnRows(live, marks, today, ctx) : []), [live, marks, today, ctx]);
  const [pickOf, setPickOf] = useState(null);
  const npLive = D.np_pickup?.mode === "live";
  /** 넥스트팩 수거 접수 맡기기 — np_pickup 줄 + cs_queue 일감(사무실 PC 가 어사이드 넥스트팩 탭에서) */
  const queuePickup = async (x, form) => {
    const id = newId("np");
    const item = { id, rid: x.id, order: x.order, name: x.name, kind: form.kind, items: form.items, reason: form.reason, memo: form.memo, at: new Date().toISOString(), status: "queued" };
    await changeKey("np_pickup", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []).slice(-80), item] }), { items: [] });
    await changeKey("cs_queue", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), { id, kind: "np_pickup", at: item.at }] }), { items: [] });
    D.reload("np_pickup");
    setMsg(npLive && form.kind === "return" ? "넥스트팩 수거 접수를 사무실 PC에 맡겼어요 — 1~2분 뒤 결과가 떠요." : "넥스트팩 미리보기를 맡겼어요 — 사무실 PC가 칸만 채워 보고 신청은 안 눌러요(세원 확인 뒤 켜요).");
  };
  const npRefresh = async () => {
    await changeKey("cs_queue", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), { id: newId("q"), kind: "np_recent", at: new Date().toISOString() }] }), { items: [] });
    setMsg("넥스트팩 최근 신청 다시 읽기를 맡겼어요 — 1분쯤 뒤 바뀌어요.");
  };
  const sum = returnSummary(list);
  const months = D.returns_stats?.months || [];
  const thisMonth = months[months.length - 1];
  const shown = list.filter((x) => hit(x, filter));
  const count = { open: sum.open, req: sum.req, pickup: sum.pickup, check: sum.check, stale: sum.stale, done: sum.done };

  const refresh = async () => {
    await changeKey("cs_queue", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), { id: newId("q"), kind: "returns", at: new Date().toISOString() }] }), { items: [] });
    setMsg("사무실 PC에 반품·교환 새로 읽기를 맡겼어요 — 1분쯤 뒤 바뀌어요.");
  };
  /** ERP 기록(returns_marks) — null 이면 그 칸을 지운다 */
  const mark = async (id, patch) => {
    const apply = (v) => {
      const all = { ...((v || {}).marks || {}) };
      const cur = { ...(all[id] || {}) };
      for (const [k, val] of Object.entries(patch)) {
        if (val == null || val === "") delete cur[k];
        else cur[k] = val;
      }
      if (Object.keys(cur).length) all[id] = cur;
      else delete all[id];
      return { ...(v || {}), marks: all };
    };
    D.setD((s) => ({ ...s, returns_marks: apply(s.returns_marks) })); // 화면 먼저
    try {
      await changeKey("returns_marks", online, apply, { marks: {} });
    } catch (e) {
      setMsg("저장하지 못했어요 — " + (e?.message || e));
    }
    D.reload("returns_marks");
  };
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <RotateCcw size={15} className="text-rose-700" />
        <span className="text-sm font-bold text-stone-900">반품·교환</span>
        <span className="text-sm text-stone-700 tabular-nums">
          진행 중 {sum.open}건 · <b className={sum.needNp ? "text-amber-700" : "text-stone-500"}>넥스트팩 회수 접수 필요 {sum.needNp}건</b> · <b className={sum.stale ? "text-rose-700" : "text-stone-500"}>오래 멈춤 {sum.stale}건</b>
          {thisMonth && (
            <>
              {" "}
              · 이번 달 반품률 <b>{pct(rateOf(thisMonth))}</b>
            </>
          )}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-stone-400">
          {live?.at ? `카페24 ${when(live.at)}` : "자료를 읽는 중…"}
          {D.np_returns?.at && ` · 넥스트팩 ${when(D.np_returns.at)}`}
          {D.np_returns?.error && (
            <span className="text-rose-600" title={D.np_returns.error}>
              {" "}
              · 넥스트팩 읽기 실패
            </span>
          )}
          <button type="button" onClick={refresh} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-stone-500 hover:text-stone-800">
            <RefreshCw size={12} /> 새로 읽기
          </button>
          <button type="button" onClick={npRefresh} className="rounded-lg px-1.5 py-1 text-stone-500 hover:text-stone-800">
            넥스트팩 다시 읽기
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <nav className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm" aria-label="반품·교환 보기">
          {[
            ["list", "한 건씩", ListChecks],
            ["stats", "통계", ChartColumn],
          ].map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => pickView(k)} className={"flex items-center gap-1 rounded-lg px-3 py-1 font-semibold " + (view === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </nav>
        <p className="text-xs text-stone-500">환불·손님에게 보내기는 자동으로 안 해요 · 넥스트팩 수거 접수는 세원이 누른 것만.</p>
      </div>
      {msg && <p className="mx-4 mb-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
      {view === "stats" ? (
        <Stats stats={D.returns_stats} />
      ) : (
        <>
          <StageStrip sum={sum} filter={filter} setFilter={setFilter} />
          <div className="flex flex-wrap gap-1 px-4 pb-2">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (filter === k ? "bg-stone-800 text-white" : k === "stale" && count.stale ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}>
                {label} {count[k] ?? 0}
              </button>
            ))}
          </div>
          {!live ? (
            <p className="px-4 pb-4 text-sm text-stone-400">{live === null ? "아직 모은 자료가 없어요 — 사무실 PC 가 10분 안에 처음 모아요." : "불러오는 중…"}</p>
          ) : !shown.length ? (
            <p className="px-4 pb-4 text-sm text-stone-500">{filter === "open" ? "지금 진행 중인 반품·교환이 없어요." : "여기에 해당하는 건이 없어요."}</p>
          ) : (
            <ul className="divide-y divide-stone-100 px-2 pb-3 sm:px-4">
              {shown.map((x) => (
                <Row key={x.id} x={x} open={open.has(x.id)} onToggle={() => toggle(x.id)} mark={mark} stock={D.stock} tpl={D.cs_templates} onPickup={() => setPickOf(x)} />
              ))}
            </ul>
          )}
        </>
      )}
      {pickOf && <PickupSheet x={pickOf} live={npLive} onClose={() => setPickOf(null)} onGo={(f) => queuePickup(pickOf, f).then(() => setPickOf(null))} />}
    </section>
  );
}

/** 요청 → 넥스트팩 회수 접수(세원) → 회수 중 → 입고·검수 → 완료 */
function StageStrip({ sum, filter, setFilter }) {
  const steps = [
    { k: "req", label: "요청", n: sum.req },
    { k: "np", label: "넥스트팩 회수 접수", sub: "세원", n: sum.needNp, action: true },
    { k: "pickup", label: "회수 중", n: sum.pickup },
    { k: "check", label: "입고·검수", n: sum.check },
    { k: "done", label: "환불·교환 완료", n: sum.done },
  ];
  return (
    <ol className="mx-4 mb-2 flex gap-1 overflow-x-auto rounded-xl bg-stone-50 p-1.5 text-xs">
      {steps.map((s, i) => {
        const f = s.k === "np" ? "req" : s.k;
        const on = filter === f;
        return (
          <li key={s.k} className="flex min-w-0 shrink-0 items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-stone-300" />}
            <button
              type="button"
              onClick={() => setFilter(f)}
              className={"rounded-lg px-2.5 py-1.5 text-left " + (on ? "bg-white shadow-sm ring-1 ring-stone-200" : "hover:bg-white/70") + (s.action ? " border border-dashed border-amber-300" : "")}
            >
              <span className="block font-semibold text-stone-800">
                {s.label}
                {s.sub && <span className="ml-1 text-[10px] font-medium text-amber-700">({s.sub})</span>}
              </span>
              <span className={"block tabular-nums " + (s.action && s.n ? "font-bold text-amber-700" : "text-stone-500")}>{s.action ? (s.n ? `${s.n}건 할 일` : "할 일 없음") : `${s.n}건`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ x, open, onToggle, mark, stock, tpl, onPickup }) {
  const waitText = x.stage === "done" ? `${md(x.since)} 끝` : `${md(x.since)}부터 평일 ${x.waited}일째`;
  return (
    <li className={"py-2.5 " + (x.stale ? "bg-rose-50/50" : x.needNp ? "bg-amber-50/40" : "")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className={"rounded-md px-1.5 py-0.5 text-[11px] font-bold ring-1 ring-inset " + KIND_TONE[x.kind]}>{KIND[x.kind]}</span>
            <span className={"rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " + (CHANNEL_TONE[x.channel] || CHANNEL_TONE.카페24)}>{x.channel}</span>
            <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + STAGE_TONE[x.stage]}>{STAGE_LABEL[x.stage]}</span>
            <span className={"text-[11px] tabular-nums " + (x.stale ? "font-bold text-rose-700" : "text-stone-500")}>
              {waitText}
              {x.stale && (x.np?.state === "redo" ? " — 넥스트팩 다시 신청 필요" : x.job?.status === "error" ? " — 넥스트팩 접수 실패" : STALE[x.stage] != null ? ` — 오래 멈춤(기준 ${STALE[x.stage]}일)` : "")}
            </span>
            {x.kind !== "C" && <span className={"rounded-full px-1.5 py-px text-[10px] font-bold " + (x.cls === "change" ? "bg-stone-100 text-stone-600" : "bg-rose-100 text-rose-800")}>{CLS[x.cls]}</span>}
            <NpChip x={x} />
          </div>
          <ul className="space-y-0.5">
            {x.items.map((it, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1 text-sm">
                <span className="min-w-0 truncate text-stone-900">{shortName(it.n)}</span>
                {it.o && <span className="rounded bg-stone-800 px-1.5 py-px text-[11px] font-semibold text-white">{it.o}</span>}
                {it.q > 1 && <span className="text-xs text-stone-500">×{it.q}</span>}
              </li>
            ))}
          </ul>
          <Reason text={x.reason} />
          <p className="text-[11px] text-stone-500">
            {x.name || "손님"} ·{" "}
            <a href={orderAdminUrl(x.order)} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono hover:text-rose-700 hover:underline">
              {x.order}
            </a>
            {x.cc && <span className="ml-1 font-mono text-stone-400">{x.cc}</span>} · {x.how}
            {x.nps && <span className="ml-1 text-green-800">· {naverLabel(x.nps)}</span>}
            {x.mark.memo && <span className="ml-1 text-stone-700">· 메모: {x.mark.memo}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Actions x={x} mark={mark} onPickup={onPickup} />
          <button type="button" onClick={onToggle} className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 판단 보기
          </button>
        </div>
      </div>
      {open && <Judge x={x} mark={mark} stock={stock} tpl={tpl} />}
    </li>
  );
}

function Reason({ text }) {
  const { body, pick } = reasonParts(text);
  if (!body && !pick) return <p className="text-xs text-stone-400">사유를 안 적었어요</p>;
  return (
    <p className="line-clamp-2 text-xs text-stone-700">
      {body && `“${body}”`}
      {pick && <span className="ml-1 rounded bg-stone-100 px-1 py-px text-[11px] text-stone-600">고른 사유: {pick}</span>}
    </p>
  );
}

const nowIso = () => new Date().toISOString();
const JOB = {
  queued: ["사무실 PC 대기", "bg-sky-100 text-sky-900"],
  running: ["넥스트팩 접수 중…", "bg-sky-100 text-sky-900"],
  preview: ["미리보기 끝 · 신청 안 함", "bg-stone-100 text-stone-700"],
  done: ["넥스트팩 접수됨", "bg-emerald-100 text-emerald-800"],
  error: ["넥스트팩 접수 실패", "bg-rose-100 text-rose-800"],
};
/** 넥스트팩 쪽 상태 — 최근 신청에서 맞춘 줄 · ERP 버튼으로 맡긴 접수 */
function NpChip({ x }) {
  const out = [];
  if (x.np) {
    const t = x.np.state === "done" ? "넥스트팩 수거 완료" : x.np.state === "visit" ? `넥스트팩 ${md(x.np.visit)} 방문 예정` : x.np.state === "redo" ? "넥스트팩 다시 신청 필요" : `넥스트팩 ${x.np.note || "접수됨"}`;
    out.push(
      <span key="np" title={x.np.note} className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (x.np.state === "redo" ? "bg-rose-100 text-rose-800" : "bg-emerald-50 text-emerald-800")}>
        {t}
      </span>,
    );
  }
  if (x.job && !(x.np && x.job.status === "done")) {
    const [label, tone] = JOB[x.job.status] || [x.job.status, "bg-stone-100 text-stone-600"];
    out.push(
      <span key="job" title={x.job.error || ""} className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + tone}>
        {label}
      </span>,
    );
  }
  return out;
}

function Actions({ x, mark, onPickup }) {
  if (x.kind === "C") return null;
  const busy = x.job && ["queued", "running"].includes(x.job.status);
  if (x.stage === "req")
    return (
      <>
        {!x.mark.np && (
          <button type="button" onClick={() => mark(x.id, { np: { on: nowIso() } })} className="text-[11px] text-stone-400 hover:text-stone-700" title="넥스트팩에서 직접 접수했으면 기록만 남겨요">
            직접 접수했어요
          </button>
        )}
        <button type="button" disabled={busy} onClick={onPickup} className="flex items-center gap-1 rounded-lg bg-rose-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
          <Truck size={12} /> {busy ? "넥스트팩 접수 맡김" : "넥스트팩 수거 접수"}
        </button>
      </>
    );
  if (x.stage === "pickup")
    return (
      <>
        {x.mark.np && (
          <button type="button" onClick={() => mark(x.id, { np: null })} className="text-[11px] text-stone-400 hover:text-stone-700">
            {md(x.mark.np.on)} 직접 접수 기록 · 되돌리기
          </button>
        )}
        <button type="button" onClick={() => mark(x.id, { arrived: { on: nowIso() } })} className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50">
          입고됐어요
        </button>
      </>
    );
  if (x.stage === "check")
    return (
      <>
        {x.mark.arrived && !x.col && (
          <button type="button" onClick={() => mark(x.id, { arrived: null })} className="text-[11px] text-stone-400 hover:text-stone-700">
            {md(x.mark.arrived.on)} 입고 표시 · 되돌리기
          </button>
        )}
        <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800">검수 뒤 {x.kind === "E" ? "교환 출고" : "환불"}은 세원이 카페24·네이버에서</span>
      </>
    );
  return null;
}

/** 넥스트팩 수거 접수 — 넥스트팩 '반품 교환 신청' 칸 그대로(종류 · 상품 · 반품 사유 · 메모). 수거지·연락처·상자·수거일은 넥스트팩이 주문으로 채운다 */
function PickupSheet({ x, live, onClose, onGo }) {
  const [kind, setKind] = useState(x.kind === "E" ? "exchange" : "return");
  const [picked, setPicked] = useState(() => x.items.map(() => true));
  const [reason, setReason] = useState(() => npReasonOf(x));
  const [exReason, setExReason] = useState(() => reasonParts(x.reason).body.slice(0, 80));
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const items = x.items.filter((_, i) => picked[i]).map((it) => ({ n: it.n, o: it.o, q: it.q }));
  const realGo = live && kind === "return";
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={`넥스트팩 수거 접수 · ${x.name || "손님"}`} onClose={onClose} />
      <div className="space-y-4 overflow-y-auto p-4 text-sm">
        {!realGo && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {kind === "exchange" ? "교환 수거는 넥스트팩에서 '교환할 상품'을 골라야 해서 아직 " : "지금은 "}
            <b>미리보기</b>예요 — 사무실 PC가 넥스트팩 칸만 채워 보고 신청 단추는 안 눌러요.{kind === "return" && " 세원이 확인하면 실제 접수를 켜요."}
          </p>
        )}
        <p className="text-xs text-stone-500">
          주문 <span className="font-mono">{x.order}</span> · {x.channel}
        </p>
        <div>
          <p className="mb-1 text-xs font-semibold text-stone-700">종류</p>
          <div className="flex gap-1">
            {[
              ["return", "반품 수거"],
              ["exchange", "교환 수거"],
            ].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={"rounded-full px-3 py-1 text-xs font-semibold " + (kind === k ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-stone-700">상품</p>
          <ul className="space-y-1">
            {x.items.map((it, i) => (
              <li key={i}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked[i]} onChange={() => setPicked((p) => p.map((v, k) => (k === i ? !v : v)))} />
                  <span className="min-w-0 truncate">{shortName(it.n)}</span>
                  {it.o && <span className="rounded bg-stone-800 px-1.5 py-px text-[11px] font-semibold text-white">{it.o}</span>}
                  <span className="text-xs text-stone-500">{it.q}장</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        {kind === "return" ? (
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-700">반품 사유 (넥스트팩 칸)</p>
            <div className="flex flex-wrap gap-1">
              {NP_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (reason === r ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-600")}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-xs font-semibold text-stone-700">교환 사유</p>
            <input value={exReason} onChange={(e) => setExReason(e.target.value)} className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm" />
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-semibold text-stone-700">메모 (기사님께 · 비워도 돼요)</p>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 문 앞에 두었어요" className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm" />
        </div>
        <p className="text-xs text-stone-500">수거지·연락처·상자·수거일(보통 다음 날 10~17시)은 넥스트팩이 주문으로 채워요. 수거 1건마다 넥스트팩 택배비 2,500원 + 검수비가 넥스트팩 정산에 붙어요. 결제·입금 단추는 누르지 않아요.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-stone-200 px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-stone-500">
          닫기
        </button>
        <button
          type="button"
          disabled={busy || !items.length}
          onClick={async () => {
            setBusy(true);
            await onGo({ kind, items, reason: kind === "return" ? reason : exReason, memo: memo.trim() });
          }}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
        >
          {realGo ? "넥스트팩에 접수 맡기기" : "미리보기 맡기기"}
        </button>
      </div>
    </Sheet>
  );
}

/** 펼친 판단 초안 — 사유 · 배송비 · 7일 · 교환 재고 · 안내 글 · 메모 */
function Judge({ x, mark, stock, tpl }) {
  // 11/24 세원: 문자는 계좌이체(무통장) 손님만 — 그때 문자 초안, 나머지는 '필요할 때 보기'로 접어 둔다
  const sms = x.pay?.mode === "sms";
  const [smsKind, setSmsKind] = useState("deposit");
  const [showDraft, setShowDraft] = useState(false);
  const base = useMemo(() => (sms ? smsDraft(x, smsKind) : draftOf(x, tpl || {})), [x, tpl, sms, smsKind]);
  const [edited, setEdited] = useState(null); // null = 초안 그대로(자료가 바뀌면 같이 바뀜)
  const text = edited ?? base;
  const touched = edited != null;
  const [copied, setCopied] = useState(false);
  const [memo, setMemo] = useState(x.mark.memo || "");
  const stocks = x.kind === "E" ? exchStock(x, stock) : [];
  const npOn = x.mark.np?.on || x.job?.doneAt || (x.np ? x.np.since : "");
  const steps = [
    ["요청", x.req],
    ["넥스트팩 접수", npOn],
    ["회수", x.col || x.mark.arrived?.on || (x.np?.state === "done" ? x.np.since : "")],
    [x.kind === "E" ? "교환 완료" : "환불", x.ref || x.exd],
  ];
  const blank = draftBlank(text);
  const pv = x.job?.preview;
  const draftOpen = sms || showDraft;
  return (
    <div className="mx-2 mt-2 grid gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs lg:grid-cols-2">
      <div className="space-y-3">
        {x.kind !== "C" && (
          <ol className="flex flex-wrap items-center gap-1 text-[11px]">
            {steps.map(([label, at], i) => (
              <li key={label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} className="text-stone-300" />}
                <span className={"rounded-full px-2 py-0.5 " + (at ? "bg-emerald-100 font-semibold text-emerald-800" : "bg-white text-stone-400 ring-1 ring-stone-200")}>
                  {label} {at ? md(at) : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
        {(x.np || x.job) && (
          <div>
            <p className="mb-1 font-semibold text-stone-800">넥스트팩</p>
            {x.np && (
              <p className={x.np.state === "redo" ? "font-semibold text-rose-700" : "text-stone-700"}>
                최근 신청: {x.np.kind === "exchange" ? "교환 수거" : "반품 수거"} · {x.np.option} {x.np.qty}장 · {x.np.note}
                <span className="text-stone-400"> (이름·상품으로 맞춤)</span>
              </p>
            )}
            {x.job && (
              <div className="mt-1 rounded-lg bg-white p-2 ring-1 ring-stone-200">
                <p className="text-stone-700">
                  ERP 버튼 {md(x.job.at)} · {JOB[x.job.status]?.[0] || x.job.status}
                  {x.job.error && <span className="text-rose-700"> — {x.job.error}</span>}
                </p>
                {pv && (
                  <ul className="mt-1 space-y-0.5 text-stone-600">
                    <li>
                      {pv.kind === "exchange" ? "교환 수거" : "반품 수거"} · 사유 {pv.reason}
                      {pv.when && ` · 수거일 ${pv.when}`}
                    </li>
                    {(pv.rows || []).map((r, i) => (
                      <li key={i} className={r.pick ? "text-stone-800" : "text-stone-400 line-through"}>
                        {r.pick ? "✓" : "–"} {shortName(r.product)} [{r.opt}] {r.qty}장
                      </li>
                    ))}
                    <li>
                      {pv.fee || ""}
                      {pv.canSubmit != null && (pv.canSubmit ? " · 신청 단추 켜짐" : " · 신청 단추 꺼짐")}
                      {pv.addr === false && " · ⚠ 수거지 비어 있음"}
                    </li>
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {x.kind !== "C" && (
          <div>
            <p className="mb-1 font-semibold text-stone-800">사유 구분</p>
            <div className="flex flex-wrap items-center gap-1">
              {Object.entries(CLS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => mark(x.id, { cls: k === x.cls && x.clsFixed ? null : k })} className={"rounded-full px-2.5 py-1 font-semibold " + (x.cls === k ? (k === "change" ? "bg-stone-800 text-white" : "bg-rose-700 text-white") : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-rose-300")}>
                  {label}
                </button>
              ))}
              <span className="text-stone-500">· 갈래 {x.grp}</span>
              {x.clsFixed && (
                <button type="button" onClick={() => mark(x.id, { cls: null })} className="text-stone-400 underline hover:text-stone-700">
                  직접 고침 · 자동 판단은 {CLS[x.autoCls] || "변심"} — 되돌리기
                </button>
              )}
            </div>
            {x.flag && (
              <p className="mt-1 flex items-start gap-1 text-amber-800">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" /> {x.flag}
              </p>
            )}
          </div>
        )}
        <div>
          <p className="mb-1 font-semibold text-stone-800">배송비</p>
          <p className="text-stone-800">
            <b className={x.fee.who === "손님" ? "text-stone-900" : "text-emerald-700"}>
              {x.fee.who === "손님" ? `손님 부담 ${won(x.fee.amount)}` : x.fee.who === "포클로" ? "포클로 부담" : "배송비 없음"}
            </b>{" "}
            — {x.fee.why}
          </p>
          {x.pay && (
            <p className="mt-0.5">
              <span className={"mr-1 rounded-full px-2 py-0.5 font-semibold " + (x.pay.mode === "sms" ? "bg-amber-100 text-amber-900" : x.pay.mode === "unknown" ? "bg-rose-100 text-rose-800" : "bg-emerald-50 text-emerald-800")}>{x.pay.label}</span>
              <span className="text-stone-600">{x.pay.text}</span>
            </p>
          )}
          {x.fee.notes.map((n) => (
            <p key={n} className="text-stone-500">
              · {n}
            </p>
          ))}
        </div>
        {x.w7 && (
          <div>
            <p className="mb-1 font-semibold text-stone-800">받은 지 7일 안</p>
            <p className={x.w7.ok === false ? "font-semibold text-rose-700" : x.w7.ok ? "text-emerald-700" : "text-amber-800"}>{x.w7.text}</p>
          </div>
        )}
        {stocks.length > 0 && (
          <div>
            <p className="mb-1 font-semibold text-stone-800">교환 재고 (넥스트팩{stocks[0].at ? ` ${md(stocks[0].at)} 기준` : ""} · 목록에 없으면 0)</p>
            {stocks.map((s) => (
              <div key={s.name} className="mb-1">
                <p className="text-stone-600">
                  {shortName(s.name)} — 받은 옵션 {s.option || "—"}
                  {s.sizes.length > 0 && <span className="ml-1 text-violet-800">· 손님 글에 {s.sizes.join(", ")}</span>}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {s.list.length ? (
                    s.list.map((o) => (
                      <span key={o.option} className={"rounded-md px-1.5 py-0.5 tabular-nums ring-1 ring-inset " + (s.want.includes(o.option) ? "bg-violet-100 font-bold text-violet-900 ring-violet-300" : o.avail > 0 ? "bg-white text-stone-700 ring-stone-200" : "bg-stone-100 text-stone-400 ring-stone-200")}>
                        {o.option} {o.avail > 0 ? `${o.avail}장` : `0${o.hold ? ` (밀린 주문 ${o.hold})` : ""}`}
                        {o.rack ? ` · 렉 ${o.rack}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-stone-400">넥스트팩 현재고에 이 상품이 없어요(재고 0)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="mb-1 font-semibold text-stone-800">메모 (ERP 에만)</p>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={() => memo !== (x.mark.memo || "") && mark(x.id, { memo: memo.trim() || null })} placeholder="예: 사진 받음 · 환불 11/26" className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs" />
        </div>
        <p className="text-stone-500">
          회수·상품교환·반품예정·환불정보는 이지어드민 C/S 창(오른쪽 위 헤드폰)에서 · 반품 승인·환불은 카페24·네이버페이센터에서(세원).{" "}
          <a href={orderAdminUrl(x.order)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-stone-700 hover:text-rose-700">
            카페24 주문 열기 <ExternalLink size={11} />
          </a>
        </p>
      </div>
      {x.kind !== "C" &&
        (draftOpen ? (
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold text-stone-800">
              {sms ? "손님 문자 초안" : "손님 안내 글 초안"} <span className="font-normal text-stone-500">— 틀(0원) · 세원 확인 전 · 보내기 없음</span>
            </p>
            {sms && (
              <div className="flex flex-wrap gap-1">
                {SMS_KINDS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSmsKind(k);
                      setEdited(null);
                    }}
                    className={"rounded-full px-2.5 py-1 font-semibold " + (smsKind === k ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <textarea value={text} onChange={(e) => setEdited(e.target.value)} rows={10} className="w-full flex-1 rounded-lg border border-stone-200 bg-white p-2 text-xs leading-relaxed text-stone-800" />
            {blank && <p className="text-amber-800">[대괄호] 빈칸을 채워야 해요.</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={blank}
                onClick={async () => {
                  if (await copyText(text)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
                className="flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-900 disabled:opacity-40"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "복사했어요" : "글 복사"}
              </button>
              {touched && (
                <button type="button" onClick={() => setEdited(null)} className="text-stone-400 hover:text-stone-700">
                  처음 초안으로
                </button>
              )}
              {!sms && (
                <button type="button" onClick={() => setShowDraft(false)} className="text-stone-400 hover:text-stone-700">
                  접기
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1.5 text-stone-500">
            <p className="font-semibold text-stone-800">손님 문자</p>
            <p>{x.pay?.mode === "deduct" ? "카드 등 결제 — 환불금에서 배송비를 빼고 환불해서 문자는 필요 없어요." : x.pay?.mode === "naver" ? "네이버페이가 배송비를 빼고 환불해서 문자는 필요 없어요." : "문자는 계좌이체(무통장) 손님에게만 보내요."}</p>
            <button type="button" onClick={() => setShowDraft(true)} className="rounded-lg bg-white px-2.5 py-1 font-semibold text-stone-600 ring-1 ring-stone-200 hover:ring-rose-300">
              그래도 안내 글 보기
            </button>
          </div>
        ))}
    </div>
  );
}

/** 통계 — 월별 반품률 · 상품별 · 사유 (소싱·상세페이지 고칠 곳 찾기) */
function Stats({ stats }) {
  if (stats === undefined) return <p className="px-4 pb-4 text-sm text-stone-400">불러오는 중…</p>;
  if (!stats) return <p className="px-4 pb-4 text-sm text-stone-500">아직 통계가 없어요 — 사무실 PC 가 하루 한 번(아침 6시 뒤) 셉니다.</p>;
  const months = stats.months || [];
  const prods = stats.products || [];
  const reasons = stats.reasons || [];
  const maxRate = Math.max(1, ...prods.filter((p) => p.sold >= 10).map((p) => (p.ret / p.sold) * 100));
  const maxReason = Math.max(1, ...reasons.map((r) => r.n));
  const totalReason = reasons.reduce((s, r) => s + r.n, 0);
  return (
    <div className="space-y-5 px-4 pb-4">
      <div>
        <p className="mb-1 text-sm font-bold text-stone-900">월별</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs tabular-nums">
            <thead>
              <tr className="border-b border-stone-200 text-left text-[11px] text-stone-500">
                <th className="py-1.5 pr-2 font-medium">달(주문일)</th>
                <th className="py-1.5 pr-2 text-right font-medium">주문</th>
                <th className="py-1.5 pr-2 text-right font-medium">판매 수량</th>
                <th className="py-1.5 pr-2 text-right font-medium">상품금액</th>
                <th className="py-1.5 pr-2 text-right font-medium">반품</th>
                <th className="py-1.5 pr-2 font-medium">반품률</th>
                <th className="py-1.5 pr-2 text-right font-medium">교환</th>
                <th className="py-1.5 text-right font-medium">취소</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const r = rateOf(m);
                return (
                  <tr key={m.m} className="border-b border-stone-100">
                    <td className="py-1.5 pr-2 font-semibold text-stone-800">{Number(m.m.slice(5))}월</td>
                    <td className="py-1.5 pr-2 text-right">{m.orders}</td>
                    <td className="py-1.5 pr-2 text-right">{m.sold}</td>
                    <td className="py-1.5 pr-2 text-right">{Math.round(m.amount / 10000).toLocaleString("ko-KR")}만</td>
                    <td className="py-1.5 pr-2 text-right">
                      {m.ret}장 <span className="text-stone-400">({m.retClaims}건)</span>
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                          <span className="block h-full rounded-full bg-rose-600" style={{ width: `${Math.min(100, (r || 0) * 6)}%` }} />
                        </span>
                        <b className="text-stone-800">{pct(r)}</b>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{m.exch}</td>
                    <td className="py-1.5 text-right">{m.cancel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-stone-400">반품률 = 반품 수량 ÷ 판매 수량(결제 뒤 취소 뺀 것) · 주문한 달 기준 · {stats.since?.slice(5).replace("-", "/")}부터 · {when(stats.at)} 셈</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-bold text-stone-900">상품별 — 반품 많은 순</p>
          <ul className="space-y-1">
            {prods
              .filter((p) => p.ret > 0)
              .slice(0, 15)
              .map((p) => {
                const r = p.sold ? (p.ret / p.sold) * 100 : null;
                const enough = p.sold >= 10;
                return (
                  <li key={p.pno} className="grid grid-cols-[minmax(0,1fr)_6rem_3.5rem] items-center gap-2 text-xs">
                    <span className="truncate text-stone-800" title={p.n}>
                      {p.n}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-stone-100">{enough && <span className={"block h-full rounded-full " + (r >= 10 ? "bg-rose-600" : "bg-rose-300")} style={{ width: `${(r / maxRate) * 100}%` }} />}</span>
                    <span className="text-right tabular-nums text-stone-700">
                      {enough ? <b className={r >= 10 ? "text-rose-700" : ""}>{pct(r, 0)}</b> : <span className="text-stone-400">—</span>}
                    </span>
                    <span className="col-span-3 -mt-1 text-[10px] text-stone-400 tabular-nums">
                      반품 {p.ret}장 · 판매 {p.sold}장{p.exch ? ` · 교환 ${p.exch}` : ""}
                      {!enough && " · 10장 넘게 판 것만 % 표시"}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-sm font-bold text-stone-900">사유 갈래 (반품 {totalReason}건)</p>
          <ul className="space-y-1.5">
            {reasons.map((r) => (
              <li key={r.grp} className="text-xs">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)_3rem] items-center gap-2">
                  <span className={"font-semibold " + (r.grp === "불량" || r.grp === "오배송" ? "text-rose-700" : "text-stone-800")}>{r.grp}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <span className={"block h-full rounded-full " + (r.grp === "불량" || r.grp === "오배송" ? "bg-rose-600" : "bg-stone-500")} style={{ width: `${(r.n / maxReason) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-stone-700">{r.n}건</span>
                </div>
                {r.ex?.length > 0 && <p className="mt-0.5 line-clamp-2 pl-[6.5rem] text-[10px] text-stone-400">{r.ex.map((e) => `“${e}”`).join(" ")}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-stone-400">카페24 사유 코드 + 손님이 쓴 글로 나눴어요(짐작). 사이즈·핏 · 재질·두께 · 사진·색 다름이 많은 상품은 상세페이지 실측·소재·사진을 먼저 봐요.</p>
        </div>
      </div>
    </div>
  );
}
