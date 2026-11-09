// 돈 › 매출 › 광고 증액 판단 (2026-11-09 세원: 쇼필공 강의 — "터질 때 광고비를 많이 써야 하는데, ROAS 가 효율적으로 찍히는 걸 보려고 증액을 안 한다.
// 나중에는 ROAS 효율이 떨어질 수밖에 없는데 남는 '순수익'은 높아진다" → 맞는지 확인 + ERP 프로그램으로). 계산은 lib/adScale.js 머리말.
// Claude API 를 안 부른다(돈 0원) — 매출 장부·메타 하루 기록으로만 센다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Info, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { won, pct } from "../lib/sales";
import { loadKey } from "../lib/shoot";
import { adDays, lastDays, weeksOf, breakEven, keepOf, needRoas, scenarios } from "../lib/adScale";
import { Kpi, Empty } from "./ui";

const BASES = [
  { id: 30, label: "최근 30일" },
  { id: 90, label: "최근 90일" },
  { id: 0, label: "8월부터 전부" },
];

const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const man = (n) => {
  if (!n) return "0";
  const v = Math.abs(n) / 10000;
  return (n < 0 ? "−" : "") + (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, "") + "만";
};
const signWon = (n) => (n >= 0 ? "+" : "−") + won(Math.abs(n));
const parse = (s) => {
  const n = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 숫자 칸 — 치는 동안은 글자 그대로, 칸을 벗어나면 쉼표 */
function NumField({ label, value, onChange, suffix, digits = 0, hint }) {
  const [text, setText] = useState(null);
  const shown = text ?? (digits ? (value ? value.toFixed(digits) : "") : value ? won(value) : "");
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-stone-300 bg-white focus-within:border-rose-600">
        <input
          type="text"
          inputMode="decimal"
          value={shown}
          onFocus={() => setText(shown.replace(/,/g, ""))}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parse(e.target.value));
          }}
          onBlur={() => setText(null)}
          className="w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-right text-sm font-semibold tabular-nums outline-none"
        />
        {suffix && <span className="pr-3 text-xs text-stone-400">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-stone-400">{hint}</span>}
    </label>
  );
}

