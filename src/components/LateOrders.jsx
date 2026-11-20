import { useEffect, useMemo, useState } from "react";
import { Clock3, Copy, Check, ExternalLink, RefreshCw, MessageSquareText, Truck, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { orderAdminUrl, when } from "../lib/cs";
import { lateRows, lateSummary, npaySoon, delayDraft, draftBlank, md, NPAY_SOON, NOTICE_DAYS } from "../lib/late";
import { todayStr } from "../lib/orderTrack";
import { newId } from "../lib/id";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * CS 관리 › 늦는 주문 (lib/late.js 머리말 — 11/20 세원 "늦는 주문이 흩어져 있음").
 * 주문 하나에 한 줄: 주문일·며칠째 · 상품·옵션(늦는 옵션) · 입고·출고 예정 · 채널 · 네이버 발송기한 · 손님 안내 여부.
 * 안내 안 한 줄엔 [안내 초안](세원 틀만). 보내기는 없다 — 복사해서 세원이 보내고 '보냈어요', 또는 그 주문의 답할 문의 카드에 초안으로.
 * 네이버페이 주문형은 아래 '네이버페이 발송지연' 칸에서 처리(상세사유가 손님 안내).
 */

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d) => {
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? d : `${x.getMonth() + 1}/${x.getDate()} (${WD[x.getDay()]})`;
};
const FILTERS = [
  ["all", "전체"],
  ["need", "안내 안 한 것"],
  ["redo", "다시 안내?"],
  ["npay", "네이버 기한 임박"],
  ["done", "안내함"],
];
const hitFilter = (x, f) =>
  f === "all" ? true : f === "need" ? x.state === "need" : f === "redo" ? x.state === "done" && !!x.stale : f === "npay" ? npaySoon(x) : f === "done" ? x.state === "done" : true;
const PLACE_TONE = { 카페24: "bg-sky-50 text-sky-800 ring-sky-200", 네이버페이: "bg-green-50 text-green-800 ring-green-200", 톡체크아웃: "bg-yellow-50 text-yellow-900 ring-yellow-200" };

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

