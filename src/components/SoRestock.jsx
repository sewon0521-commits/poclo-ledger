import { useState } from "react";
import { Truck, ChevronDown, Plus, Check, X } from "lucide-react";
import { DEFAULT_RESTOCK, formulaText } from "../lib/restock";

/**
 * SO+ 발주 변환 › 오늘출발 여유분 (lib/restock.js 머리말, 11/8).
 * 밀린 주문(발주 파일) 위에 '며칠 치'를 더 사서 오늘출발 재고가 남게 — 줄마다 계산식을 보여 주고 '넣기'로 수량에 더한다.
 * items: [{id, kind: 'file'|'new', name, option, sold, span, avg, target, have, np, rack, add, slow, extra, canAdd}]
 */
const OPEN = "poclo_restock_open";

const mmddhm = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function Num({ label, value, onChange, unit, min = 0, max = 30 }) {
  return (
    <label className="flex items-center gap-1 whitespace-nowrap">
      {label}
      <input
        key={value}
        defaultValue={value}
        inputMode="numeric"
        onBlur={(e) => {
          const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
          if (Number.isNaN(n) || n < min || n > max) e.target.value = String(value);
          else if (n !== value) onChange(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-10 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-center text-stone-900 tabular-nums outline-none focus:border-rose-600"
      />
      {unit}
    </label>
  );
}

export default function SoRestock({ items, conf, setConf, salesAt, stockAt, hasSales, onAdd, onRemove, onAddAll }) {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN) !== "0";
    } catch {
      return true;
    }
  });
  const setOpen = (v) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN, v ? "1" : "0");
    } catch {
      /* 기억 못 해도 된다 */
    }
  };
  const c = { ...DEFAULT_RESTOCK, ...conf };
  const want = items.filter((x) => !x.slow && (x.add > 0 || x.extra > 0));
  const slow = items.filter((x) => x.slow && x.kind === "file");
  const todo = want.filter((x) => x.add > 0 && x.extra !== x.add && x.canAdd);
  const todoPieces = todo.reduce((n, x) => n + x.add, 0);
  const added = want.filter((x) => x.extra > 0);
  const [now] = useState(() => Date.now());
  const stockAge = stockAt ? (now - new Date(stockAt).getTime()) / 86400000 : null;

  return (
    <div className="mb-3 rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-2 text-left">
          <Truck size={18} className="shrink-0 text-emerald-700" />
          <span className="min-w-0">
            <span className="font-semibold text-stone-900">오늘출발 여유분</span>
            <span className="ml-2 text-xs text-stone-500">
              {!hasSales
                ? "옵션별 판매 자료가 아직 없어요"
                : want.length
                  ? `잘 팔리는 옵션 ${want.length}개 · ${added.length ? `넣음 ${added.reduce((n, x) => n + x.extra, 0)}장` : `추천 +${want.reduce((n, x) => n + x.add, 0)}장`}`
                  : "더 살 옵션 없음"}
            </span>
          </span>
          <ChevronDown size={16} className={"shrink-0 text-stone-400 transition-transform " + (open ? "rotate-180" : "")} />
        </button>
        {todo.length > 0 && (
          <button type="button" onClick={() => onAddAll(todo)} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
            <Plus size={14} /> 추천 {todo.length}줄 전부 넣기 (+{todoPieces}장)
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-stone-100 px-4 pt-3 pb-4">
          <p className="text-sm text-stone-600">
            발주 파일은 밀린 주문뿐이라 그대로 사면 들어오는 대로 주문에 묶여요. 잘 팔리는 옵션은 며칠 치를 더 사 두면 <b className="text-stone-900">오늘출발</b>로 남아요.
          </p>
          <div className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <div className="font-medium text-stone-800">
              목표 재고 = 하루 평균 판매 × (입고까지 {c.lead}일 + 여유 {c.safety}일) <span className="font-normal text-stone-500">· 소수점 버림, 최소 1장</span>
            </div>
            <div className="mt-0.5">더 살 것 = 목표 재고 − 지금 재고(넥스트팩 가용 + 사무실 렉) · 밀린 주문 수량은 그대로 두고 더해요</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <Num label="평균 낼 기간" value={c.days} min={3} max={30} unit="일" onChange={(n) => setConf({ ...c, days: n })} />
              <Num label="입고까지" value={c.lead} min={0} max={10} unit="일" onChange={(n) => setConf({ ...c, lead: n })} />
              <Num label="여유" value={c.safety} min={0} max={10} unit="일" onChange={(n) => setConf({ ...c, safety: n })} />
              <Num label="기간 동안" value={c.min} min={1} max={50} unit="장 이상 팔린 옵션만" onChange={(n) => setConf({ ...c, min: n })} />
            </div>
            <div className="mt-1.5 text-[11px] text-stone-400">거래처가 미송이면 입고가 2~3일 걸려요 — 그런 상품은 '입고까지'를 늘려요. 이 기기에 기억해요.</div>
          </div>
          <div className="mt-2 text-[11px] text-stone-500">
            판매 {salesAt ? `${mmddhm(salesAt)}까지` : "—"} · 재고 {stockAt ? `${mmddhm(stockAt)} 넥스트팩 파일` : "넥스트팩 파일 없음"} + 사무실 렉
            {stockAge != null && stockAge > 1.2 && <span className="ml-1 text-amber-700">· 재고가 {Math.floor(stockAge)}일 전 것이에요 — 그 뒤 들어온 재고는 안 셌어요</span>}
          </div>

          {!hasSales ? (
            <div className="mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">
              사무실 PC 가 새벽마다 옵션별 판매를 올려요. 바로 올리려면 사무실 PC 에서 <code className="rounded bg-stone-100 px-1">python product_stats.py --opt</code>
            </div>
          ) : want.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">
              최근 {c.days}일 {c.min}장 이상 팔리면서 재고가 모자란 옵션이 없어요.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-stone-200 text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">상품 · 옵션</th>
                    <th className="px-2 py-1.5 text-right font-medium">최근 {c.days}일</th>
                    <th className="px-2 py-1.5 text-right font-medium">하루 평균</th>
                    <th className="px-2 py-1.5 text-right font-medium">목표</th>
                    <th className="px-2 py-1.5 text-right font-medium">지금 재고</th>
                    <th className="px-2 py-1.5 text-right font-medium">더 살 것</th>
                    <th className="py-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {want.map((x) => (
                    <tr key={x.id} className="align-top" title={formulaText(x, c)}>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-stone-900">
                          {x.name} <span className="text-stone-500">· {x.option || "옵션 없음"}</span>
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {x.kind === "file" ? `발주 파일 · 밀린 주문 ${x.order}장` : "발주 파일에 없음 · 재고가 다 나간 옵션"}
                          {" · "}
                          {formulaText(x, c)}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-stone-600 tabular-nums">{x.sold}장</td>
                      <td className="px-2 py-2 text-right text-stone-600 tabular-nums">{(Math.round(x.avg * 10) / 10).toFixed(1)}장</td>
                      <td className="px-2 py-2 text-right text-stone-600 tabular-nums">{x.target}장</td>
                      <td className="px-2 py-2 text-right text-stone-600 tabular-nums" title={`넥스트팩 가용 ${x.np} · 사무실 렉 ${x.rack}`}>
                        {x.have}장
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-700 tabular-nums">+{x.add}</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        {x.extra > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <Check size={13} /> 넣음 +{x.extra}
                            {x.extra !== x.add && x.add > 0 && (
                              <button type="button" onClick={() => onAdd(x)} className="ml-1 font-normal text-stone-500 underline decoration-dotted">
                                +{x.add}로
                              </button>
                            )}
                            <button type="button" onClick={() => onRemove(x)} aria-label="여유분 빼기" title="여유분 빼기" className="ml-0.5 rounded p-0.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700">
                              <X size={13} />
                            </button>
                          </span>
                        ) : x.canAdd ? (
                          <button type="button" onClick={() => onAdd(x)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                            <Plus size={12} /> {x.kind === "file" ? `+${x.add} 넣기` : "발주에 넣기"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-amber-700" title="넥스트팩 재고 줄·판매가 목록에 거래처가 없어요">
                            매장 정보 없음
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {slow.length > 0 && (
            <p className="mt-2 text-[11px] text-stone-400">
              주문 들어올 때만 사는 옵션 {slow.length}개(최근 {c.days}일 {c.min}장 미만): {slow.map((x) => `${x.name} ${x.option} ${x.sold}장`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
