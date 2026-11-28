import { useEffect, useState } from "react";
import { PackageCheck, RefreshCw, ExternalLink, AlertTriangle, CircleCheck, Clock3, Truck } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { when } from "../lib/cs";
import { newId } from "../lib/id";

/**
 * CS 관리 › 반품·교환 맨 위 — 네이버페이 반품 수거완료 확인 (11/28 세원 방향성 창).
 * "반품수거완료 뜨면 확인해서 erp에 알려줘 · 넥스트팩에서 양품화 됐는지 · 반품 배송비가 환불금 공제예정이면 그냥 반품 완료처리,
 *  반품사유가 단순변심 외(제품불량 등)면 확인 — 고객이 반품비 안 내려고 그렇게 신청한 걸 수도."
 * 사무실 PC poclo-cafe24/npay_returns.py 가 30분마다(9~22시) settings npay_returns 에 — 네이버페이센터 반품관리(요청·수거중·수거완료) +
 * 반품배송비 창(결제방법) + 넥스트팩 '반품 내역'(np_returns). ⛔ '반품 완료처리'(환불)는 세원이 네이버페이센터에서 직접 — 여기선 판단만.
 */
const NPAY_RETURN_URL = "https://admin.pay.naver.com/o/v3/claim/return";
const V = {
  ok: { label: "완료 처리해도 돼요", tone: "bg-emerald-100 text-emerald-800", Icon: CircleCheck },
  check: { label: "확인 필요", tone: "bg-rose-100 text-rose-800", Icon: AlertTriangle },
  wait: { label: "넥스트팩 검수 기다림", tone: "bg-amber-100 text-amber-900", Icon: Clock3 },
  pickup: { label: "수거 전", tone: "bg-stone-100 text-stone-600", Icon: Truck },
};
const ORDER = { check: 0, ok: 1, wait: 2, pickup: 3 };
const STAGE = { req: "반품요청", pickup: "수거중", collected: "수거완료" };
const md = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "");

export default function NpayReturns({ online }) {
  const [v, setV] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => loadKey("npay_returns", online, null).then((x) => alive && setV(x)).catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === "npay_returns" && load());
    const off2 = watchKeys(["npay_returns"], load, 30000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);
  const rows = [...(v?.rows || [])].sort((a, b) => (ORDER[a.verdict] ?? 9) - (ORDER[b.verdict] ?? 9) || String(a.collectedAt || a.requestedAt).localeCompare(String(b.collectedAt || b.requestedAt)));
  const collected = rows.filter((r) => r.stage === "collected");
  const before = rows.filter((r) => r.stage !== "collected");
  const n = (k) => rows.filter((r) => r.verdict === k).length;
  const refresh = async () => {
    await changeKey("cs_queue", online, (q) => ({ ...(q || {}), items: [...((q || {}).items || []), { id: newId("q"), kind: "npay_returns", at: new Date().toISOString() }] }), { items: [] });
    setMsg("사무실 PC에 네이버페이 반품·넥스트팩 다시 읽기를 맡겼어요 — 1~2분 뒤 바뀌어요.");
  };
  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <PackageCheck size={15} className="text-green-700" />
        <span className="text-sm font-bold text-stone-900">네이버페이 반품 — 수거완료 확인</span>
        <span className="text-sm text-stone-700 tabular-nums">
          수거완료 {collected.length}건 · <b className={n("ok") ? "text-emerald-700" : "text-stone-500"}>완료 처리 가능 {n("ok")}</b> · <b className={n("check") ? "text-rose-700" : "text-stone-500"}>확인 필요 {n("check")}</b>
          {before.length > 0 && ` · 수거 전 ${before.length}`}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-stone-400">
          {v?.at ? `${when(v.at)} 읽음` : "아직 안 읽음"}
          {v?.error && (
            <span className="text-rose-600" title={v.error}>
              · 읽기 실패
            </span>
          )}
          <a href={NPAY_RETURN_URL} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-stone-500 hover:text-stone-800">
            네이버페이 반품관리 <ExternalLink size={11} />
          </a>
          <button type="button" onClick={refresh} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-stone-500 hover:text-stone-800">
            <RefreshCw size={12} /> 다시 읽기
          </button>
        </span>
      </div>
      <p className="px-4 pb-2 text-xs text-stone-500">
        단순 변심 + 반품비 '환불금 공제예정' + 넥스트팩 양품이면 초록 — 네이버페이센터에서 <b>반품 완료처리</b>를 눌러 주세요(환불이라 자동으로 안 눌러요). 단순 변심이 아니면 빨강 — 손님이 반품비를 안 내려고 고른 사유일 수 있어요.
      </p>
      {msg && <p className="mx-4 mb-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
      {v?.error && <p className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">{v.error}</p>}
      {!rows.length ? (
        <p className="px-4 pb-3 text-xs text-stone-400">{v ? "지금은 네이버페이 반품이 없어요." : "사무실 PC가 처음 읽으면 여기에 떠요."}</p>
      ) : (
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {rows.map((r) => (
            <NpayRow key={r.id || r.orderNo + r.product} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NpayRow({ r }) {
  const t = V[r.verdict] || V.pickup;
  const simple = /단순\s*변심/.test(r.reason || "");
  const deduct = /공제/.test(r.feeHow || "");
  const np = r.np;
  const npTone = !np ? "text-amber-700" : np.grade === "good" ? "text-emerald-700" : np.grade === "bad" || np.grade === "hold" ? "text-rose-700" : "text-amber-700";
  return (
    <li className={"px-4 py-2.5 " + (r.stage !== "collected" ? "opacity-70" : "")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold " + t.tone}>
          <t.Icon size={12} /> {t.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900" title={r.product}>
          {r.product} <span className="font-normal text-stone-500">{r.option}</span>
          {r.qty > 1 && <span className="font-normal text-stone-500"> · {r.qty}장</span>}
        </span>
        <span className="text-xs text-stone-500">{r.buyer}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-600">
        <span>
          {STAGE[r.stage] || r.status}
          {r.collectedAt ? ` ${md(r.collectedAt)}` : r.requestedAt ? ` · 요청 ${md(r.requestedAt)}` : ""}
        </span>
        <span className={simple ? "" : "font-semibold text-rose-700"}>사유 {r.reason || "없음"}</span>
        <span className={deduct ? "text-emerald-700" : r.fee ? "font-semibold text-rose-700" : "text-stone-500"}>
          반품비 {r.fee ? `${Number(r.fee).toLocaleString()}원` : "0원"}
          {r.feeHow ? ` · ${r.feeHow.replace(/\s*\(.*\)\s*$/, "")}` : ""}
        </span>
        <span className={npTone}>넥스트팩 {np ? `${np.stat}${np.on ? ` (${md(np.on)} 신청)` : ""}` : "아직 없음"}</span>
        {r.hold && <span className="text-stone-500">환불보류 {r.hold}</span>}
        {r.autoRefundAt && <span className="text-stone-500">자동환불 {md(r.autoRefundAt)}</span>}
        <span className="font-mono text-[11px] text-stone-400">{r.orderNo}</span>
      </div>
      {(r.why?.length > 0 || r.hint) && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {(r.why || []).map((w, i) => (
            <li key={i} className="text-rose-700">
              · {w}
            </li>
          ))}
          {r.hint && <li className="text-sky-800">· {r.hint}</li>}
        </ul>
      )}
    </li>
  );
}
