import { useMemo, useState } from "react";
import { Info, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { rangeLabel, dayLabel } from "../lib/calc";
import { won, pct, totalPnl, pnlDays, TARGET_AD_RATE } from "../lib/sales";
import { useDays } from "../lib/view";
import { CH_NAME, FEE_CHANNELS, mixFee, NP_RATES, VAT } from "../lib/costs";
import { Kpi, Empty } from "./ui";
import DateRange from "./DateRange";

const HEAD = [
  "일자",
  "총매출",
  "환불",
  "순매출",
  "매출원가",
  "물류·수수료",
  "광고비",
  "삼촌·고정비",
  "영업이익",
];

const MODE = {
  actual: { label: "정산서", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  est: { label: "추정 · 넥스트팩 단가", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  office: { label: "추정 · 사무실 택배", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
};
const LOGI_NAME = {
  cj: "사무실 택배 (CJ)",
  officeMat: "사무실 부자재",
  ship: "택배비",
  material: "부자재",
  work: "작업비",
  storage: "보관료",
  wms: "WMS",
  ret: "반품",
  buy: "사입",
  etc: "기타",
};
const LOGI_ORDER = Object.keys(LOGI_NAME);
const ym2label = (ym) => `${Number(ym.slice(5, 7))}월`;

function ModeTag({ mode }) {
  const m = MODE[mode];
  if (!m) return null;
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 " + m.tone}>{m.label}</span>;
}

/** 위에서 아래로 한 번 흘려 보여준다 — 어디서 돈이 빠지는지가 보이게 */
function Waterfall({ t, months }) {
  const modes = [...new Set(months.map((m) => m.mode))];
  const lines = [
    ["총매출", t.revenue, "plus", "카페24 결제합계"],
    ["환불", -t.refund, "minus", `${pct(t.refundRate)}%`],
    ["순매출", t.net, "sum", "여기서부터 비용을 뺀다"],
    ["매출원가", -t.cogs, "minus", `상품매출 대비 ${pct(t.cogsRate)}%`],
    ["결제 수수료", -t.fee, "minus", `순매출의 ${pct(t.net ? (t.fee / t.net) * 100 : 0, 2)}% · 결제수단별 요율`],
    [
      "물류비",
      -t.logistics,
      "minus",
      `${won(t.orders)}건 · 건당 ${won(t.orders ? t.logistics / t.orders : 0)} · ${modes.map((m) => MODE[m]?.label).filter(Boolean).join(" / ")}`,
    ],
    ["광고비", -t.ads, "minus", `총매출의 ${pct(t.adRate)}%${t.metaDays ? ` · ${t.metaDays}일은 메타 기록` : ""}`],
    [
      "삼촌비",
      -t.samchonDay,
      "minus",
      t.samchonMonthly > 0 && t.samchonDaily > 0
        ? `달마다 넣은 값 ${won(t.samchonMonthly)} + 예전 날짜별 ${won(t.samchonDaily)}`
        : t.samchonMonthly > 0
          ? "달마다 넣은 값"
          : t.samchonDaily > 0
            ? "예전에 날짜별로 적은 것"
            : "아직 안 넣었어요 — 매출 장부 › 삼촌비 넣기",
    ],
    ["고정비", -t.fixedDay, "minus", "구독 · 고정 지출 목록"],
  ];

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-3 text-sm font-semibold text-stone-700">돈이 어디서 빠지나</div>
      <div className="space-y-0">
        {lines.map(([label, value, kind, note]) => (
          <div
            key={label}
            className={
              "flex items-baseline justify-between gap-3 py-2 " +
              (kind === "sum" ? "border-y border-stone-200 bg-stone-50/60 font-semibold" : "border-b border-stone-100")
            }
          >
            <span className={kind === "sum" ? "text-sm text-stone-900" : "text-sm text-stone-600"}>
              {label}
              {note && <span className="ml-1.5 text-xs font-normal text-stone-400">{note}</span>}
            </span>
            <span className={"shrink-0 font-semibold tabular-nums " + (kind === "minus" ? "text-stone-400" : "text-stone-900")}>
              {kind === "sum" ? "" : value < 0 ? "−" : "+"}
              {won(Math.abs(value))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-stone-900">영업이익</span>
        <span className={"text-2xl font-bold tabular-nums " + (t.profit >= 0 ? "text-emerald-700" : "text-rose-700")}>
          {t.profit >= 0 ? "+" : "−"}
          {won(Math.abs(t.profit))}
        </span>
      </div>
    </div>
  );
}

/** 결제수단별 금액 · 요율 · 수수료 (11/18 — 결제수단 5개 실제 요율) */
function FeeCard({ days, ctx }) {
  const rows = useMemo(() => {
    const by = {};
    let blendDays = 0;
    let blendNet = 0;
    let blendFee = 0;
    for (const d of days) {
      if (d.feeFrom === "mix") {
        for (const [ch, a] of Object.entries(ctx?.mix?.[d.date] || {})) {
          const r = (by[ch] ||= { amt: 0, fee: 0 });
          const one = mixFee({ [ch]: a }, ctx.rates);
          r.amt += one.base;
          r.fee += one.fee;
        }
      } else if (d.revenue > 0 || d.refund > 0) {
        blendDays++;
        blendNet += d.net;
        blendFee += d.fee;
      }
    }
    const order = [...FEE_CHANNELS.map((c) => c.k), "cash", "etc"];
    const list = order.filter((k) => by[k]?.amt > 0).map((k) => ({ k, ...by[k] }));
    return { list, blendDays, blendNet, blendFee };
  }, [days, ctx]);
  const color = Object.fromEntries(FEE_CHANNELS.map((c) => [c.k, c.color]));
  const amt = rows.list.reduce((a, r) => a + r.amt, 0);
  const fee = rows.list.reduce((a, r) => a + r.fee, 0);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-sm font-semibold text-stone-700">결제 수수료</div>
      <p className="mt-0.5 mb-3 text-xs leading-relaxed text-stone-400">
        그날 결제수단마다 결제액(그 결제에서 환불된 것 뺌, 배송비 포함) × 요율. 요율은 돈 › 정산 달력에서 확인한 값이에요.
      </p>
      {rows.list.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400">
                <th className="py-1.5 text-left font-medium">결제수단</th>
                <th className="py-1.5 text-right font-medium">결제액</th>
                <th className="py-1.5 text-right font-medium">비중</th>
                <th className="py-1.5 text-right font-medium">요율</th>
                <th className="py-1.5 text-right font-medium">수수료</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {rows.list.map((r) => (
                <tr key={r.k}>
                  <td className="py-1.5 text-left text-stone-700">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color[r.k] || "#a8a29e" }} />
                    {CH_NAME[r.k] || r.k}
                  </td>
                  <td className="py-1.5 text-right text-stone-600">{won(r.amt)}</td>
                  <td className="py-1.5 text-right text-stone-400">{pct(amt ? (r.amt / amt) * 100 : 0)}%</td>
                  <td className="py-1.5 text-right text-stone-500">{pct(ctx?.rates?.[r.k] ?? 0, 2)}%</td>
                  <td className="py-1.5 text-right font-medium text-stone-800">{won(r.fee)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-300 font-semibold tabular-nums">
                <td className="py-1.5 text-left text-stone-900">합계</td>
                <td className="py-1.5 text-right text-stone-900">{won(amt)}</td>
                <td />
                <td className="py-1.5 text-right text-stone-500">{pct(amt ? (fee / amt) * 100 : 0, 2)}%</td>
                <td className="py-1.5 text-right text-stone-900">{won(fee)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-xs text-stone-400">이 기간엔 결제수단 자료가 없어요.</p>
      )}
      {rows.blendDays > 0 && (
        <p className="mt-2.5 text-xs leading-relaxed text-stone-500">
          결제수단 자료가 없는 {rows.blendDays}일(9/20 전 등)은 그동안 쌓인 결제수단 비중으로 낸 평균 요율{" "}
          <b className="font-semibold tabular-nums">{pct(ctx?.blend ?? 0, 2)}%</b> × 순매출 {won(rows.blendNet)} ={" "}
          <b className="font-semibold tabular-nums">{won(rows.blendFee)}</b>
        </p>
      )}
    </div>
  );
}

/** 달마다 물류비 — 정산서(실제) / 추정 표시, 항목별 */
function LogisticsCard({ months }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-sm font-semibold text-stone-700">물류비</div>
      <p className="mt-0.5 mb-3 text-xs leading-relaxed text-stone-400">
        넥스트팩 계약 단가(부가세 별도 → × 1.1)로 추정하고, 정산서가 오면 그 달은 실제 금액으로 바뀌어요. 정산서 금액은 매출 장부 › 데이터 넣기 › 달마다 값에 넣어요.
      </p>
      <div className="divide-y divide-stone-100">
        {months.map((m) => {
          const on = open === m.ym;
          const lines = LOGI_ORDER.filter((k) => m.lines[k] > 0.5);
          return (
            <div key={m.ym}>
              <button type="button" onClick={() => setOpen(on ? null : m.ym)} className="flex w-full items-center gap-2 py-2 text-left text-sm">
                {on ? <ChevronDown size={14} className="text-stone-400" /> : <ChevronRight size={14} className="text-stone-400" />}
                <span className="w-10 font-medium text-stone-800">{ym2label(m.ym)}</span>
                <ModeTag mode={m.mode} />
                <span className="ml-auto text-xs text-stone-400 tabular-nums">
                  {won(m.orders)}건 · 건당 {won(m.orders ? m.total / m.orders : 0)}
                </span>
                <span className="w-24 text-right font-semibold text-stone-800 tabular-nums">{won(m.total)}</span>
              </button>
              {on && (
                <div className="mb-2 ml-6 rounded-lg bg-stone-50 px-3 py-2 text-xs">
                  <ul className="space-y-0.5 tabular-nums">
                    {lines.map((k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="text-stone-600">{LOGI_NAME[k]}</span>
                        <span className="text-stone-700">{won(m.lines[k])}</span>
                      </li>
                    ))}
                  </ul>
                  {m.mode === "est" && m.est && (
                    <p className="mt-2 leading-relaxed text-stone-500">
                      건당 택배 {won(NP_RATES.ship)} · 출고 {NP_RATES.out} · 봉투 {NP_RATES.bag} / 나간 장당 폴리 {NP_RATES.poly} · 3장째부터 합포 {NP_RATES.combine} /
                      들어온 {won(m.est.inbound)}장({m.est.inboundFrom}) × 입고·바코드 {won(NP_RATES.inbound + NP_RATES.barcode)} / 사입 {m.est.buyPlaces}곳 ×{" "}
                      {NP_RATES.buy} / 보관 {won(m.est.stock)}장 × {NP_RATES.storage} / WMS {won(NP_RATES.wms)} / 반품 어림 {m.est.returns}건 × {won(NP_RATES.ret)} — 모두 × {VAT}
                      (부가세). 이 기간 날수만큼만 들어가요.
                    </p>
                  )}
                  {m.note && <p className="mt-2 leading-relaxed text-amber-800">{m.note}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 고정비 = 구독 · 고정 지출 목록 (누르면 그 화면) */
function FixedCard({ months, ctx, monthly, onPage }) {
  const last = months.at(-1);
  const s = last && ctx?.subs ? ctx.subs(last.ym) : null;
  const manual = last && monthly?.[last.ym]?.fixed;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-stone-700">고정비</div>
        <button type="button" onClick={() => onPage("subs")} className="text-xs text-stone-400 underline decoration-dotted hover:text-rose-700">
          구독 · 고정 지출 열기 ›
        </button>
      </div>
      <p className="mt-0.5 mb-3 text-xs leading-relaxed text-stone-400">
        돈 › 구독 · 고정 지출 목록의 그 달 합계 — 연간은 12로 나누고, 시작한 달부터, 해지는 해지한 날의 전 달까지. 그 달 날수로 나눠 날마다 얹어요.
      </p>
      <ul className="mb-3 space-y-1 text-sm tabular-nums">
        {months.map((m) => (
          <li key={m.ym} className="flex justify-between gap-3">
            <span className="text-stone-600">
              {ym2label(m.ym)} 한 달{m.manual ? <span className="ml-1 text-xs text-amber-700">손으로 덮음</span> : ""}
            </span>
            <span className="text-stone-800">
              {won(m.fixedMonth)}
              <span className="ml-1.5 text-xs text-stone-400">이 기간 {won(m.fixed)}</span>
            </span>
          </li>
        ))}
      </ul>
      {s && !manual && (
        <button type="button" onClick={() => onPage("subs")} className="w-full rounded-lg bg-stone-50 px-3 py-2 text-left text-xs transition hover:bg-stone-100">
          <div className="mb-1 text-stone-500">{ym2label(last.ym)} 분류별</div>
          <ul className="space-y-0.5 tabular-nums">
            {s.kinds.map((g) => (
              <li key={g.k} className="flex justify-between gap-3">
                <span className="text-stone-700">
                  {g.k} <span className="text-stone-400">· {g.items.map((i) => i.name).join(", ")}</span>
                </span>
                <span className="shrink-0 text-stone-800">{won(g.v)}</span>
              </li>
            ))}
          </ul>
        </button>
      )}
      {s?.noEnd?.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-amber-800">
          해지했는데 해지한 날이 비어 있어 손익에 안 넣었어요: {s.noEnd.join(", ")} — 구독 화면에서 해지한 날을 적으면 그 전 달까지 들어가요.
        </p>
      )}
      {!ctx?.subs && <p className="text-xs text-stone-400">구독 목록을 못 읽어서 예전 가정값(월 120만 원)으로 냈어요.</p>}
    </div>
  );
}

/**
 * 공급가 없이 팔린 상품 점검.
 *
 * 단가표 화면을 없애면서 꼭 남겨야 했던 기능 하나다. 공급가가 비어 있는 상품이 팔리면
 * 그날 원가가 0원으로 잡혀 **이익이 실제보다 좋아 보인다.** 새벽 자동 갱신이 주문을
 * 훑어서 settings 의 missing_cost 에 적어 두고, 여기서 보고 있는 기간만 골라 보여준다.
 */
function MissingCost({ data, range }) {
  if (!data?.days) return null;
  const inside = Object.entries(data.days).filter(([d]) => (!range.from || d >= range.from) && (!range.to || d <= range.to));
  const byProduct = new Map();
  for (const [d, list] of inside) {
    for (const r of list) {
      const p = byProduct.get(r.no) || { ...r, qty: 0, dates: [] };
      p.qty += r.qty;
      p.dates.push(d);
      byProduct.set(r.no, p);
    }
  }
  const items = [...byProduct.values()].sort((a, b) => b.qty - a.qty);

  if (items.length === 0) {
    return (
      <p className="mb-4 flex items-center gap-1.5 text-xs text-emerald-700">
        <CheckCircle2 size={13} /> 이 기간에 공급가가 빠진 채 팔린 상품은 없어요. 원가가 다 잡혔습니다.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-900">
      <div className="flex items-start gap-1.5">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <span>
          <b className="font-semibold">공급가가 비어 있는 상품이 {items.reduce((n, p) => n + p.qty, 0)}개 팔렸어요.</b> 이만큼 원가가 0원으로 잡혀서 이익이
          실제보다 크게 보입니다. 카페24 상품 관리에서 공급가를 넣어주세요.
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-5">
        {items.map((p) => (
          <li key={p.no} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              상품번호 {p.no} · {p.name}
            </span>
            <span className="shrink-0 tabular-nums">{p.qty}개</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 기간 안의 날들 → 달마다 물류비·고정비 묶음 */
function monthsOf(days, monthly) {
  const by = new Map();
  for (const d of days) {
    const ym = d.date.slice(0, 7);
    if (!by.has(ym)) by.set(ym, { ym, mode: d.logiMode, est: d.logiEst, lines: {}, total: 0, orders: 0, fixed: 0, fixedMonth: 0, manual: false });
    const m = by.get(ym);
    for (const [k, v] of Object.entries(d.logi || {})) m.lines[k] = (m.lines[k] || 0) + v;
    m.total += d.logistics;
    m.orders += d.orders || 0;
    m.fixed += d.fixedDay;
    const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    m.fixedMonth = d.fixedDay * dim;
  }
  for (const m of by.values()) {
    const M = monthly?.[m.ym] || {};
    m.manual = !!M.fixed;
    if (m.mode === "actual" && !(M.shipTotal > 0) && m.ym < "2026-11")
      m.note = "사무실 택배(CJ) 청구액이 아직 없어요 — 이 달에 사무실에서 보낸 택배비가 빠져 있어요. 통장에 들어오면 달마다 값에 넣어 주세요.";
    if (m.mode === "est" && m.ym === "2026-11")
      m.note = "11/1~11/10 은 사무실 택배(CJ)와 넥스트팩이 섞여 있어요. 넥스트팩 단가로 어림했고, 12월 정산서와 CJ 청구로 맞춰요.";
  }
  return [...by.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

export default function PnlPage({ rows, conf, range, preset, custom, onRange, onPage, missingCost }) {
  const days = useDays(rows, range, conf);
  // 손익에 넣는 날 = 원가를 아는 날 + 결제가 한 건도 없던 날(그날도 광고비·고정비는 나간다). 원가를 모르는데 매출만 있는 날은 뺀다.
  const withOrders = useMemo(() => pnlDays(days), [days]);
  const total = useMemo(() => totalPnl(withOrders), [withOrders]);
  const months = useMemo(() => monthsOf(withOrders, conf.monthly), [withOrders, conf.monthly]);
  const skipped = days.filter((d) => d.revenue > 0 && !d.inPnl).length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-stone-900">손익</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          총매출에서 환불을 뺀 <b className="font-semibold text-stone-700">순매출</b>로 실제 남은 돈을 봐요.
        </p>
      </div>

      <div className="mb-4">
        <DateRange preset={preset} custom={custom} onChange={onRange} />
        <p className="mt-1.5 text-xs text-stone-400">
          {rangeLabel(range)} · 손익에 넣은 날 {total.days}일 (주문 0건인 날 {withOrders.filter((d) => !d.hasOrders).length}일 포함)
        </p>
      </div>

      {withOrders.length === 0 ? (
        <Empty title="이 기간엔 원가를 아는 날이 없어요." hint="매출 장부 › 데이터 넣기에서 orders_일별.csv 를 넣으면 여기 손익이 나옵니다.">
          <button type="button" onClick={() => onPage("sales")} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white">
            매출 장부로 가기
          </button>
        </Empty>
      ) : (
        <>
          {skipped > 0 && (
            <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                이 기간 {skipped}일은 매출은 있는데 <b className="font-semibold">원가를 몰라서</b> 손익에서 뺐어요. 주문 데이터는 2026-08-01부터 있습니다.
              </span>
            </p>
          )}

          <MissingCost data={missingCost} range={range} />

          <section className="mb-5 space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Kpi label="총매출" value={won(total.revenue)} sub={`${total.days}일`} />
              <Kpi label="순매출" value={won(total.net)} sub={`환불 −${won(total.refund)} (${pct(total.refundRate)}%)`} />
              <Kpi
                label="영업이익"
                value={(total.profit >= 0 ? "+" : "−") + won(Math.abs(total.profit))}
                tone={total.profit >= 0 ? "emerald" : "rose"}
                sub={`순매출의 ${pct(total.margin)}%`}
              />
              <Kpi label="손익분기 일매출" value={won(total.breakeven)} sub={`공헌이익률 ${pct(total.contribRate)}%`} />
            </div>

            <Waterfall t={total} months={months} />

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <FeeCard days={withOrders} ctx={conf.ctx} />
              </div>
              <LogisticsCard months={months} />
              <FixedCard months={months} ctx={conf.ctx} monthly={conf.monthly} onPage={onPage} />
            </div>

            {total.adRate > TARGET_AD_RATE && total.ads > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="text-sm font-semibold text-stone-700">광고비율을 목표 {TARGET_AD_RATE}%까지 내리면</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                  {total.targetProfit >= 0 ? "+" : "−"}
                  {won(Math.abs(total.targetProfit))}
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  지금 {won(total.ads)} → {won(total.targetAds)}. 매출이 그대로라는 가정이에요.
                </p>
              </div>
            )}
          </section>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-400">
                  {HEAD.map((h, i) => (
                    <th key={h} className={"px-3 py-2.5 font-medium " + (i === 0 ? "text-left" : "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {withOrders.map((d) => (
                  <tr key={d.date} className={"hover:bg-stone-50 " + (d.hasOrders ? "" : "text-stone-400")}>
                    <td className="px-3 py-2 text-left whitespace-nowrap text-stone-600">
                      {dayLabel(d.date)}
                      {!d.hasOrders && <span className="ml-1 text-[11px] text-stone-400">주문 없음</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">{won(d.revenue)}</td>
                    <td className="px-3 py-2 text-right text-stone-400">{d.refund ? "−" + won(d.refund) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-stone-900">{won(d.net)}</td>
                    <td className="px-3 py-2 text-right text-stone-500">
                      {won(d.cogs)}
                      <span className="ml-1 text-[11px] text-stone-300">{pct(d.cogsRate, 0)}%</span>
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">{won(d.variable)}</td>
                    <td className="px-3 py-2 text-right text-stone-500">
                      {d.ads ? won(d.ads) : "—"}
                      {d.adsMeta > 0 && <span className="ml-1 text-[10px] text-sky-600" title="장부 광고비가 0이라 메타 하루 기록으로 채움">메타</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-400">{won(d.samchonDay + d.fixedDay)}</td>
                    <td className={"px-3 py-2 text-right font-semibold " + (d.profit >= 0 ? "text-emerald-700" : "text-rose-700")}>
                      {d.profit >= 0 ? "+" : "−"}
                      {won(Math.abs(d.profit))}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* 맨 아래 합계 — 표를 눈으로 더하지 않아도 되게. 위 KPI와 같은 값이다. */}
              <tfoot>
                <tr className="border-t-2 border-stone-300 bg-stone-50 font-semibold">
                  <td className="px-3 py-2.5 text-left whitespace-nowrap text-stone-900">
                    합계 <span className="text-xs font-normal text-stone-400">{total.days}일</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-900">{won(total.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-500">{total.refund ? "−" + won(total.refund) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-stone-900">{won(total.net)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">
                    {won(total.cogs)}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">{pct(total.cogsRate, 0)}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{won(total.variable)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">
                    {won(total.ads)}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">{pct(total.adRate, 0)}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{won(total.samchonDay + total.fixedDay)}</td>
                  <td className={"px-3 py-2.5 text-right " + (total.profit >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {total.profit >= 0 ? "+" : "−"}
                    {won(Math.abs(total.profit))}
                    <span className="ml-1 text-[11px] font-normal text-stone-400">{pct(total.margin, 0)}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
            <p className="flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                <b className="font-semibold">매출원가는 어떻게 나오나</b> — 단가표에서 가져오는 게 아니라, <b className="font-semibold">주문 하나하나에 붙어 온 공급가</b>를
                수량만큼 더한 값이에요. 코디 세트는 카페24가 공급가를 0으로 주기 때문에 구성품 공급가를 합쳐서 채웁니다. 원가율은 배송비를 뺀{" "}
                <b className="font-semibold">상품매출</b>에 대고 잽니다.
              </span>
            </p>
            <p className="mt-2 flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                삼촌비 · 사무실 택배 청구액 · 넥스트팩 정산서는 매출 장부 › 데이터 넣기 › <b className="font-semibold">달마다 값</b>에 넣어요. 고정비는 구독 · 고정 지출 목록에서
                와요. 장부 광고비가 0인 날은 메타 하루 기록으로 채워요(표에 '메타').
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
