import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Kpi } from "./ui";

/**
 * 계정 아카이브 › 성장 (11/5 세원: "계정 아카이브에 해당 쇼핑몰이 얼마나 크는지 팔로우수나 그런 것도 파악할 수 있게").
 *
 * 숫자는 사무실 PC 매일 스캔(poclo-cafe24/account_scan.profile_of)이 로그인 없이 연 프로필 페이지에서 읽는다 —
 * 팔로워·팔로잉은 정확한 값, 게시물 수는 인스타가 1만 넘으면 반올림해서 준다(1.1만 → 11,000).
 *  - 계정마다 acct_<id>.growth [{d, f 팔로워, fo 팔로잉, m 게시물, a 켜 둔 광고(광고 추적할 때만)}] — 하루 한 점, 같은 날 다시 스캔하면 바꿈
 *  - 목록 accounts.items[].growth {at, followers, following, posts, d1, d7, d30, posts7, since, dAll} — 비교 표가 이것만 읽는다
 * 기록은 11/5 부터 — 그 전 팔로워는 어디에도 없어서 지어내지 않는다(7일이 안 차면 '7일 전보다'는 비어 있다).
 */

const fmt = new Intl.NumberFormat("ko-KR");
const num = (n) => (n == null ? "—" : fmt.format(n));
const short = (n) => (n == null ? "—" : n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 1 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}만` : fmt.format(n));
const signed = (n) => (n == null ? "—" : n > 0 ? `+${fmt.format(n)}` : n < 0 ? `−${fmt.format(-n)}` : "0");
const rate = (gain, now) => (gain == null || !now || now - gain <= 0 ? null : gain / (now - gain));
const pctText = (r) => (r == null ? "" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(Math.abs(r) < 0.01 ? 2 : 1)}%`);
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayNo = (d) => Math.round(new Date(d + "T00:00:00Z").getTime() / 86400000);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const kday = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${WEEK[new Date(d + "T00:00:00Z").getUTCDay()]})`;
const toneOf = (n) => (n == null || n === 0 ? "text-stone-500" : n > 0 ? "text-emerald-700" : "text-rose-700");
const arrow = (n) => (n == null || n === 0 ? "" : n > 0 ? "▲ " : "▼ ");

/** n일 전(또는 그 전) 마지막 점과의 차이 — 워커 growth_summary 와 같은 규칙 */
function gainOf(points, n, k = "f") {
  const last = points[points.length - 1];
  if (!last || last[k] == null) return null;
  const cut = dayNo(last.d) - n;
  const p = [...points].reverse().find((x) => dayNo(x.d) <= cut && x[k] != null);
  return p ? last[k] - p[k] : null;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.01);
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(Math.round(v));
  return out;
}

/** 팔로워 선 그래프 — 하루 한 점, 빠진 날은 날짜 간격 그대로 잇는다 */
function FollowerChart({ points }) {
  const [box, w] = useWidth();
  const [hover, setHover] = useState(null);
  const H = 220;
  const pad = { l: 60, r: 14, t: 14, b: 26 };
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const xs = points.map((p) => dayNo(p.d));
  const x0 = xs[0];
  const x1 = Math.max(xs[xs.length - 1], x0 + 1);
  const fs = points.map((p) => p.f);
  const ticks = niceTicks(Math.min(...fs), Math.max(...fs));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1] === y0 ? y0 + 1 : ticks[ticks.length - 1];
  const X = (d) => pad.l + ((d - x0) / (x1 - x0)) * iw;
  const Y = (v) => pad.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(p.f).toFixed(1)}`).join("");
  const area = `${line}L${X(xs[xs.length - 1]).toFixed(1)},${pad.t + ih}L${X(x0).toFixed(1)},${pad.t + ih}Z`;
  const xl = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const last = points.length - 1;
  const h = hover == null ? null : points[hover];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = x0 + ((e.clientX - r.left - pad.l) / iw) * (x1 - x0);
    let best = 0;
    xs.forEach((x, i) => Math.abs(x - d) < Math.abs(xs[best] - d) && (best = i));
    setHover(best);
  };

  return (
    <div ref={box} className="relative w-full">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`팔로워 ${md(points[0].d)} ${num(points[0].f)}명에서 ${md(points[last].d)} ${num(points[last].f)}명`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="#e7e5e4" strokeWidth="1" />
              <text x={pad.l - 8} y={Y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#a8a29e" className="tabular-nums">
                {num(t)}
              </text>
            </g>
          ))}
          {xl.map((i) => (
            <text key={i} x={X(xs[i])} y={H - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize="11" fill="#a8a29e">
              {md(points[i].d)}
            </text>
          ))}
          <path d={area} fill="#be123c" fillOpacity="0.07" />
          <path d={line} fill="none" stroke="#be123c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {h && <line x1={X(xs[hover])} x2={X(xs[hover])} y1={pad.t} y2={pad.t + ih} stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" />}
          <circle cx={X(xs[h ? hover : last])} cy={Y((h || points[last]).f)} r="4.5" fill="#be123c" stroke="#fff" strokeWidth="2" />
          <rect
            x={pad.l}
            y={pad.t}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            style={{ touchAction: "pan-y" }}
          />
        </svg>
      )}
      {h && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(X(xs[hover]) - 70, 0), Math.max(0, w - 140)), width: 140 }}
        >
          <div className="text-stone-500">{kday(h.d)}</div>
          <div className="font-semibold text-stone-900 tabular-nums">팔로워 {num(h.f)}</div>
          {hover > 0 && (
            <div className={"tabular-nums " + toneOf(h.f - points[hover - 1].f)}>
              {dayNo(h.d) - xs[hover - 1] === 1 ? "전날" : `${md(points[hover - 1].d)}`}보다 {signed(h.f - points[hover - 1].f)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RANGES = [
  ["30", "30일", 30],
  ["90", "90일", 90],
  ["all", "전체", Infinity],
];

/** 계정 한 곳 — 성장 탭 */
export function GrowthTab({ data }) {
  const [range, setRange] = useState("90");
  const all = useMemo(() => (data?.growth || []).filter((p) => p.f != null), [data]);
  const last = all[all.length - 1];
  if (!last)
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <p className="font-medium text-stone-600">아직 팔로워 기록이 없어요.</p>
        <p className="mt-1.5 text-sm text-stone-400">다음 매일 스캔부터 하루 한 번 쌓여요.</p>
      </div>
    );
  const days = RANGES.find(([k]) => k === range)[2];
  const shown = all.filter((p) => dayNo(last.d) - dayNo(p.d) <= days);
  const d1 = gainOf(all, 1);
  const d7 = gainOf(all, 7);
  const d30 = gainOf(all, 30);
  const p7 = gainOf(all, 7, "m");
  const first = all[0];
  const waiting = (n) => `${md(first.d)}부터 기록 — ${n === 1 ? "내일부터" : `${n}일 쌓이면`} 보여요`;
  const recent = [...all].reverse().slice(0, 14);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="팔로워" value={num(last.f)} sub={`${md(last.d)} 기준`} />
        <Kpi label="어제보다" value={`${arrow(d1)}${signed(d1)}`} tone={d1 > 0 ? "emerald" : d1 < 0 ? "rose" : undefined} sub={d1 == null ? waiting(1) : pctText(rate(d1, last.f))} />
        <Kpi label="7일 전보다" value={`${arrow(d7)}${signed(d7)}`} tone={d7 > 0 ? "emerald" : d7 < 0 ? "rose" : undefined} sub={d7 == null ? waiting(7) : `${pctText(rate(d7, last.f))} · 하루 ${signed(Math.round(d7 / 7))}`} />
        <Kpi label="30일 전보다" value={`${arrow(d30)}${signed(d30)}`} tone={d30 > 0 ? "emerald" : d30 < 0 ? "rose" : undefined} sub={d30 == null ? waiting(30) : pctText(rate(d30, last.f))} />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <TrendingUp size={15} className="text-rose-700" /> 팔로워
          </h3>
          {all.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-xs">
              {RANGES.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  className={"rounded-md px-2.5 py-1 font-medium " + (range === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {shown.length > 1 ? (
          <FollowerChart points={shown} />
        ) : (
          <p className="rounded-xl bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
            {md(first.d)}부터 하루 한 번 쌓여요. 그래프는 이틀째부터 그려져요.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">계정 숫자</h3>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">게시물</dt>
              <dd className="tabular-nums text-stone-900">
                {num(last.m)}
                {p7 != null && <span className="ml-1.5 text-xs text-stone-500">7일 동안 {signed(p7)}개 올림</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">팔로잉</dt>
              <dd className="tabular-nums text-stone-900">{num(last.fo)}</dd>
            </div>
            {last.a != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">켜 둔 광고 (추적한 것)</dt>
                <dd className="tabular-nums text-stone-900">{num(last.a)}개</dd>
              </div>
            )}
          </dl>
          {last.m >= 10000 && <p className="mt-2 text-[11px] text-stone-400">게시물 1만 개가 넘으면 인스타가 반올림해서 보여 줘요.</p>}
        </section>

        <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-stone-800">날마다</h3>
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-stone-400">
                <th className="pb-1 text-left font-normal">날짜</th>
                <th className="pb-1 text-right font-normal">팔로워</th>
                <th className="pb-1 text-right font-normal">늘어난 수</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p, i) => {
                const prev = recent[i + 1];
                const g = prev ? p.f - prev.f : null;
                return (
                  <tr key={p.d} className="border-t border-stone-100">
                    <td className="py-1 text-stone-600">{kday(p.d)}</td>
                    <td className="py-1 text-right text-stone-900">{num(p.f)}</td>
                    <td className={"py-1 text-right " + toneOf(g)}>{g == null ? "—" : signed(g)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

/** 모든 계정 — 누가 빨리 크나 (목록의 growth 요약만 읽는다) */
export function GrowthCompare({ accounts, onPick }) {
  const [sort, setSort] = useState("d7");
  const rows = accounts
    .filter((a) => a.handle)
    .map((a) => {
      const g = a.growth || null;
      return { a, g, r7: g ? rate(g.d7, g.followers) : null, r30: g ? rate(g.d30, g.followers) : null };
    });
  const key = { d7: (x) => x.r7, d30: (x) => x.r30, f: (x) => x.g?.followers }[sort];
  rows.sort((x, y) => (key(y) ?? -Infinity) - (key(x) ?? -Infinity) || (y.g?.followers ?? -1) - (x.g?.followers ?? -1));
  const since = rows.map((x) => x.g?.since).filter(Boolean).sort()[0];
  const maxR = Math.max(0.0001, ...rows.map((x) => Math.abs(x.r7 ?? 0)));
  const noWeek = rows.every((x) => x.g?.d7 == null);
  const SORTS = [
    ["d7", "7일 성장률"],
    ["d30", "30일 성장률"],
    ["f", "팔로워 많은 순"],
  ];

  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-100 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-lg font-bold text-stone-900">
            <TrendingUp size={18} className="text-rose-700" /> 쇼핑몰 성장 비교
          </h3>
          <p className="mt-0.5 text-xs text-stone-500">
            팔로워가 얼마나 늘었나 · 매일 스캔할 때 같이 재요{since ? ` · ${md(since)}부터 기록` : ""}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-xs">
          {SORTS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={"rounded-md px-2.5 py-1 font-medium " + (sort === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {noWeek && (
        <p className="mx-4 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          팔로워는 {since ? md(since) : "오늘"}부터 재기 시작했어요. '7일 전보다'는 일주일 쌓이면 채워지고, 그동안은 팔로워 많은 순이에요.
        </p>
      )}
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm tabular-nums sm:min-w-[34rem]">
          <thead>
            <tr className="text-xs text-stone-400">
              <th className="pb-2 text-left font-normal">계정</th>
              <th className="pb-2 text-right font-normal">팔로워</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">어제보다</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">7일 전보다</th>
              <th className="pb-2 pl-3 text-left font-normal sm:w-28">7일 성장률</th>
              <th className="pb-2 text-right font-normal">30일</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">7일 게시물</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, g, r7, r30 }) => (
              <tr key={a.id} onClick={() => onPick(a.id)} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50">
                <td className="max-w-[9rem] py-2 pr-2 sm:max-w-[12rem]">
                  <div className="truncate font-semibold text-stone-800">@{a.handle}</div>
                  {a.name && <div className="truncate text-[11px] text-stone-400">{a.name}</div>}
                </td>
                {g ? (
                  <>
                    <td className="py-2 text-right font-semibold text-stone-900">{num(g.followers)}</td>
                    <td className={"hidden py-2 text-right sm:table-cell " + toneOf(g.d1)}>{signed(g.d1)}</td>
                    <td className={"hidden py-2 text-right sm:table-cell " + toneOf(g.d7)}>{signed(g.d7)}</td>
                    <td className="py-2 pl-3">
                      {r7 == null ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 rounded-full bg-stone-100" style={{ width: 48 }}>
                            <span
                              className={"block h-2 rounded-full " + (r7 >= 0 ? "bg-emerald-600" : "bg-rose-600")}
                              style={{ width: Math.max(2, (Math.abs(r7) / maxR) * 48) }}
                            />
                          </span>
                          <span className={"text-xs " + toneOf(g.d7)}>{pctText(r7)}</span>
                        </div>
                      )}
                    </td>
                    <td className={"py-2 text-right text-xs " + toneOf(g.d30)}>{r30 == null ? "—" : pctText(r30)}</td>
                    <td className="hidden py-2 text-right text-xs text-stone-600 sm:table-cell">{g.posts7 == null ? "—" : `${signed(g.posts7)}개`}</td>
                  </>
                ) : (
                  <td colSpan={6} className="py-2 text-right text-xs text-stone-400">
                    다음 스캔부터 재요
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 왼쪽 목록 한 줄 — '팔로워 22.4만 · 7일 +0.6%' */
export function growthLine(g) {
  if (!g) return "";
  const r = rate(g.d7, g.followers);
  return `팔로워 ${short(g.followers)}${r != null ? ` · 7일 ${pctText(r)}` : ""}`;
}
