import { useEffect, useState } from "react";
import { PackageCheck, RefreshCw, AlertTriangle, CircleCheck, Clock3, Truck } from "lucide-react";
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
  const n = (k) => rows.filter((r) => r.verdict === k).length;
  const refresh = async () => {
    await changeKey("cs_queue", online, (q) => ({ ...(q || {}), items: [...((q || {}).items || []), { id: newId("q"), kind: "npay_returns", at: new Date().toISOString() }] }), { items: [] });
    setMsg("사무실 PC에 네이버페이 반품·넥스트팩 다시 읽기를 맡겼어요 — 1~2분 뒤 바뀌어요.");
  };
  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-2">
        <PackageCheck size={17} className="text-green-700" />
        <h3 className="text-base font-bold text-stone-900">네이버페이 반품 — 완료 처리 판단</h3>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-stone-400">
          {v?.at ? `${when(v.at)} 읽음` : "아직 안 읽음"}
          <button type="button" onClick={refresh} className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800">
            <RefreshCw size={11} /> 다시 읽기
          </button>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        {[
          ["ok", "완료 처리 가능", "text-emerald-700", "ring-emerald-200 bg-emerald-50/60"],
          ["check", "확인 필요", "text-rose-700", "ring-rose-200 bg-rose-50/60"],
          ["wait", "검수 기다림 · 수거 전", "text-amber-700", "ring-stone-200 bg-white"],
        ].map(([k, label, tone, box]) => {
          const c = k === "wait" ? n("wait") + n("pickup") : n(k);
          return (
            <div key={k} className={"rounded-xl px-3 py-2.5 ring-1 " + (c ? box : "ring-stone-200 bg-white")}>
              <span className="block text-xs font-semibold text-stone-600">{label}</span>
              <span className={"block text-2xl leading-tight font-bold tabular-nums " + (c ? tone : "text-stone-300")}>{c}</span>
            </div>
          );
        })}
      </div>
      {n("ok") > 0 && (
        <div className="mx-4 mb-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-950 ring-1 ring-emerald-200">
          <p className="font-bold">완료 처리하는 곳 — 환불이 나가는 단추라 세원이 직접 눌러요</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px]">
            <li>
              <a href={NPAY_RETURN_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
                네이버페이센터 › 판매관리 › 반품관리
              </a>{" "}
              (주문형)
            </li>
            <li>맨 위 '반품수거완료 N건' 숫자를 눌러요</li>
            <li>아래 초록 카드의 상품주문번호 줄 체크 → 표 아래 [반품 완료처리]</li>
            <li>환불보류가 '보류중'이면 먼저 [환불보류 해제]가 필요할 수 있어요</li>
          </ol>
        </div>
      )}
      {msg && <p className="mx-4 mb-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-700">{msg}</p>}
      {v?.error && <p className="mx-4 mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">{v.error}</p>}
      {!rows.length ? (
        <p className="px-4 pb-4 text-sm text-stone-400">{v ? "지금은 네이버페이 반품이 없어요." : "사무실 PC가 처음 읽으면 여기에 떠요."}</p>
      ) : (
        <ul className="space-y-2.5 px-3 pb-4 sm:px-4">
          {rows.map((r) => (
            <NpayRow key={r.id || r.orderNo + r.product} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

const BAR = { ok: "border-l-emerald-500", check: "border-l-rose-500", wait: "border-l-amber-400", pickup: "border-l-stone-300" };
function Check({ ok, wait, children }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={"flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white " + (ok ? "bg-emerald-500" : wait ? "bg-amber-400" : "bg-rose-500")}>{ok ? "✓" : wait ? "…" : "!"}</span>
      <span className={ok ? "text-stone-700" : wait ? "text-amber-800" : "font-semibold text-rose-700"}>{children}</span>
    </li>
  );
}
function NpayRow({ r }) {
  const t = V[r.verdict] || V.pickup;
  const simple = /단순\s*변심/.test(r.reason || "");
  const deduct = /공제/.test(r.feeHow || "");
  const np = r.np;
  const npOk = np?.grade === "good";
  const npWait = !np || np.grade === "wait" || !np.grade;
  return (
    <li className={"rounded-xl border border-l-4 border-stone-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] " + (BAR[r.verdict] || BAR.pickup)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-stone-900" title={r.product}>
            {String(r.product || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "")}
          </p>
          <p className="text-sm text-stone-500">
            {r.option}
            {r.qty > 1 && ` · ${r.qty}장`}
            {r.amount ? ` · ${Number(r.amount).toLocaleString()}원` : ""}
          </p>
        </div>
        <span className={"inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold " + t.tone}>
          <t.Icon size={13} /> {t.label}
        </span>
      </div>
      <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-3">
        <Check ok={simple}>사유 {r.reason || "없음"}</Check>
        <Check ok={deduct} wait={!r.fee && !r.feeHow}>
          반품비 {r.fee ? `${Number(r.fee).toLocaleString()}원` : "0원"}
          {r.feeHow ? ` · ${r.feeHow.replace(/\s*\(.*\)\s*$/, "")}` : ""}
        </Check>
        <Check ok={npOk} wait={npWait && !(np && (np.grade === "bad" || np.grade === "hold"))}>
          넥스트팩 {np ? np.stat : r.stage === "collected" ? "아직 안 들어옴" : "수거 전"}
        </Check>
      </ul>
      {(r.why?.length > 0 || r.hint) && (
        <ul className="mt-2 space-y-0.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
          {(r.why || []).map((w, i) => (
            <li key={i} className="text-rose-700">
              · {w}
            </li>
          ))}
          {r.hint && <li className="text-sky-800">· {r.hint}</li>}
        </ul>
      )}
      <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-stone-500">
        <span>
          {STAGE[r.stage] || r.status}
          {r.collectedAt ? ` ${md(r.collectedAt)}` : r.requestedAt ? ` · 요청 ${md(r.requestedAt)}` : ""}
        </span>
        <span>{r.buyer}</span>
        {r.hold && <span>환불보류 {r.hold}</span>}
        {r.autoRefundAt && <span>자동환불 {md(r.autoRefundAt)}</span>}
        <span className="font-mono text-[11px] text-stone-400">상품주문번호 {r.id}</span>
      </p>
    </li>
  );
}
