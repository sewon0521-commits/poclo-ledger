/**
 * 일 › 주문내역 (2026-11-12 세원 "요런 식으로 제작 가능? erp 일 칸에" — 넥스트팩식 주문내역 화면)
 * 쇼핑몰 주문이 창고에서 어디까지 갔는지. 자료·규칙은 lib/orderTrack.js 머리말.
 * 줄을 누르면 그 자리에 주문 상세가 펼쳐진다. 3일 넘게 안 나간 주문은 빨갛게 + CS 관리 '먼저 연락(배송지연)'으로 바로.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Check, ExternalLink, Loader2, RefreshCw, Search, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { orderAdminUrl } from "../lib/cs";
import { won } from "../lib/sales";
import { newId } from "../lib/id";
import { Empty } from "./ui";
import { ORDER_KEYS, LATE_DAYS, STAGES, PERIODS, mergeOrders, stageOf, waitDays, todayStr, mdhm, cleanName, qtyOf, trackingOf, hit, inPeriod, sentOf, mdOf, trackUrl } from "../lib/orderTrack";

const PERIOD_KEY = "poclo_orders_period";
const read = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};

function useOrders(online) {
  const [full, setFull] = useState(null);
  const [live, setLive] = useState(null);
  const [state, setState] = useState("loading");
  const load = useCallback(
    async (only) => {
      try {
        const keys = only ? [only] : ORDER_KEYS;
        const vals = await Promise.all(keys.map((k) => loadKey(k, online, {})));
        keys.forEach((k, i) => (k === "orders_track" ? setFull(vals[i]) : setLive(vals[i])));
        setState("ready");
      } catch {
        setState((s) => (s === "loading" ? "error" : s));
      }
    },
    [online],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    if (!online) return;
    const again = (k) => ORDER_KEYS.includes(k) && load(k);
    const off = onSettingsChange(again);
    const stop = watchKeys(ORDER_KEYS, again, 15000);
    return () => {
      off();
      stop();
    };
  }, [online, load]);
  return { full, live, state, load };
}

function StageMark({ r, stage, today, onDelay, sent }) {
  const d = waitDays(r, stage, today);
  const its = r.items || [];
  if (stage === "claim") return <span className="text-stone-400">{its[0]?.st || "취소·반품"}</span>;
  if (stage === "wait") return <span className="text-stone-500">○ 입금 전</span>;
  if (stage === "recv" || stage === "inv") {
    const late = d >= LATE_DAYS;
    return (
      <span className={"inline-flex flex-wrap items-center gap-x-1.5 " + (late ? "font-semibold text-rose-700" : "text-stone-700")}>
        ○ {stage === "recv" ? "접수" : "송장 나옴"} · {late ? `${d}일 지연` : d ? `${d}일째` : "오늘"}
        {late && sent?.length > 0 && (
          <span className="rounded-full bg-stone-100 px-1.5 py-px text-[11px] font-medium text-stone-600" title={sent.map((e) => `${mdhm(e.on)} ${e.via}${e.note ? ` · ${e.note}` : ""}`).join(" / ")}>
            이미 보냄 · {mdOf(sent[sent.length - 1].on)} {sent[sent.length - 1].via}
          </span>
        )}
        {late && !sent?.length && onDelay && (
          <button type="button" onClick={(e) => (e.stopPropagation(), onDelay())} className="rounded-full bg-rose-50 px-1.5 py-px text-[11px] font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
            먼저 연락
          </button>
        )}
      </span>
    );
  }
  const sh = its.find((i) => i.sh)?.sh;
  const dl = its.find((i) => i.dl)?.dl;
  if (stage === "ship") return <span className="text-stone-900">● 배송 {sh ? mdhm(sh) : ""}</span>;
  return <span className="text-stone-500">● 완료 {dl ? mdhm(dl).slice(0, 5) : ""}</span>;
}

/** 송장번호 → 그 택배사 조회 화면(번호까지 채워서, 새 탭). 모르는 택배사면 번호만 */
function TrackLink({ carrier, no }) {
  const url = trackUrl(carrier, no);
  if (!url) return <span className="text-stone-800">{no}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`${carrier || "택배사"}에서 배송 조회`} className="inline-flex items-center gap-0.5 font-medium text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-rose-700 hover:decoration-rose-300">
      {no} <ExternalLink size={11} className="text-stone-400" />
    </a>
  );
}

function CopyBtn({ text, label }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text).then(() => (setOk(true), setTimeout(() => setOk(false), 1500)));
      }}
      className="inline-flex items-center gap-1 rounded px-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      title={`${label} 복사`}
    >
      {ok ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
    </button>
  );
}

