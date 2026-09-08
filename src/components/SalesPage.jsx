import { useMemo, useState } from "react";
import { Megaphone, Target, Upload, Settings2, Trash2 } from "lucide-react";
import { rangeLabel, dayLabel } from "../lib/calc";
import {
  won,
  pct,
  buildDays,
  totalPnl,
  parseDaily,
  parseAds,
  DEFAULT_COSTS,
  TARGET_AD_RATE,
} from "../lib/sales";
import { Kpi, Empty } from "./ui";
import DateRange from "./DateRange";

// 광고비율은 낮을수록 좋다. 목표 18%.
const adTone = (rate) =>
  rate <= TARGET_AD_RATE ? "emerald" : rate <= 30 ? "amber" : "rose";

const TONE_TEXT = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  rose: "text-rose-700",
};

/** 목표 18%까지 얼마나 왔는지 한 줄로 */
function AdGauge({ total }) {
  const tone = adTone(total.adRate);
  const width = Math.min((total.adRate / 45) * 100, 100);
  const mark = (TARGET_AD_RATE / 45) * 100;
  const gap = total.adRate - TARGET_AD_RATE;

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
            (tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-rose-600")
          }
          style={{ width: `${width}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-stone-900/50" style={{ left: `${mark}%` }} />
      </div>

      <p className="mt-2.5 text-sm text-stone-500">
        광고비 <span className="font-semibold tabular-nums text-stone-700">{won(total.ads)}</span>
        {" · "}ROAS <span className="font-semibold tabular-nums text-stone-700">{pct(total.roas, 2)}</span>
        {gap > 0 && (
          <>
            <br />
            목표까지 <span className="font-semibold tabular-nums">{won(total.ads - total.targetAds)}</span>{" "}
            줄이면 영업이익이{" "}
            <span className="font-semibold tabular-nums text-emerald-700">
              {won(total.targetProfit)}
            </span>
            이 돼요.
          </>
        )}
      </p>
    </div>
  );
}

/** CSV 붙여넣기 / 파일 올리기 한 벌 */
function Importer({ label, hint, onText, msg }) {
  const [text, setText] = useState("");

  const file = async (f) => {
    if (!f) return;
    onText(await f.text());
  };

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
            onText(text);
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
            onChange={(e) => file(e.target.files?.[0])}
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

const HEAD = [
  "일자",
  "총매출",
  "광고비",
  "광고비율",
  "ROAS",
  "취소·반품",
  "순매출",
  "매출원가",
  "택배·부자재·수수료",
  "고정비",
  "영업이익",
];

function DayTable({ days }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[860px] text-sm">
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
              <td className="px-3 py-2 text-right font-medium text-stone-900">{won(d.gross)}</td>
              <td className="px-3 py-2 text-right text-stone-600">{d.ads ? won(d.ads) : "—"}</td>
              <td className={"px-3 py-2 text-right font-medium " + (d.ads ? TONE_TEXT[adTone(d.adRate)] : "text-stone-300")}>
                {d.ads ? pct(d.adRate) + "%" : "—"}
              </td>
              <td className="px-3 py-2 text-right text-stone-500">
                {d.ads ? pct(d.roas, 2) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-stone-400">
                {d.refund ? "−" + won(d.refund) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-stone-900">{won(d.net)}</td>
              <td className="px-3 py-2 text-right text-stone-500">
                {won(d.cogs)}
                <span className="ml-1 text-[11px] text-stone-300">{pct(d.cogsRate, 0)}%</span>
              </td>
              <td className="px-3 py-2 text-right text-stone-500">{won(d.variable)}</td>
              <td className="px-3 py-2 text-right text-stone-400">{won(d.fixedDay)}</td>
              <td
                className={
                  "px-3 py-2 text-right font-semibold " +
                  (d.profit >= 0 ? "text-emerald-700" : "text-rose-700")
                }
              >
                {d.profit >= 0 ? "+" : "−"}
                {won(Math.abs(d.profit))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SalesPage({
  rows,
  conf,
  onConf,
  onDaily,
  onAds,
  onClear,
  range,
  preset,
  custom,
  onRange,
}) {
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const costs = useMemo(() => ({ ...DEFAULT_COSTS, ...conf.costs }), [conf.costs]);

  const days = useMemo(() => {
    const inRange = rows.filter(
      (r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to),
    );
    return buildDays(
      inRange.map(({ ads, ...rest }) => ({ ...rest, ads })),
      Object.fromEntries(inRange.map((r) => [r.date, r.ads])),
      costs,
      conf.fixed,
    );
  }, [rows, range, costs, conf.fixed]);

  const total = useMemo(() => totalPnl(days), [days]);

  const takeDaily = (text) => {
    const parsed = parseDaily(text);
    if (!parsed.length) {
      setMsg("주문 CSV를 못 읽었어요. orders_일별.csv 를 통째로 붙여넣어 주세요.");
      return;
    }
    onDaily(parsed);
    setMsg(`${parsed.length}일치 매출을 넣었어요.`);
  };

  const takeAds = (text) => {
    const parsed = parseAds(text);
    const n = Object.keys(parsed).length;
    if (!n) {
      setMsg("광고 CSV를 못 읽었어요. '일'과 '지출 금액' 칸이 있는 파일이어야 해요.");
      return;
    }
    onAds(parsed);
    setMsg(`${n}일치 광고비를 넣었어요. 합계 ${won(Object.values(parsed).reduce((a, b) => a + b, 0))}원`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">포클로 매출 장부</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            광고 성적은 <b className="font-semibold text-stone-700">총매출</b>로, 남은 돈은{" "}
            <b className="font-semibold text-stone-700">순매출</b>로 봐요.
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
            label="주문 데이터"
            hint="poclo-cafe24 폴더에서 4_주문불러오기.bat 을 돌리면 나오는 orders_일별.csv"
            onText={takeDaily}
            msg={msg}
          />
          <Importer
            label="광고비"
            hint="메타 광고 관리자 › 보고서에서 '일' 단위로 내보낸 CSV. 광고세트별로 여러 줄이어도 날짜로 합칩니다."
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
          title="아직 매출 데이터가 없어요."
          hint="위 '데이터 넣기'에서 orders_일별.csv 와 메타 광고 CSV를 넣어주세요."
        />
      ) : (
        <>
          <section className="mb-5 space-y-3">
            <AdGauge total={total} />

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Kpi
                label="총매출"
                value={won(total.gross)}
                sub={`하루 평균 ${won(total.gross / (total.days || 1))}`}
              />
              <Kpi
                label="취소·반품"
                value={"−" + won(total.refund)}
                sub={`${pct(total.refundRate)}%`}
              />
              <Kpi label="순매출" value={won(total.net)} sub="여기서 손익을 낸다" />
              <Kpi
                label="매출원가"
                value={won(total.cogs)}
                sub={`원가율 ${pct(total.cogsRate)}%`}
              />
              <Kpi
                label="영업이익"
                value={(total.profit >= 0 ? "+" : "−") + won(Math.abs(total.profit))}
                tone={total.profit >= 0 ? "emerald" : undefined}
                sub={`순매출의 ${pct(total.margin)}%`}
              />
              <Kpi
                label="손익분기 일매출"
                value={won(total.breakeven)}
                sub={`공헌이익률 ${pct(total.contribRate)}%`}
              />
            </div>
          </section>

          <DayTable days={days} />

          <p className="pt-3 text-xs leading-relaxed text-stone-400">
            총매출은 그날 판 금액이라 광고 성적을 보는 자리고, 순매출은 취소·반품을 뺀 실제 남은
            돈이라 이익을 보는 자리예요. 원가는 주문에 붙어 온 공급가라 가정이 아니에요.
          </p>
        </>
      )}
    </div>
  );
}