/** 이 화면이 읽는 자료 — 화면이 떠 있는 동안 바뀐 키만 다시 */
const KEYS = ["orders_track_live", "npay_delay", "delay_sms", "delay_sent_manual", "inbound_eta", "stock"];
function useLateData(online) {
  const [d, setD] = useState({});
  const [done, setDone] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = (k) => loadKey(k, online, k === "stock" ? null : { items: [] }).then((v) => alive && setD((s) => ({ ...s, [k]: v }))).catch(() => {});
    KEYS.forEach(load);
    // 처리 끝나 따로 옮겨 둔 문의(cs_done_YYYYMM) — 이번 달·지난달
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const k1 = `cs_done_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const k2 = `cs_done_${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`;
    Promise.all([k1, k2].map((k) => loadKey(k, online, { items: [] }).catch(() => ({ items: [] })))).then((vs) => alive && setDone(vs.flatMap((v) => v.items || [])));
    const off1 = onSettingsChange((k) => KEYS.includes(k) && load(k));
    const offs = KEYS.map((k) => watchKeys([k], () => load(k), 20000));
    return () => {
      alive = false;
      off1();
      offs.forEach((f) => f());
    };
  }, [online]);
  return { ...d, done, reload: (k) => loadKey(k, online, { items: [] }).then((v) => setD((s) => ({ ...s, [k]: v }))) };
}

export default function LateOrders({ online, inbox = [], saveCard, openCard }) {
  const D = useLateData(online);
  const [filter, setFilter] = useState("all");
  const [draftOf, setDraftOf] = useState(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const today = todayStr();
  const live = D.orders_track_live;
  const list = useMemo(
    () =>
      live
        ? lateRows({ rows: live.rows || [], sent: live.sent, npay: D.npay_delay, sms: D.delay_sms, manual: D.delay_sent_manual, cs: [...inbox, ...D.done], inbound: D.inbound_eta, stock: D.stock, today })
        : [],
    [live, D.npay_delay, D.delay_sms, D.delay_sent_manual, D.done, D.inbound_eta, D.stock, inbox, today],
  );
  const sum = lateSummary(list);
  const shown = list.filter((x) => hitFilter(x, filter));
  const count = { all: sum.all, need: sum.need, redo: sum.redo, npay: sum.npaySoon, done: list.filter((x) => x.state === "done").length };
  const refresh = async () => {
    await changeKey("cs_queue", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), { id: newId("q"), kind: "orders", at: new Date().toISOString() }] }), { items: [] });
    setMsg("사무실 PC에 주문 새로 읽기를 맡겼어요 — 1분쯤 뒤 바뀌어요.");
  };
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const dropManual = async (mid) => {
    if (!mid || !window.confirm("이 '보냈어요' 기록을 지울까요? (손님에게 간 글은 그대로예요)")) return;
    await changeKey("delay_sent_manual", online, (v) => ({ ...v, items: (v.items || []).filter((m) => m.id !== mid) }));
    D.reload("delay_sent_manual");
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <Clock3 size={15} className="text-rose-700" />
        <span className="text-sm font-bold text-stone-900">늦는 주문</span>
        <span className="text-sm text-stone-700 tabular-nums">
          {sum.all}건 · <b className={sum.need ? "text-amber-700" : "text-stone-500"}>안내 안 한 것 {sum.need}건</b>
          {sum.redo > 0 && <> · <b className="text-amber-700">다시 안내? {sum.redo}건</b></>} · <b className={sum.npaySoon ? "text-rose-700" : "text-stone-500"}>네이버 기한 임박 {sum.npaySoon}건</b>
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-stone-400">
          {live?.at ? `주문 ${when(live.at)} 읽음` : "주문 자료를 읽는 중…"}
          <button type="button" onClick={refresh} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-stone-500 hover:text-stone-800">
            <RefreshCw size={12} /> 새로 읽기
          </button>
        </span>
      </div>
      <p className="px-4 pb-2 text-xs text-stone-500">
        카페24 출고 전 주문(네이버페이 주문형·톡체크아웃 포함) 중 결제 다음 날부터 평일 2일↑이거나 입고 예정상 늦을 게 정해진 것. 평일 {NOTICE_DAYS}일↑이면 안내해요 · 리오더 안내를 보고 산 주문은 결제 후 7일 넘을 때만.
      </p>
      <div className="flex flex-wrap gap-1 px-4 pb-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (filter === k ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}>
            {label} {count[k] ?? 0}
          </button>
        ))}
      </div>
      {msg && <p className="mx-4 mb-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
      {!live ? (
        <p className="px-4 pb-4 text-sm text-stone-400">불러오는 중…</p>
      ) : !shown.length ? (
        <p className="px-4 pb-4 text-sm text-stone-500">{filter === "all" ? "지금 늦는 주문이 없어요." : "여기에 해당하는 주문이 없어요."}</p>
      ) : (
        <div className="px-2 pb-3 sm:px-4">
          <div className="hidden grid-cols-[6rem_minmax(0,1fr)_9rem_5.5rem_7rem_11rem_6.5rem] gap-3 border-b border-stone-200 px-2 pb-1.5 text-[11px] font-medium text-stone-500 lg:grid">
            <span>주문일 · 며칠째</span>
            <span>상품 · 옵션</span>
            <span>입고·출고 예정</span>
            <span>채널</span>
            <span>네이버 발송기한</span>
            <span>손님 안내</span>
            <span />
          </div>
          <ul className="divide-y divide-stone-100">
            {shown.map((x) => (
              <Row key={x.id} x={x} open={open.has(x.id)} onToggle={() => toggle(x.id)} onDraft={() => setDraftOf(x)} openCard={openCard} dropManual={dropManual} />
            ))}
          </ul>
        </div>
      )}
      {draftOf && (
        <DraftSheet
          row={list.find((x) => x.id === draftOf.id) || draftOf}
          inbox={inbox}
          online={online}
          onClose={() => setDraftOf(null)}
          saveCard={saveCard}
          openCard={openCard}
          onSent={(t) => {
            setMsg(t);
            D.reload("delay_sent_manual");
          }}
        />
      )}
    </section>
  );
}

function StateChip({ x }) {
  if (x.state === "done")
    return (
      <span className="flex flex-col gap-0.5">
        <span className="w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800" title={x.notice.note}>
          {x.notice.via} {md(x.notice.on)} 안내함
        </span>
        {x.stale && <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">다시 안내? {x.stale}</span>}
      </span>
    );
  if (x.state === "planned") return <span className="w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{x.planned.via} · {x.planned.note}</span>;
  if (x.state === "board") return <span className="w-fit rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600" title="상품명 리오더 꼬리표(순차 출고)를 보고 산 주문 — 세원 11/11">리오더 안내 보고 주문 · {md(x.boardUntil)} 지나면 안내</span>;
  if (x.state === "watch") return <span className="w-fit rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">아직 평일 {x.days}일째 · 3일째부터 안내</span>;
  return <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">안내 안 함</span>;
}

function Row({ x, open, onToggle, onDraft, openCard, dropManual }) {
  const late = x.days >= NOTICE_DAYS;
  const np = x.np;
  const naver = x.place === "네이버페이";
  const canDraft = ["need", "watch", "board"].includes(x.state) || !!x.stale;
  return (
    <li className={"px-2 py-2.5 " + (x.state === "need" ? "bg-amber-50/40" : "")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 lg:grid-cols-[6rem_minmax(0,1fr)_9rem_5.5rem_7rem_11rem_6.5rem] lg:items-start">
        {/* 주문일 · 며칠째 */}
        <div className="col-span-2 flex items-baseline gap-2 lg:col-span-1 lg:block">
          <span className="text-sm font-semibold text-stone-900 tabular-nums">{dayLabel(x.payDay)}</span>
          <span className={"text-xs font-semibold tabular-nums lg:block " + (late ? "text-rose-700" : "text-amber-700")}>{x.why}</span>
        </div>
        {/* 상품 · 옵션 */}
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <ul className="space-y-0.5">
            {x.lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1 text-sm">
                <span className={"min-w-0 truncate " + (l.ship ? "text-stone-400 line-through" : "text-stone-900")}>{l.n}</span>
                {l.o && <span className="rounded bg-stone-800 px-1.5 py-px text-[11px] font-semibold text-white">{l.o}</span>}
                {l.q > 1 && <span className="text-xs text-stone-500">×{l.q}</span>}
                {l.ship ? (
                  <span className="text-[11px] text-stone-400">출고됨</span>
                ) : l.late ? (
                  <span className="rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-800">늦는 옵션</span>
                ) : ["ok", "due"].includes(l.eta.tone) ? (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-800">{l.eta.tone === "ok" ? "바로 가능" : "나갔는지 확인"}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {x.name || "손님"}
            {x.tel4 ? ` · ${x.tel4}` : ""} ·{" "}
            <a href={orderAdminUrl(x.id)} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono hover:text-rose-700 hover:underline">
              {x.id}
            </a>
            {x.mixed && <span className="ml-1 whitespace-nowrap rounded-full bg-sky-50 px-1.5 py-px font-semibold text-sky-800">섞인 주문 — 가능한 것부터?</span>}
          </p>
        </div>
        {/* 입고·출고 예정 */}
        <div className="text-xs text-stone-700">
          <span className="text-[10px] text-stone-400 lg:hidden">입고·출고 예정 </span>
          {x.lines
            .filter((l) => !l.ship && !["ok"].includes(l.eta.tone))
            .map((l, i) => (
              <span key={i} className={"block " + (l.eta.tone === "none" ? "text-rose-700" : "")}>
                {l.eta.label}
              </span>
            ))}
          {x.lines.every((l) => l.ship || l.eta.tone === "ok") && <span className="text-emerald-700">재고 있음 — 출고 대기</span>}
        </div>
        {/* 채널 */}
        <div className="text-right lg:text-left">
          <span className={"inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " + (PLACE_TONE[x.place] || PLACE_TONE.카페24)}>{x.place}</span>
        </div>
        {/* 네이버 발송기한 */}
        <div className="text-xs tabular-nums">
          {np ? (
            np.done ? (
              <span className="text-emerald-700">처리함 · 기한 {md(np.doneDeadline)}</span>
            ) : np.deadline ? (
              <span className={np.dday <= NPAY_SOON ? "font-bold text-rose-700" : "text-stone-600"}>
                {md(np.deadline)} {np.dday < 0 ? "지남" : np.dday === 0 ? "오늘" : `D-${np.dday}`}
                {np.queued ? " · 처리 맡김" : ""}
              </span>
            ) : (
              <span className="text-stone-400">—</span>
            )
          ) : x.place === "톡체크아웃" ? (
            <span className="text-stone-500">톡체크아웃 센터에서</span>
          ) : naver ? (
            <span className="text-stone-400">목록에 없음</span>
          ) : (
            <span className="text-stone-300 lg:inline hidden">—</span>
          )}
        </div>
        {/* 손님 안내 */}
        <div className="col-span-2 flex flex-wrap items-center gap-1 lg:col-span-1">
          <StateChip x={x} />
          {x.open.length > 0 && (
            <button type="button" onClick={() => openCard?.(x.open[0].csId)} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">
              답할 문의 있음 →
            </button>
          )}
          {x.contacts.filter((c) => c.kind !== "room").length > 0 && (
            <button type="button" onClick={onToggle} className="text-[11px] text-stone-400 hover:text-stone-700">
              {open ? "접기" : `연락 ${x.contacts.filter((c) => c.kind !== "room").length}`}
            </button>
          )}
        </div>
        {/* 버튼 */}
        <div className="col-span-2 flex justify-end lg:col-span-1">
          {naver && np && !np.done ? (
            // 주소 #… 로 가면 App 이 화면을 바꾸므로(#cs 등) 스크롤로만
            <button type="button" onClick={() => document.getElementById("npay-delay")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="flex items-center gap-1 rounded-lg border border-green-300 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-50">
              <Truck size={12} /> 발송지연 칸
            </button>
          ) : canDraft ? (
            <button type="button" onClick={onDraft} className={"flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold " + (x.state === "need" || x.stale ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-stone-200 text-stone-600 hover:border-rose-300")}>
              <MessageSquareText size={12} /> 안내 초안
            </button>
          ) : null}
        </div>
      </div>
      {open && (
        <ul className="mt-2 space-y-1 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
          {x.contacts
            .filter((c) => c.kind !== "room")
            .map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold text-stone-800">{c.via}</span>
                <span className="tabular-nums">{c.on ? when(c.on) : ""}</span>
                <span className="min-w-0 truncate text-stone-500">{c.note}</span>
                <span className="text-[10px] text-stone-400">{{ notice: "안내", planned: "보낼 예정", other: "다른 얘기", open: "답할 문의" }[c.kind] || ""}</span>
                {c.csId && (
                  <button type="button" onClick={() => openCard?.(c.csId)} className="text-rose-700 hover:underline">
                    카드 보기
                  </button>
                )}
                {c.mid && c.by === "ERP" && (
                  <button type="button" onClick={() => dropManual(c.mid)} className="text-stone-400 hover:text-rose-700" aria-label="기록 지우기">
                    <X size={11} />
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
    </li>
  );
}

const VIAS = ["문자", "카톡", "톡톡", "전화"];
function DraftSheet({ row, inbox, online, onClose, saveCard, openCard, onSent }) {
  const [reorder, setReorder] = useState(false);
  const [partial, setPartial] = useState(!!row.mixed);
  const [sched, setSched] = useState(row.sched || "");
  const [edited, setEdited] = useState(null); // 손으로 고친 글(있으면 이걸 씀)
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => delayDraft(row, { reorder, partial, when: sched }), [row, reorder, partial, sched]);
  const text = edited ?? base;
  const blank = draftBlank(text);
  // 그 주문의 '답할 문의' 카드(초안을 넣을 수 있는 것)
  const card = useMemo(() => {
    const id = row.open[0]?.csId;
    return id ? inbox.find((y) => y.id === id) : null;
  }, [row, inbox]);
  const copy = async () => {
    if (blank) return;
    const ok = await copyText(text);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  };
  const markSent = async (via) => {
    if (!window.confirm(`${row.name || "손님"} 주문(${row.id})에 ${via}로 안내를 보냈다고 적을까요?`)) return;
    setBusy(true);
    try {
      const rec = { id: newId("ds"), order: row.id, on: new Date().toISOString(), via, note: "늦는 주문 안내 (ERP)", by: "ERP", text: text.slice(0, 800) };
      await changeKey("delay_sent_manual", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), rec] }), { items: [] });
      onSent(`${row.id} — '${via} 안내함'으로 적었어요.`);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const toCard = async () => {
    if (!card || blank) return;
    setBusy(true);
    try {
      const at = new Date().toISOString();
      await saveCard({ ...card, draft: text, aiDraft: text, blanks: [], fills: {}, dups: [], confirmed: false, status: "ready", error: "", type: card.type || "배송", draftedAt: at, basis: ((card.basis || "") + " · 늦는 주문 안내 초안(세원 틀)").replace(/^ · /, "") });
      onSent(`${card.customer || "손님"} 문의 카드에 초안을 넣었어요 — '문의 답하기'에서 보고 보내 주세요.`);
      onClose();
      openCard?.(card.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={`안내 초안 · ${row.name || "손님"} · ${row.id}`} onClose={onClose} />
      <div className="space-y-3 overflow-y-auto px-4 py-3">
        <ul className="space-y-0.5 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
          {row.lines.map((l, i) => (
            <li key={i}>
              <b className="text-stone-900">{l.n}</b> {l.o} {l.q > 1 ? `×${l.q}` : ""} — {l.ship ? "출고됨" : l.eta.label}
            </li>
          ))}
          <li className="text-stone-500">
            결제 {dayLabel(row.payDay)} · {row.why} · {row.place}
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">(일정)</span>
            <input value={sched} onChange={(e) => (setSched(e.target.value), setEdited(null))} placeholder="예: 11/23~27" className={"w-32 rounded-lg border px-2 py-1 text-sm " + (sched ? "border-stone-200" : "border-amber-300 bg-amber-50")} />
          </label>
          {row.mixed && (
            <label className="flex items-center gap-1.5 text-xs text-stone-700">
              <input type="checkbox" checked={partial} onChange={(e) => (setPartial(e.target.checked), setEdited(null))} className="accent-rose-700" />
              부분 배송 한 줄 ('가능한 것부터 먼저 보내 드릴까요?')
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-stone-700" title="11/17 세원이 고친 리오더 표기 상품판 둘째 줄 — 나머지는 틀 그대로">
            <input type="checkbox" checked={reorder} onChange={(e) => (setReorder(e.target.checked), setEdited(null))} className="accent-rose-700" />
            리오더판 둘째 줄 (11/17 세원 문구)
          </label>
        </div>
        {reorder && <p className="text-[11px] text-amber-800">리오더판 둘째 줄의 '다음주 중'은 세원 문구 그대로예요 — 일정이 다르면 아래 글에서 고쳐 주세요.</p>}
        <textarea value={text} onChange={(e) => setEdited(e.target.value)} rows={13} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-rose-600" />
        {blank && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">(일정) 칸을 채워야 복사·넣기가 돼요{row.sched ? "" : " — 거래처 입고 예정에 아직 날짜가 없어요(입고 예정 탭)"}.</p>}
        <p className="text-[11px] leading-relaxed text-stone-500">
          세원 틀(11/11) 그대로예요 · 네이버 문단 없음 · 취소 권하는 말 없음. 보내기는 여기서 안 해요 — 카페24 문자 권한이 아직 없어서 복사해서 카페24 관리자 문자·카톡으로 보내고 '보냈어요'를 눌러 주세요.
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <button type="button" onClick={copy} disabled={blank} className="flex items-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:bg-stone-300">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "복사했어요" : "글 복사"}
          </button>
          {card && (
            <button type="button" onClick={toCard} disabled={blank || busy} className="flex items-center gap-1.5 rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              <MessageSquareText size={14} /> 이 주문 문의 카드에 초안으로
            </button>
          )}
          {row.room?.url && (
            <a href={row.room.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 hover:border-rose-300">
              <ExternalLink size={13} /> {row.room.ch === "naver" ? "톡톡" : "카톡"} 방 열기
            </a>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-1 text-xs text-stone-500">
            보냈어요:
            {VIAS.map((v) => (
              <button key={v} type="button" disabled={busy} onClick={() => markSent(v)} className="rounded-lg border border-stone-200 px-2 py-1 font-semibold text-stone-700 hover:border-emerald-400 hover:text-emerald-800">
                {v}
              </button>
            ))}
          </span>
        </div>
      </div>
    </Sheet>
  );
}