/** 주마다 하루 광고비(가로) × 하루 남는 돈(세로). 점 하나 = 한 주. 한 축, 한 색. */
function WeekScatter({ weeks }) {
  const [hover, setHover] = useState(null);
  // 칸 폭 그대로 그린다 — 폰에서 viewBox 를 줄여 그리면 글씨가 6px 로 작아져서
  const box = useRef(null);
  const [bw, setBw] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBw(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = bw;
  const H = W < 480 ? 250 : 300;
  const P = { l: 46, r: 14, t: 18, b: 38 };
  const pts = weeks.filter((w) => w.n >= 3 && w.ads > 0);
  if (pts.length < 2) return null;
  const xMax = Math.max(...pts.map((w) => w.dayAds)) * 1.12;
  const yMaxRaw = Math.max(...pts.map((w) => w.dayKeep));
  const yMinRaw = Math.min(0, ...pts.map((w) => w.dayKeep));
  const yMax = yMaxRaw * 1.15 || 1;
  const yMin = yMinRaw < 0 ? yMinRaw * 1.15 : 0;
  const x = (v) => P.l + (v / xMax) * (W - P.l - P.r);
  const y = (v) => P.t + ((yMax - v) / (yMax - yMin)) * (H - P.t - P.b);
  const step = (max) => {
    const raw = max / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) || p * 10;
  };
  const xs = step(xMax);
  const ys = step(yMax - yMin);
  const xTicks = [];
  for (let v = 0; v <= xMax; v += xs) xTicks.push(v);
  const yTicks = [];
  for (let v = Math.ceil(yMin / ys) * ys; v <= yMax; v += ys) yTicks.push(v);
  const last = pts[pts.length - 1];
  const h = hover != null ? pts[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="주마다 하루 광고비와 하루 남는 돈">
        {yTicks.map((v) => (
          <g key={"y" + v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#a8a29e" : "#f0eeec"} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#a8a29e">
              {man(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={"x" + v} x={x(v)} y={H - P.b + 18} textAnchor="middle" fontSize="11" fill="#a8a29e">
            {man(v)}
          </text>
        ))}
        <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="11" fill="#78716c">
          하루 광고비 →
        </text>
        <text x={P.l} y={P.t - 4} fontSize="11" fill="#78716c">
          ↑ 하루 남는 돈 (광고비까지 뺀 것)
        </text>
        {pts.map((w, i) => {
          const isLast = w === last;
          const on = hover === i;
          return (
            <g key={w.start}>
              <circle cx={x(w.dayAds)} cy={y(w.dayKeep)} r={on ? 7 : isLast ? 6.5 : 5.5} fill="#be123c" fillOpacity={isLast || on ? 1 : 0.45} stroke="#fff" strokeWidth="2" />
              <circle
                cx={x(w.dayAds)}
                cy={y(w.dayKeep)}
                r="16"
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
                style={{ cursor: "pointer" }}
              />
              {isLast && !on && (
                <text x={x(w.dayAds) + 10} y={y(w.dayKeep) - 9} fontSize="11" fontWeight="600" fill="#44403c">
                  최근 주
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 w-48 rounded-lg border border-stone-200 bg-white p-2.5 text-xs shadow-lg"
          style={{
            left: `min(max(${(x(h.dayAds) / W) * 100}% - 6rem, 0px), calc(100% - 12rem))`,
            top: `max(${(y(h.dayKeep) / H) * 100}% - 7.5rem, 0px)`,
          }}
        >
          <div className="font-semibold text-stone-800">
            {md(h.start)} 주{h.n < 7 ? ` (${h.n}일)` : ""}
          </div>
          <div className="mt-1 flex justify-between text-stone-500">
            하루 광고비 <b className="font-semibold text-stone-800 tabular-nums">{won(h.dayAds)}</b>
          </div>
          <div className="flex justify-between text-stone-500">
            하루 총매출 <b className="font-semibold text-stone-800 tabular-nums">{won(h.dayRev)}</b>
          </div>
          <div className="flex justify-between text-stone-500">
            ROAS <b className="font-semibold text-stone-800 tabular-nums">{h.roas.toFixed(2)}</b>
          </div>
          <div className="flex justify-between text-stone-500">
            하루 남는 돈 <b className="font-semibold text-stone-800 tabular-nums">{signWon(h.dayKeep)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Calculator({ rate, recent }) {
  const be = breakEven(rate);
  const [s0, setS0] = useState(Math.round(recent.dayAds / 1000) * 1000);
  const [r0, setR0] = useState(Math.round(recent.roas * 100) / 100);
  const [s1, setS1] = useState(Math.round((recent.dayAds * 2) / 10000) * 10000 || 100000);
  const reset = () => {
    setS0(Math.round(recent.dayAds / 1000) * 1000);
    setR0(Math.round(recent.roas * 100) / 100);
  };
  const keep0 = keepOf(s0, r0, rate);
  const need = needRoas(s0, r0, s1, rate);
  const rows = useMemo(() => (s0 > 0 && r0 > 0 && s1 > 0 && rate > 0 ? scenarios(s0, r0, s1, rate) : []), [s0, r0, s1, rate]);
  const maxDiff = Math.max(1, ...rows.map((r) => Math.abs(r.diff)));
  const up = s1 > s0;
  const nowBad = r0 > 0 && r0 < be;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-stone-900">늘리면 얼마나 남나 — 계산기</h3>
        <button type="button" onClick={reset} className="text-xs font-medium text-stone-400 hover:text-stone-700">
          최근 7일 값으로
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label="지금 하루 광고비" value={s0} onChange={setS0} suffix="원" hint={`최근 7일 평균 ${won(recent.dayAds)}`} />
        <NumField label="지금 ROAS" value={r0} onChange={setR0} digits={2} hint={`최근 7일 ${recent.roas.toFixed(2)} (카페24 총매출 ÷ 광고비)`} />
        <div className="col-span-2 sm:col-span-1">
          <NumField label="바꿀 하루 광고비" value={s1} onChange={setS1} suffix="원" />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[1.5, 2, 3].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setS1(Math.round((s0 * k) / 10000) * 10000)}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
              >
                {k}배
              </button>
            ))}
            {[200000, 300000, 500000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setS1(v)}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
              >
                {man(v)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {s0 > 0 && r0 > 0 && s1 > 0 && s1 !== s0 && (
        <div className={"mt-4 rounded-xl px-4 py-3 " + (up ? "bg-rose-50" : "bg-stone-50")}>
          <p className="text-sm leading-relaxed text-stone-800">
            {up ? (
              <>
                하루 {won(s0)} → <b className="font-semibold">{won(s1)}</b>로 늘려도{" "}
                <b className="text-base font-bold text-rose-700 tabular-nums">ROAS {need.toFixed(2)}</b> 아래로만 안 떨어지면 지금보다 더 남아요.
              </>
            ) : (
              <>
                하루 {won(s0)} → <b className="font-semibold">{won(s1)}</b>로 줄이면 ROAS 가{" "}
                <b className="text-base font-bold text-rose-700 tabular-nums">{need.toFixed(2)}</b> 넘게 올라야 지금만큼 남아요.
              </>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            지금 하루 남는 돈(이 계산) {signWon(keep0)} · {up ? "늘린" : "줄인"} {won(Math.abs(s1 - s0))}이 매출 {won(Math.abs(s1 - s0) * be)} 넘게{" "}
            {up ? "만들면" : "못 만들고 있었다면"} 이득 (= 그 돈의 ROAS {be.toFixed(2)})
          </p>
        </div>
      )}
      {nowBad && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          지금 ROAS {r0.toFixed(2)} 가 손익분기 {be.toFixed(2)} 보다 낮아요 — 광고비를 쓸수록 남는 돈이 줄어드는 상태예요. 늘리기 전에 소재부터.
        </p>
      )}

      {rows.length > 0 && s1 !== s0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-400">
                <th className="py-2 pr-2 font-medium">바꾼 뒤 ROAS</th>
                <th className="py-2 pr-2 text-right font-medium">하루 총매출</th>
                <th className="py-2 pr-2 text-right font-medium">{up ? "늘린" : "줄인"} 돈의 ROAS</th>
                <th className="py-2 pr-2 text-right font-medium">하루 남는 돈</th>
                <th className="w-[34%] py-2 font-medium">지금보다</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.roas} className={"border-b border-stone-100 " + (r.isNeed ? "bg-rose-50/60" : "")}>
                  <td className="py-2 pr-2 font-semibold tabular-nums text-stone-800">
                    {r.roas.toFixed(2)}
                    {r.isNow && <span className="ml-1.5 text-[11px] font-normal text-stone-400">지금과 같으면</span>}
                    {r.isNeed && <span className="ml-1.5 text-[11px] font-medium text-rose-700">지금만큼 남는 선</span>}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-stone-600">{won(r.rev)}</td>
                  <td className={"py-2 pr-2 text-right tabular-nums " + (r.mRoas != null && r.mRoas < be ? "text-rose-700" : "text-stone-600")}>
                    {r.mRoas == null ? "—" : r.mRoas.toFixed(2)}
                  </td>
                  <td className="py-2 pr-2 text-right font-semibold tabular-nums text-stone-800">{signWon(r.keep)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-stone-100">
                        <div
                          className={"absolute top-0 h-2 rounded-full " + (r.diff >= 0 ? "left-1/2 bg-emerald-600" : "right-1/2 bg-rose-600")}
                          style={{ width: `${(Math.abs(r.diff) / maxDiff) * 50}%` }}
                        />
                        <div className="absolute top-[-2px] left-1/2 h-3 w-px bg-stone-300" />
                      </div>
                      <span className={"w-20 shrink-0 text-right text-xs font-semibold tabular-nums " + (r.diff >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {signWon(r.diff)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
            ROAS 는 늘리면 보통 떨어져요(넓은 사람에게까지 보여지니까). 이 표는 '얼마까지 떨어져도 되나'를 보는 것 — 실제로 얼마가 나올지는 늘려 보고 아래 주별 표로 확인해요.
          </p>
        </div>
      )}
    </section>
  );
}

function WeekTable({ weeks, be }) {
  const list = [...weeks].reverse();
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-xs text-stone-400">
            <th className="px-3 py-2 text-left font-medium">주</th>
            <th className="px-2 py-2 text-right font-medium">하루 광고비</th>
            <th className="px-2 py-2 text-right font-medium">하루 총매출</th>
            <th className="px-2 py-2 text-right font-medium">ROAS</th>
            <th className="px-2 py-2 text-right font-medium">전주보다 광고비</th>
            <th className="px-2 py-2 text-right font-medium">바꾼 광고비의 ROAS</th>
            <th className="px-2 py-2 text-right font-medium">하루 남는 돈</th>
            <th className="px-3 py-2 text-right font-medium">전주보다</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => {
            const good = w.mRoas != null && (w.dAds > 0 ? w.mRoas >= be : w.mRoas < be);
            return (
              <tr key={w.start} className="border-b border-stone-100 last:border-0">
                <td className="px-3 py-2 text-stone-700">
                  {md(w.start)}~{md(w.end)}
                  {w.n < 7 && <span className="ml-1 text-[11px] text-stone-400">{w.n}일</span>}
                  {w.meta > 0 && <span className="ml-1 text-[11px] text-stone-300" title="매출 장부 광고비가 비어 메타 기록으로 채운 날">메타 {w.meta}</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-stone-700">{won(w.dayAds)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-stone-700">{won(w.dayRev)}</td>
                <td className={"px-2 py-2 text-right font-semibold tabular-nums " + (w.roas && w.roas < be ? "text-rose-700" : "text-stone-800")}>
                  {w.roas ? w.roas.toFixed(2) : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-stone-500">{w.dAds == null ? "" : signWon(w.dAds)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {w.mRoas == null ? (
                    <span className="text-xs text-stone-300">{w.dAds == null ? "" : "거의 그대로"}</span>
                  ) : (
                    <span className={"inline-flex flex-col items-end font-semibold leading-tight " + (good ? "text-emerald-700" : "text-rose-700")}>
                      <span className="inline-flex items-center gap-1">
                        {w.dAds > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {w.mRoas.toFixed(2)}
                      </span>
                      <span className="text-[11px] font-medium">
                        {w.dAds > 0 ? (good ? "늘려서 이득" : "늘린 만큼 못 범") : good ? "줄인 게 나음" : "줄여서 손해"}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-stone-800">{signWon(w.dayKeep)}</td>
                <td className={"px-3 py-2 text-right text-xs tabular-nums " + (w.dKeep == null ? "" : w.dKeep >= 0 ? "text-emerald-700" : "text-rose-700")}>
                  {w.dKeep == null ? "" : signWon(w.dKeep)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdScalePage({ rows, conf, online, onPage }) {
  const [meta, setMeta] = useState(null);
  const [base, setBase] = useState(() => {
    try {
      return Number(localStorage.getItem("poclo_adscale_base") ?? 30);
    } catch {
      return 30;
    }
  });
  useEffect(() => {
    let alive = true;
    loadKey("meta_daily", online, null)
      .then((v) => alive && setMeta(v?.days || {}))
      .catch(() => alive && setMeta({}));
    return () => {
      alive = false;
    };
  }, [online]);

  const days = useMemo(() => (meta ? adDays(rows, conf, meta) : []), [rows, conf, meta]);
  const basis = useMemo(() => (base ? lastDays(days, base) : lastDays(days, 9999)), [days, base]);
  const recent = useMemo(() => lastDays(days, 7), [days]);
  const weeks = useMemo(() => weeksOf(days), [days]);
  const rate = basis.rate;
  const be = breakEven(rate);
  const pickBase = (id) => {
    setBase(id);
    try {
      localStorage.setItem("poclo_adscale_base", String(id));
    } catch {
      /* 이 기기 저장 안 됨 — 그대로 */
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-stone-900">광고 증액 판단</h2>
        <p className="mt-0.5 text-sm text-stone-500">ROAS 가 떨어져도 남는 돈이 늘어나는지 — 우리 매출·원가로 계산해요.</p>
      </div>

      {meta == null ? (
        <p className="text-sm text-stone-400">불러오는 중…</p>
      ) : days.length === 0 ? (
        <Empty title="원가까지 아는 날이 아직 없어요." hint="매출 장부에 주문 데이터(8월부터)가 들어오면 여기서 계산해요.">
          <button type="button" onClick={() => onPage("sales")} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white">
            매출 장부로 가기
          </button>
        </Empty>
      ) : (
        <>
          <section className="rounded-2xl border border-rose-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-stone-500">우리 손익분기 ROAS</div>
                <div className="mt-0.5 text-3xl font-bold tabular-nums text-rose-700">{be.toFixed(2)}</div>
              </div>
              <div className="flex rounded-lg bg-stone-100 p-1">
                {BASES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pickBase(b.id)}
                    className={"rounded-md px-2.5 py-1.5 text-xs font-medium transition " + (base === b.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              <b className="font-semibold">추가로 쓴 광고비가 ROAS {be.toFixed(2)} 넘게 벌어 오면</b> 전체 ROAS 가 떨어져도 남는 돈은 늘어요. 그 아래로 떨어지는 지점부터는 늘릴수록 줄어요.
            </p>
            <p className="mt-1 text-xs text-stone-400">
              {base ? `${md(basis.start)}~${md(basis.end)}` : `${md(days[0].date)}~${md(basis.end)}`} 총매출 {won(basis.rev)}원 중 광고비 빼기 전 남는 돈(원가·택배·부자재·수수료 뺌) {pct(rate * 100)}% → 1 ÷ {pct(rate * 100)}% = {be.toFixed(2)}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi label="최근 7일 하루 광고비" value={won(recent.dayAds)} sub={`${md(recent.start)}~${md(recent.end)}`} />
            <Kpi label="최근 7일 ROAS" value={recent.roas ? recent.roas.toFixed(2) : "—"} tone={recent.roas && recent.roas < be ? "rose" : "emerald"} sub="카페24 총매출 ÷ 광고비" />
            <Kpi label="하루 남는 돈" value={signWon(recent.dayKeep)} tone={recent.dayKeep >= 0 ? "emerald" : "rose"} sub="광고비까지 뺀 것 (고정비 전)" />
            <Kpi
              label="ROAS 여유"
              value={recent.roas ? (recent.roas - be >= 0 ? "+" : "") + (recent.roas - be).toFixed(2) : "—"}
              tone={recent.roas && recent.roas >= be ? "emerald" : "rose"}
              sub={recent.roas >= be ? "늘려 볼 여유가 있어요" : "늘리기 전에 소재부터"}
            />
          </div>

          {recent.dayAds > 0 && recent.roas > 0 && <Calculator key={`${recent.end}-${Math.round(rate * 1000)}`} rate={rate} recent={recent} />}

          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-stone-900">실제로 그랬나 — 주마다</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                점 하나가 한 주. 오른쪽(광고비 많이 쓴 주)일수록 위(많이 남음)면 강의 말대로예요. '바꾼 광고비의 ROAS' = 전주보다 바뀐 매출 ÷ 바뀐 광고비 — 늘렸을 땐{" "}
                {be.toFixed(2)} 넘으면 이득, 줄였을 땐 {be.toFixed(2)} 넘으면 줄여서 손해(번 돈이 아낀 돈보다 많이 빠짐).
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
              <WeekScatter weeks={weeks} />
            </div>
            <WeekTable weeks={weeks} be={be} />
          </section>

          <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-relaxed text-stone-500">
            <Info size={14} className="mt-0.5 shrink-0 text-stone-400" />
            <div className="space-y-1">
              <p>ROAS 는 메타 광고 관리자 숫자가 아니라 카페24 총매출 ÷ 광고비예요(광고 없이 들어온 매출까지). 광고를 늘렸을 때 쇼핑몰 전체로 남는 돈을 보려고요.</p>
              <p>남는 돈 = 총매출 × {pct(rate * 100)}% − 광고비. 삼촌비·고정비는 광고비와 상관없이 나가서 뺐어요(손익 화면에서 봐요).</p>
              <p>시즌·신상·이벤트가 같이 바뀐 주는 광고 효과만으로 볼 수 없어요. 늘릴 땐 한 번에 크게보다 2~3일씩 나눠 올리고 이 표로 확인하는 게 안전해요.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