function Detail({ r, sent }) {
  const admin = orderAdminUrl(r.id);
  return (
    <div className="space-y-2 bg-stone-50/80 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-600">
        <span>
          주문번호 <b className="font-semibold text-stone-900 tabular-nums">{r.id}</b> <CopyBtn text={r.id} label="주문번호" />
        </span>
        <span>주문 {mdhm(r.at)}{r.pay && r.pay !== r.at ? ` · 결제 ${mdhm(r.pay)}` : ""}</span>
        {r.method && <span>{r.method}</span>}
        {r.amount > 0 && <span className="tabular-nums">{won(r.amount)}원</span>}
        {r.place && <span className="text-stone-400">{r.place}</span>}
        {r.tel4 && <span className="text-stone-400">휴대폰 끝 {r.tel4}</span>}
        {admin && (
          <a href={admin} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-rose-700 hover:underline">
            카페24 주문 <ExternalLink size={11} />
          </a>
        )}
      </div>
      {sent?.length > 0 && (
        <p className="text-stone-600">
          <span className="font-semibold text-stone-700">손님에게 나간 연락</span>{" "}
          {sent.map((e, k) => (
            <span key={k} className="mr-2 inline-block rounded bg-white px-1.5 py-0.5 ring-1 ring-stone-200">
              {mdhm(e.on)} {e.via}
              {e.note && <span className="text-stone-400"> · {e.note}</span>}
            </span>
          ))}
        </p>
      )}
      <ul className="divide-y divide-stone-200/70 rounded-lg bg-white ring-1 ring-stone-200">
        {(r.items || []).map((i, k) => (
          <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="min-w-0 flex-1 font-medium text-stone-800">
              {cleanName(i.n)} {i.o && <span className="font-normal text-stone-500">· {i.o}</span>}
            </span>
            <span className="tabular-nums text-stone-600">{i.q}장</span>
            <span className={/^[CRE]/.test(i.s) ? "text-stone-400" : "text-stone-700"}>{i.st}</span>
            <span className="tabular-nums text-stone-500">
              {i.t ? (
                <>
                  {i.c} <TrackLink carrier={i.c} no={i.t} /> <CopyBtn text={i.t} label="송장번호" />
                </>
              ) : (
                "송장 아직 없음"
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ r, stage, today, open, onToggle, onDelay, sent }) {
  const its = r.items || [];
  const first = its.find((i) => !/^[CRE]/.test(i.s)) || its[0] || {};
  const more = its.length - 1;
  const q = qtyOf(r);
  const tk = trackingOf(r);
  return (
    <>
      <tr onClick={onToggle} className={"cursor-pointer border-b border-stone-100 " + (open ? "bg-stone-50" : "hover:bg-stone-50/70")}>
        <td className="px-4 py-2.5 whitespace-nowrap text-stone-600 tabular-nums">{mdhm(r.at)}</td>
        <td className="px-2 py-2.5 whitespace-nowrap">
          <span className="font-medium text-stone-900">{r.name || "—"}</span>
          {r.tel4 && <span className="ml-1 text-[11px] text-stone-400 tabular-nums">{r.tel4}</span>}
        </td>
        <td className="max-w-[18rem] px-2 py-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-stone-800" title={its.map((i) => `${cleanName(i.n)}${i.o ? ` · ${i.o}` : ""}`).join("\n")}>
              {cleanName(first.n)}
            </span>
            {more > 0 && (
              <span className="inline-flex shrink-0 items-center text-[11px] text-stone-500">
                외 {more}종 <ChevronDown size={12} className={open ? "rotate-180" : ""} />
              </span>
            )}
          </span>
        </td>
        <td className="px-2 py-2.5 whitespace-nowrap text-stone-700 tabular-nums">
          {q}장{its.length > 1 && <span className="ml-0.5 text-stone-400">합포</span>}
        </td>
        <td className="px-2 py-2.5 whitespace-nowrap">
          <StageMark r={r} stage={stage} today={today} onDelay={onDelay} sent={sent} />
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{tk ? <TrackLink carrier={tk.carrier} no={tk.no} /> : <span className="text-stone-400">아직 없음</span>}</td>
      </tr>
      {open && (
        <tr className="border-b border-stone-200">
          <td colSpan={6} className="p-0">
            <Detail r={r} sent={sent} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function OrdersPage({ online, onPage }) {
  const D = useOrders(online);
  const [q, setQ] = useState("");
  const [period, setPeriodState] = useState(() => read(PERIOD_KEY, "14"));
  const [stage, setStage] = useState("all");
  const [open, setOpen] = useState(null);
  const [n, setN] = useState(150);
  const [asked, setAsked] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const today = todayStr();
  const setPeriod = (p) => {
    setPeriodState(p);
    setN(150);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* 그냥 둠 */
    }
  };

  const all = useMemo(() => mergeOrders(D.full, D.live).map((r) => ({ r, stage: stageOf(r) })), [D.full, D.live]);
  const inRange = useMemo(() => all.filter(({ r }) => inPeriod(r, period, today) && hit(r, q)), [all, period, today, q]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map(([k]) => [k, 0]));
    for (const x of inRange) {
      c.all += 1;
      c[x.stage] += 1;
    }
    return c;
  }, [inRange]);
  const sent = D.live?.sent;
  const isLate = ({ r, stage: s }) => (waitDays(r, s, today) ?? 0) >= LATE_DAYS;
  const lateRows = inRange.filter(isLate);
  const late = lateRows.length;
  const lateNew = lateRows.filter(({ r }) => !sentOf(r, sent).length).length;
  const rows = (stage === "all" ? inRange : inRange.filter((x) => x.stage === stage)).filter((x) => !lateOnly || isLate(x));
  const at = [D.live?.at, D.full?.at].filter(Boolean).sort().pop();
  const atText = at ? new Date(at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";

  const refresh = async () => {
    setAsked("asking");
    try {
      await changeKey("cs_queue", online, (v) => ({ ...(v || {}), items: [...((v || {}).items || []), { id: newId("q"), kind: "orders", at: new Date().toISOString() }] }), { items: [] });
      setAsked("asked");
      setTimeout(() => (D.load(), setAsked("")), 20000);
    } catch {
      setAsked("");
      D.load();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">쇼핑몰 주문이 창고에서 어디까지 갔는지 봅니다. 최근 두 달, 최근 사흘과 아직 안 나간 주문은 10분마다 새로 읽습니다.</p>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-4 pt-3.5 pb-3">
          <div>
            <h2 className="font-semibold text-stone-900">주문내역</h2>
            <p className="mt-0.5 text-xs text-stone-500">줄을 누르면 주문 상세가 열립니다. 결제 다음 날부터 평일 {LATE_DAYS}일 넘게 안 나간 주문은 빨갛게 표시해요.</p>
            <p className="mt-2 text-xs text-stone-400">
              {atText ? `${atText} 기준` : "아직 읽은 기록이 없어요"}
              {(late > 0 || lateOnly) && (
                <button type="button" onClick={() => (setLateOnly(!lateOnly), setN(150))} className={"ml-2 rounded-full px-2 py-px font-semibold " + (lateOnly ? "bg-rose-700 text-white" : "text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50")}>
                  지연 {late}건{late ? ` (연락 전 ${lateNew})` : ""}{lateOnly ? " · 전체 보기" : " · 모아 보기"}
                </button>
              )}
            </p>
          </div>
          <button type="button" onClick={refresh} disabled={asked === "asking"} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400 disabled:opacity-60">
            {asked ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {asked === "asked" ? "사무실 PC가 읽는 중" : "새로 불러오기"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-2.5">
          <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
            <input type="search" value={q} onChange={(e) => (setQ(e.target.value), setN(150))} placeholder="받는 사람 · 전화 끝 4자리 · 주문번호 · 송장 · 상품명" className="w-full rounded-lg border border-stone-300 py-1.5 pr-7 pl-8 text-sm placeholder:text-stone-400 focus:border-rose-700 focus:outline-none" />
            {q && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:text-stone-700" aria-label="지우기">
                <X size={13} />
              </button>
            )}
          </label>
          <div className="flex rounded-lg bg-stone-100 p-0.5">
            {PERIODS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} className={"rounded-md px-2.5 py-1 text-xs font-medium transition " + (period === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STAGES.filter(([k]) => k === "all" || counts[k] > 0 || stage === k || ["recv", "inv", "ship"].includes(k)).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => (setStage(k), setN(150))}
                className={"rounded-full border px-2.5 py-0.5 text-xs tabular-nums " + (stage === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
              >
                {label} {counts[k]}
              </button>
            ))}
          </div>
        </div>

        {D.state === "loading" ? (
          <p className="flex items-center gap-2 px-4 py-10 text-sm text-stone-400">
            <Loader2 size={15} className="animate-spin" /> 불러오는 중
          </p>
        ) : !all.length ? (
          <div className="p-4">
            <Empty title="아직 주문 자료가 없어요" hint="사무실 PC가 켜져 있으면 10분 안에 들어와요. '새로 불러오기'를 누르면 바로 읽어요." />
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 bg-stone-50">
                <tr className="border-b border-stone-200 text-left text-[11px] font-semibold text-stone-500">
                  <th className="px-4 py-2">주문</th>
                  <th className="px-2 py-2">받는 사람</th>
                  <th className="px-2 py-2">상품</th>
                  <th className="px-2 py-2">수량</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-4 py-2">송장</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, n).map(({ r, stage: s }) => (
                  <Row key={r.id} r={r} stage={s} today={today} sent={sentOf(r, sent)} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDelay={onPage ? () => onPage("delay") : null} />
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="px-4 py-8 text-center text-sm text-stone-400">조건에 맞는 주문이 없어요.</p>}
            {rows.length > n && (
              <button type="button" onClick={() => setN(n + 150)} className="w-full border-t border-stone-100 py-2.5 text-xs font-medium text-stone-500 hover:bg-stone-50">
                {rows.length - n}건 더 보기
              </button>
            )}
          </div>
        )}
        <div className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400 tabular-nums">주문 {rows.length}건</div>
      </section>
    </div>
  );
}
