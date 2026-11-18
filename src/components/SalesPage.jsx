import { useMemo, useState } from "react";
import { Megaphone, Target, Upload, Settings2, Trash2, Info, Plus, Truck } from "lucide-react";
import { rangeLabel, dayLabel, todayISO } from "../lib/calc";
import {
  won,
  pct,
  totalPnl,
  parseDaily,
  parseCafe,
  parseAds,
  DEFAULT_COSTS,
  MONTH_FIELDS,
  TARGET_AD_RATE,
} from "../lib/sales";
import { FEE_CHANNELS, NP_ITEMS, NP_RATES, NP_START, npTotal } from "../lib/costs";
import { adTone, TONE_TEXT, useDays } from "../lib/view";
import { fileToCsv, fileFromDrop } from "../lib/tabular";
import { Kpi, Empty } from "./ui";
import DateRange from "./DateRange";
import EditNum from "./EditNum";

/** 목표 18%까지 얼마나 왔는지 */
function AdGauge({ total }) {
  const tone = adTone(total.adRate);
  const width = Math.min((total.adRate / 45) * 100, 100);
  const mark = (TARGET_AD_RATE / 45) * 100;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
          <Megaphone size={15} /> 광고비율
          <span className="font-normal text-stone-400">총매출 대비</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <Target size={13} /> 목표 {TARGET_AD_RATE}%
        </div>
      </div>

      <div className={"mt-1 text-3xl font-bold tabular-nums " + TONE_TEXT[tone]}>
        {pct(total.adRate)}%
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className={
            "h-full rounded-full " +
            (tone === "emerald"
              ? "bg-emerald-500"
              : tone === "amber"
                ? "bg-amber-500"
                : "bg-rose-600")
          }
          style={{ width: `${width}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-stone-900/50" style={{ left: `${mark}%` }} />
      </div>

      <p className="mt-2.5 text-sm text-stone-500">
        광고비 <span className="font-semibold tabular-nums text-stone-700">{won(total.ads)}</span>
        {" · "}ROAS{" "}
        <span className="font-semibold tabular-nums text-stone-700">{pct(total.roas, 2)}</span>
        {total.adRate > TARGET_AD_RATE && total.ads > 0 && (
          <>
            <br />
            목표까지{" "}
            <span className="font-semibold tabular-nums">{won(total.ads - total.targetAds)}</span>{" "}
            줄여야 해요.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * CSV 넣기 한 벌 — 끌어다 놓기 · 파일 고르기 · 붙여넣기 셋 다 받는다.
 *
 * 파일을 읽는 건 `fileToCsv`가 한다. 카페24 CSV는 EUC-KR이고 엑셀 파일은 아예
 * 텍스트가 아니어서, 그냥 읽으면 머리글이 깨져 "못 읽었어요"만 뜬다.
 */
function Importer({ label, hint, onText }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (csv, from) => {
    if (!String(csv || "").trim()) {
      setMsg(
        from
          ? `${from} 에서 읽을 내용이 없어요. 엑셀이면 '다른 이름으로 저장 → CSV'로 바꿔 보세요.`
          : "내용이 비어 있어요.",
      );
      return;
    }
    setBusy(true);
    const result = await onText(csv);
    setBusy(false);
    setMsg(from ? `${from} · ${result}` : result);
  };

  const takeFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg(`${file.name} 읽는 중…`);
    const csv = await fileToCsv(file);
    setBusy(false);
    await apply(csv, file.name);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        takeFile(fileFromDrop(e.dataTransfer));
      }}
      className={
        "rounded-xl border p-4 transition " +
        (over ? "border-rose-500 bg-rose-50" : "border-stone-200 bg-white")
      }
    >
      <div className="text-sm font-semibold text-stone-800">{label}</div>
      <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-stone-400">{hint}</p>

      <label
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition " +
          (over ? "border-rose-500 bg-white" : "border-stone-300 bg-stone-50 hover:bg-stone-100")
        }
      >
        <Upload size={18} className={over ? "text-rose-600" : "text-stone-400"} />
        <span className="text-sm font-medium text-stone-600">
          {over ? "여기에 놓으세요" : "파일을 끌어다 놓거나 눌러서 고르기"}
        </span>
        <span className="text-[11px] text-stone-400">csv · xlsx · xls · 한글 깨짐 걱정 없어요</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            await takeFile(f);
          }}
        />
      </label>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-stone-400">아니면 붙여넣기</summary>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="CSV를 통째로 붙여넣으세요"
          className="mt-2 h-20 w-full resize-y rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => {
            apply(text);
            setText("");
          }}
          className="mt-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white"
        >
          적용
        </button>
      </details>

      {(msg || busy) && (
        <p className="mt-2 text-xs text-stone-500">{busy ? "읽는 중…" : msg}</p>
      )}
    </div>
  );
}

/** 광고비 한 건을 날짜 골라서 직접 넣는다 */
function AdEntry({ onAdd }) {
  const [date, setDate] = useState(todayISO);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const add = async () => {
    const n = Math.round(Number(String(amount).replace(/[^\d.-]/g, "")) || 0);
    if (!date || !n) {
      setMsg("날짜와 금액을 넣어주세요.");
      return;
    }
    await onAdd({ [date]: n });
    setMsg(`${date} 광고비 ${won(n)}원 넣었어요.`);
    setAmount("");
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-sm font-semibold text-stone-800">광고비 직접 넣기</div>
      <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-stone-400">
        CSV 없이 하루치만 넣을 때. 이미 있는 날이면 이 값으로 덮어써요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={amount}
          inputMode="numeric"
          placeholder="금액"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-right text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={14} /> 넣기
        </button>
        {msg && <span className="text-xs text-stone-500">{msg}</span>}
      </div>
    </div>
  );
}

/**
 * 삼촌비 — 달마다 한 줄 (11/18 세원: "삼촌비 넣기는 내가 달마다 계산해서 넣을꺼고").
 * conf.monthly[ym].samchon. 그 달에 월 금액이 있으면 그 달 예전 날짜별 값은 손익에 안 더한다(두 번 세지 않게).
 * 9월에 날짜별로 적은 것(samchonDaily)은 지우지 않고 아래에 그대로 보여 준다.
 */
function SamchonEntry({ monthly, daily, onMonth, onPut }) {
  const [ym, setYm] = useState(() => todayISO().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [showOld, setShowOld] = useState(false);

  const add = async () => {
    const n = Math.round(Number(String(amount).replace(/[^\d.-]/g, "")) || 0);
    if (!ym || !n) {
      setMsg("달과 금액을 넣어주세요.");
      return;
    }
    await onMonth(ym, "samchon", n);
    setMsg(`${Number(ym.slice(5, 7))}월 삼촌비 ${won(n)}원 넣었어요.`);
    setAmount("");
  };

  const months = Object.entries(monthly || {})
    .filter(([, M]) => M?.samchon > 0)
    .sort((a, b) => b[0].localeCompare(a[0]));
  const old = Object.entries(daily || {})
    .filter(([, v]) => v)
    .sort((a, b) => b[0].localeCompare(a[0]));
  const oldByMonth = {};
  for (const [d, v] of old) oldByMonth[d.slice(0, 7)] = (oldByMonth[d.slice(0, 7)] || 0) + v;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-sm font-semibold text-stone-800">삼촌비 — 달마다</div>
      <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-stone-400">
        그 달 삼촌에게 준 돈을 한 번에 넣어요. 같은 달을 다시 넣으면 그 값으로 바뀌어요. 손익에선 그 달 날수로 나눠 날마다 빠집니다.
      </p>
      <p className="mb-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
        넥스트팩 사입비(곳당 400원)는 물류비에 이미 들어가요 — 삼촌비엔 우리 삼촌에게 준 돈만.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
        <input
          value={amount}
          inputMode="numeric"
          placeholder="금액"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-right text-sm tabular-nums"
        />
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white">
          <Plus size={14} /> 넣기
        </button>
        {msg && <span className="text-xs text-stone-500">{msg}</span>}
      </div>

      {months.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <div className="mb-1.5 text-xs text-stone-500">넣은 달 · 숫자를 눌러 고치고, 0으로 하면 지워져요</div>
          <ul className="divide-y divide-stone-100 text-sm">
            {months.map(([m, M]) => (
              <li key={m} className="flex items-center justify-between gap-3 py-1">
                <span className="text-stone-600">
                  {m.slice(0, 4)}년 {Number(m.slice(5, 7))}월
                  {oldByMonth[m] > 0 && <span className="ml-1.5 text-[11px] text-stone-400">날짜별 {won(oldByMonth[m])}은 안 더함</span>}
                </span>
                <span className="w-32">
                  <EditNum value={M.samchon} onSave={(n) => onMonth(m, "samchon", n)} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {old.length > 0 && (
        <div className="mt-3 border-t border-stone-100 pt-2.5">
          <button type="button" onClick={() => setShowOld((v) => !v)} className="text-xs text-stone-400 underline decoration-dotted hover:text-stone-600">
            예전에 날짜별로 적은 삼촌비 {old.length}건 · {won(old.reduce((a, [, v]) => a + v, 0))}원 {showOld ? "접기" : "보기"}
          </button>
          {showOld && (
            <ul className="mt-1.5 divide-y divide-stone-100 text-sm">
              {old.map(([d, v]) => (
                <li key={d} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-stone-600">{dayLabel(d)}</span>
                  <span className="w-32">
                    <EditNum value={v} onSave={(n) => onPut(d, n)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const FIELDS = [
  ["shipCost", "사무실 택배 / 건", "9월까지 · 청구액이 없는 달만"],
  ["material", "사무실 부자재 / 개", "넥스트팩 정산서가 없는 사무실 택배 달만"],
];

const ymLabel = (ym) => `${ym.slice(2, 4)}년 ${Number(ym.slice(5, 7))}월`;

/** 달마다 값 — 삼촌비 · 고정비 덮기 · 사무실 택배 청구액 · 넥스트팩 정산서 (11/18) */
function MonthTable({ months, monthly, onMonth, ctx }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-xs text-stone-400">
            <th className="px-2 py-1.5 text-left font-medium">달</th>
            {MONTH_FIELDS.map(([, label, hint]) => (
              <th key={label} className="px-2 py-1.5 text-right font-medium">
                {label}
                {hint && <div className="text-[10px] font-normal">{hint}</div>}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">
              넥스트팩 정산서
              <div className="text-[10px] font-normal">부가세 포함 · 눌러서 항목별로</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {months.flatMap((ym) => {
            const M = monthly?.[ym] || {};
            const npSum = npTotal(M.np);
            const on = open === ym;
            const subs = ctx?.subs ? ctx.subs(ym).total : null;
            const row = (
              <tr key={ym} className="border-t border-stone-100">
                <td className="px-2 py-1 text-left whitespace-nowrap tabular-nums text-stone-600">{ymLabel(ym)}</td>
                {MONTH_FIELDS.map(([key]) => (
                  <td key={key} className="px-1 py-1">
                    <EditNum
                      value={M[key] || 0}
                      placeholder={key === "fixed" && subs != null ? `목록 ${won(subs)}` : "—"}
                      onSave={(n) => onMonth(ym, key, n)}
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => setOpen(on ? null : ym)}
                    className={"w-full rounded px-1.5 py-0.5 text-right tabular-nums hover:bg-stone-100 " + (npSum ? "text-stone-700" : "text-stone-300")}
                  >
                    {npSum ? won(npSum) : ym >= NP_START ? "추정 중 · 넣기" : "—"}
                  </button>
                </td>
              </tr>
            );
            if (!on) return [row];
            return [
              row,
              <tr key={`${ym}-np`}>
                <td colSpan={MONTH_FIELDS.length + 2} className="px-2 pb-2">
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-2.5 sm:grid-cols-4">
                    {NP_ITEMS.map(([k, label, hint]) => (
                      <label key={k} className="block text-xs">
                        <span className="text-stone-500">{label}</span>
                        {hint && <span className="ml-1 text-[10px] text-stone-400">{hint}</span>}
                        <div className="mt-0.5 rounded border border-stone-200 bg-white">
                          <EditNum value={M.np?.[k] || 0} onSave={(n) => onMonth(ym, `np.${k}`, n)} />
                        </div>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function CostFields({ conf, onConf, onMonth, months }) {
  const costs = { ...DEFAULT_COSTS, ...conf.costs };
  const ctx = conf.ctx;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <Settings2 size={15} /> 비용 기준
      </div>
      <p className="mb-3 text-xs leading-relaxed text-stone-400">
        고정비는 돈 › 구독 · 고정 지출 목록, 결제 수수료는 결제수단별 요율, 물류비는 넥스트팩 단가(정산서가 오면 그 금액)로 손익에서 저절로 계산돼요.
      </p>

      {months.length > 0 && (
        <>
          <div className="mb-1 text-sm font-semibold text-stone-800">달마다 값</div>
          <p className="mb-2 text-xs leading-relaxed text-stone-400">
            사무실 택배 청구액이나 넥스트팩 정산서를 넣으면 그 달 물류비는 추정 대신 그 금액을 건수 비율대로 나눠 담아요. 0으로 하면 지워지고 다시 추정해요.
          </p>
          <MonthTable months={[...months].reverse()} monthly={conf.monthly} onMonth={onMonth} ctx={ctx} />
        </>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
          <div className="mb-1 font-semibold text-stone-700">넥스트팩 단가 (부가세 별도 · 손익엔 × 1.1)</div>
          건당 택배 극소 {won(NP_RATES.ship)}(아우터 소 3,050 · 중 3,600) · 출고 {NP_RATES.out} · 택배봉투 {NP_RATES.bag}
          <br />
          장당 입고·검수·폴리백 {NP_RATES.inbound} · 바코드 {NP_RATES.barcode} · 포장폴리 {NP_RATES.poly} · 합포(3장째부터) {NP_RATES.combine}
          <br />월 WMS {won(NP_RATES.wms)} · 보관 장당 {NP_RATES.storage}(행거 300) · 사입 곳당 {NP_RATES.buy} · 반품 건당 {won(NP_RATES.ret)}
        </div>
        <div className="rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
          <div className="mb-1 font-semibold text-stone-700">결제 수수료 요율 (돈 › 정산 달력)</div>
          {FEE_CHANNELS.map((c) => (
            <span key={c.k} className="mr-2 inline-block">
              {c.name} {pct(ctx?.rates?.[c.k] ?? 0, 2)}%
            </span>
          ))}
          {ctx?.blend != null && <div className="mt-1 text-stone-500">결제수단 자료 없는 날 평균 {pct(ctx.blend, 2)}%</div>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map(([key, label, sub]) => (
          <label key={key} className="block">
            <span className="block text-xs text-stone-500">{label}</span>
            {sub && <span className="block text-[11px] text-stone-400">{sub}</span>}
            <input
              type="number"
              step="any"
              value={costs[key]}
              onChange={(e) => onConf({ ...conf, costs: { ...costs, [key]: Number(e.target.value) || 0 } })}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-right tabular-nums"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

const HEAD = ["일자", "총매출", "광고비", "광고비율", "ROAS", "환불"];

export default function SalesPage({
  rows,
  conf,
  onConf,
  onDaily,
  onCafe,
  onAds,
  onSamchon,
  onMonth,
  onEdit,
  onClear,
  range,
  preset,
  custom,
  onRange,
}) {
  // 두 패널을 따로 연다 — 광고비는 매일 넣는 것이라 데이터 넣기 안에 묻으면 안 보인다
  const [panel, setPanel] = useState(null); // null | "ads" | "data"
  const toggle = (key) => setPanel((p) => (p === key ? null : key));
  const days = useDays(rows, range, conf);
  const total = useMemo(() => totalPnl(days), [days]);

  // 달마다 값 표는 보고 있는 기간과 상관없이 원가를 아는 달(2026-08)부터 이번 달까지 — 정산서가 오면 기간을 안 바꾸고 넣게
  const costMonths = useMemo(() => {
    const now = todayISO().slice(0, 7);
    return [...new Set([...rows.map((r) => r.date.slice(0, 7)), now])].filter((m) => m >= "2026-08" && m <= now).sort();
  }, [rows]);

  const takeCafe = async (text) => {
    const parsed = parseCafe(text);
    if (!parsed.length) return "카페24 CSV를 못 읽었어요. '결제합계' 칸이 있어야 해요.";
    await onCafe(parsed);
    return `${parsed.length}일치 넣었어요.`;
  };

  const takeDaily = async (text) => {
    const parsed = parseDaily(text);
    if (!parsed.length) return "주문 CSV를 못 읽었어요. orders_일별.csv 를 붙여넣어 주세요.";
    await onDaily(parsed);
    return `${parsed.length}일치 넣었어요.`;
  };

  const takeAds = async (text) => {
    const parsed = parseAds(text);
    const n = Object.keys(parsed).length;
    if (!n) return "광고 CSV를 못 읽었어요. '일'과 '지출 금액' 칸이 있어야 해요.";
    await onAds(parsed);
    return `${n}일치 · 합계 ${won(Object.values(parsed).reduce((a, b) => a + b, 0))}원`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">포클로 매출 장부</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            광고비 대비 매출을 보는 곳이에요. 남은 돈은{" "}
            <b className="font-semibold text-stone-700">손익</b>에서 봐요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggle("ads")}
            className={
              "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition " +
              (panel === "ads"
                ? "bg-rose-700 text-white"
                : "border border-rose-300 bg-white text-rose-800 hover:bg-rose-50")
            }
          >
            <Megaphone size={14} /> 광고비 넣기
          </button>
          <button
            type="button"
            onClick={() => toggle("samchon")}
            className={
              "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition " +
              (panel === "samchon"
                ? "bg-amber-600 text-white"
                : "border border-amber-300 bg-white text-amber-800 hover:bg-amber-50")
            }
          >
            <Truck size={14} /> 삼촌비 넣기
          </button>
          <button
            type="button"
            onClick={() => toggle("data")}
            className={
              "rounded-lg px-3.5 py-2 text-sm font-medium transition " +
              (panel === "data"
                ? "bg-stone-800 text-white"
                : "border border-stone-300 bg-white text-stone-600 hover:bg-stone-50")
            }
          >
            데이터 넣기
          </button>
        </div>
      </div>

      <div className="mb-4">
        <DateRange preset={preset} custom={custom} onChange={onRange} />
        <p className="mt-1.5 text-xs text-stone-400">
          {rangeLabel(range)} · {total.days}일
        </p>
      </div>

      {panel === "ads" && (
        <div className="mb-5 space-y-3">
          <AdEntry onAdd={onAds} />
          <Importer
            label="광고비 (CSV로 한꺼번에)"
            hint="메타 광고 관리자 › 보고서에서 '일' 단위로 내보낸 파일. 광고세트가 여러 줄이어도 날짜로 합칩니다."
            onText={takeAds}
          />
          <p className="text-xs leading-relaxed text-stone-400">
            표에서 광고비 숫자를 눌러 바로 고칠 수도 있어요.
          </p>
        </div>
      )}

      {panel === "samchon" && (
        <div className="mb-5">
          <SamchonEntry monthly={conf.monthly} daily={conf.samchonDaily} onMonth={onMonth} onPut={onSamchon} />
        </div>
      )}

      {panel === "data" && (
        <div className="mb-5 space-y-3">
          <Importer
            label="총매출 (카페24 애널리틱스)"
            hint="카페24 › 애널리틱스 › 매출분석 › 일별 CSV. '결제합계'가 총매출, '환불합계'를 빼면 순매출이 됩니다."
            onText={takeCafe}
          />
          <Importer
            label="주문 데이터 (원가·건수)"
            hint="poclo-cafe24 폴더에서 4_주문불러오기.bat 을 돌리면 나오는 orders_일별.csv"
            onText={takeDaily}
          />
          <CostFields conf={conf} onConf={onConf} onMonth={onMonth} months={costMonths} />
          <button
            type="button"
            onClick={() => {
              if (window.confirm("넣어둔 매출·광고비를 전부 지울까요?")) onClear();
            }}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-rose-700"
          >
            <Trash2 size={13} /> 전부 지우기
          </button>
        </div>
      )}

      {days.length === 0 ? (
        <Empty
          title="이 기간에 매출이 없어요."
          hint="기간을 바꾸거나 '데이터 넣기'에서 카페24 매출분석 CSV를 넣어주세요."
        />
      ) : (
        <>
          <section className="mb-5 space-y-3">
            <AdGauge total={total} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Kpi
                label="총매출"
                value={won(total.revenue)}
                sub={`하루 평균 ${won(total.revenue / (total.days || 1))}`}
              />
              <Kpi label="광고비" value={won(total.ads)} sub={`${pct(total.adRate)}%`} />
              <Kpi label="ROAS" value={pct(total.roas, 2)} sub="광고 1원당 매출" />
              <Kpi
                label="환불"
                value={total.refund ? "−" + won(total.refund) : "—"}
                sub={`${pct(total.refundRate)}%`}
              />
            </div>
          </section>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs text-stone-400">
                  {HEAD.map((h, i) => (
                    <th
                      key={h}
                      className={"px-3 py-2.5 font-medium " + (i === 0 ? "text-left" : "text-right")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {days.map((d) => (
                  <tr key={d.date} className="hover:bg-stone-50">
                    <td className="px-3 py-1.5 text-left whitespace-nowrap text-stone-600">
                      {dayLabel(d.date)}
                      {!d.revenue && !d.orders && <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] text-stone-400">주문 없음</span>}
                    </td>
                    <td className="px-1 py-1.5">
                      <EditNum
                        value={d.revenue}
                        tone="font-medium text-stone-900"
                        onSave={(v) => onEdit(d.date, { cafeGross: v })}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <EditNum value={d.ads} tone={d.adsMeta > 0 ? "text-sky-700" : undefined} onSave={(v) => onEdit(d.date, { ads: v })} />
                        {d.adsMeta > 0 && (
                          <span className="shrink-0 text-[10px] text-sky-600" title="장부 광고비가 0이라 메타 하루 기록으로 채움 — 누르고 적으면 장부 값이 돼요">
                            메타
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={
                        "px-3 py-1.5 text-right font-medium " +
                        (d.ads ? TONE_TEXT[adTone(d.adRate)] : "text-stone-300")
                      }
                    >
                      {d.ads ? pct(d.adRate) + "%" : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-stone-500">
                      {d.ads ? pct(d.roas, 2) : "—"}
                    </td>
                    <td className="px-1 py-1.5">
                      <EditNum
                        value={d.refund}
                        onSave={(v) => onEdit(d.date, { cafeRefund: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              <b className="font-semibold">숫자를 눌러 직접 고칠 수 있어요.</b> 총매출은 카페24 ›
              애널리틱스 › 매출분석의 <b className="font-semibold">결제합계</b>와 같은 값이에요
              (배송비 포함). 반품될 주문도 광고가 만든 매출이라 여기서 빼지 않습니다.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
