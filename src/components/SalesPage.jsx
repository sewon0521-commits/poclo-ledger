import { useMemo, useState } from "react";
import { Megaphone, Target, Upload, Settings2, Trash2, Info } from "lucide-react";
import { rangeLabel, dayLabel } from "../lib/calc";
import {
  won,
  pct,
  totalPnl,
  parseDaily,
  parseCafe,
  parseAds,
  DEFAULT_COSTS,
  TARGET_AD_RATE,
} from "../lib/sales";
import { adTone, TONE_TEXT, useDays } from "../lib/view";
import { Kpi, Empty } from "./ui";
import DateRange from "./DateRange";

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

/** CSV 붙여넣기 / 파일 올리기 한 벌 */
function Importer({ label, hint, onText }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const take = async (value) => setMsg(await onText(value));

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-sm font-semibold text-stone-800">{label}</div>
      <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-stone-400">{hint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="CSV를 통째로 붙여넣으세요"
        className="h-20 w-full resize-y rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            take(text);
            setText("");
          }}
          className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white"
        >
          적용
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-600">
          <Upload size={14} /> 파일 고르기
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) take(await f.text());
            }}
          />
        </label>
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
  ["fixed", "월 고정비", "임대·앱·삼촌"],
];

function CostFields({ costs, onChange }) {
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
              onChange={(e) => onChange({ ...costs, [key]: Number(e.target.value) || 0 })}
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
  onClear,
  range,
  preset,
  custom,
  onRange,
}) {
  const [open, setOpen] = useState(false);
  const days = useDays(rows, range, conf);
  const total = useMemo(() => totalPnl(days), [days]);
  const costs = { ...DEFAULT_COSTS, ...conf.costs };

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
            이 광고비로 얼마가 나왔나. 남은 돈은{" "}
            <b className="font-semibold text-stone-700">손익</b>에서 봐요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-600"
        >
          데이터 넣기
        </button>
      </div>

      <div className="mb-4">
        <DateRange preset={preset} custom={custom} onChange={onRange} />
        <p className="mt-1.5 text-xs text-stone-400">
          {rangeLabel(range)} · {total.days}일
        </p>
      </div>

      {open && (
        <div className="mb-5 space-y-3">
          <Importer
            label="총매출 (카페24 애널리틱스)"
            hint="카페24 › 애널리틱스 › 매출분석 › 일별 CSV. 여기 '결제합계'가 총매출이 됩니다."
            onText={takeCafe}
          />
          <Importer
            label="주문 데이터 (원가·건수)"
            hint="poclo-cafe24 폴더에서 4_주문불러오기.bat 을 돌리면 나오는 orders_일별.csv"
            onText={takeDaily}
          />
          <Importer
            label="광고비"
            hint="메타 광고 관리자 › 보고서에서 '일' 단위로 내보낸 CSV. 광고세트가 여러 줄이어도 날짜로 합칩니다."
            onText={takeAds}
          />
          <CostFields costs={costs} onChange={(c) => onConf({ ...conf, costs: c })} />
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
                value={total.refundShown ? "−" + won(total.refundShown) : "—"}
                sub={`${pct(total.refundRate)}%`}
              />
            </div>
          </section>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
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
                    <td className="px-3 py-2 text-left whitespace-nowrap text-stone-600">
                      {dayLabel(d.date)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-stone-900">
                      {won(d.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-600">
                      {d.ads ? won(d.ads) : "—"}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right font-medium " +
                        (d.ads ? TONE_TEXT[adTone(d.adRate)] : "text-stone-300")
                      }
                    >
                      {d.ads ? pct(d.adRate) + "%" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500">
                      {d.ads ? pct(d.roas, 2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-400">
                      {d.cafeRefund || d.refund ? "−" + won(d.cafeRefund || d.refund) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-stone-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              총매출은 <b className="font-semibold">카페24 애널리틱스 › 매출분석의 결제합계</b>와
              같은 숫자예요. 반품될 주문도 광고가 만든 매출이라 여기 그대로 둡니다. 취소·반품을 뺀
              실제 남은 돈은 <b className="font-semibold">손익</b> 화면에서 봐요.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
