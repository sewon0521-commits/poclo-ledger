import { useMemo, useState } from "react";
import { Megaphone, Target, Upload, Settings2, Trash2, Info, Plus } from "lucide-react";
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

const FIELDS = [
  ["shipCost", "택배비 / 건", "우리가 내는 돈"],
  ["material", "부자재 / 개", ""],
  ["pg", "결제 수수료 (%)", "네이버 외"],
  ["naver", "네이버페이 (%)", "부가세 포함"],
  ["fixed", "월 고정비", "관리비 + 앱"],
  ["samchon", "월 삼촌비", "달마다 다르면 아래에서"],
];

function CostFields({ conf, onConf, months }) {
  const costs = { ...DEFAULT_COSTS, ...conf.costs };
  const monthly = conf.monthly || {};

  const setMonth = (ym, key, v) =>
    onConf({
      ...conf,
      monthly: { ...monthly, [ym]: { ...(monthly[ym] || {}), [key]: v === "" ? undefined : v } },
    });

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-800">
        <Settings2 size={15} /> 비용 가정값
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map(([key, label, sub]) => (
          <label key={key} className="block">
            <span className="block text-xs text-stone-500">{label}</span>
            {sub && <span className="block text-[11px] text-stone-400">{sub}</span>}
            <input
              type="number"
              step="any"
              value={costs[key]}
              onChange={(e) =>
                onConf({ ...conf, costs: { ...costs, [key]: Number(e.target.value) || 0 } })
              }
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-right tabular-nums"
            />
          </label>
        ))}
      </div>

      {months.length > 0 && (
        <>
          <div className="mt-5 mb-2 text-sm font-semibold text-stone-800">달마다 다른 값</div>
          <p className="mb-2.5 text-xs leading-relaxed text-stone-400">
            비워두면 위의 기본값을 씁니다. 택배비 총액을 넣으면 건당 계산 대신 그 금액을 건수
            비율대로 나눠 담아요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-xs text-stone-400">
                  <th className="px-2 py-1.5 text-left font-medium">달</th>
                  {MONTH_FIELDS.map(([, label, hint]) => (
                    <th key={label} className="px-2 py-1.5 text-right font-medium">
                      {label}
                      {hint && <div className="text-[10px] font-normal">{hint}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((ym) => (
                  <tr key={ym}>
                    <td className="px-2 py-1 text-left tabular-nums text-stone-600">{ym}</td>
                    {MONTH_FIELDS.map(([key]) => (
                      <td key={key} className="px-2 py-1">
                        <input
                          type="number"
                          step="any"
                          value={monthly[ym]?.[key] ?? ""}
                          placeholder="기본값"
                          onChange={(e) =>
                            setMonth(ym, key, e.target.value === "" ? "" : Number(e.target.value))
                          }
                          className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-right tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  const months = useMemo(
    () => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(),
    [days],
  );

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
          <CostFields conf={conf} onConf={onConf} months={months} />
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
                    </td>
                    <td className="px-1 py-1.5">
                      <EditNum
                        value={d.revenue}
                        tone="font-medium text-stone-900"
                        onSave={(v) => onEdit(d.date, { cafeGross: v })}
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <EditNum value={d.ads} onSave={(v) => onEdit(d.date, { ads: v })} />
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
