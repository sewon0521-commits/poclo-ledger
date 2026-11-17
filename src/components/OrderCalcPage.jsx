import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Loader2, RotateCcw, Search, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys, FIELD } from "../lib/shoot";
import { flowBoard } from "../lib/pending";
import { won } from "../lib/sales";
import { dayKey } from "../lib/journal";
import { CALC_KEY, DEFAULT_CALC, productList, dailyOf, optionsOf, stockFor, wholesaleOf, misongOf, calcRow, addDays, daysSince, vendorKey } from "../lib/orderCalc";

/**
 * 일 › 발주 계산기 (11/17 밤, lib/orderCalc.js 머리말) — 세원: "미송 + 리드타임 계산기 … 팔리는 거 보고 다시 잡으면 되지"
 * 상품을 고르면 옵션마다: 하루 판매(7·14일 · 최고 주 · 최근 3일 · 직접) · 재고 · 밀린 주문 · 남은 미송 → 넣을 수량 · 바닥나는 날 · 금액.
 * 수량을 직접 바꿔 보면(25 → 15) 바닥나는 날이 바로 바뀐다. 발주는 세원이 직접(계산기는 숫자만).
 * 설정(리드타임 바로/미송 · 거래처마다 · 버틸 날 · 다시 잡을 기준)은 settings order_calc.
 */

const BASIS = [
  ["d7", "최근 7일"],
  ["d14", "최근 14일"],
  ["best7", "최고 주"],
  ["d3", "최근 3일"],
];
const ONE = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const wd = (d) => (d ? "일월화수목금토"[new Date(`${d}T00:00:00`).getDay()] : "");
const mdw = (d) => (d ? `${md(d)}(${wd(d)})` : "");
const clean = (s) =>
  String(s || "")
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
    .trim();
const since = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const remember = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 시크릿 창 */
  }
};
const recall = (k, fb) => {
  try {
    return localStorage.getItem(k) ?? fb;
  } catch {
    return fb;
  }
};

/** 칸에 숫자 — 멈추거나 벗어나면 저장 */
function NumBox({ value, onChange, w = "w-14", min = 0, max = 999, step = 1, label }) {
  const [v, setV] = useState(String(value));
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    setV(String(value));
  }
  const commit = () => {
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n < min || n > max || String(v).trim() === "") return setV(String(value));
    if (n !== value) onChange(step === 1 ? Math.round(n) : n);
  };
  return (
    <input
      value={v}
      aria-label={label}
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`${w} rounded-md border border-stone-200 bg-white px-1.5 py-1 text-center text-stone-900 tabular-nums outline-none focus:border-rose-600 max-sm:text-base`}
    />
  );
}

/** 최근 판매 막대(14일) — 광고 켠 날·끈 날이 눈에 보이게 */
function Bars({ series }) {
  const s = series.slice(-14);
  const top = Math.max(1, ...s.map((x) => x.q));
  return (
    <div className="flex h-7 items-end gap-px" aria-label={`최근 ${s.length}일 판매 ${s.map((x) => x.q).join(", ")}장`}>
      {s.map((x) => (
        <span key={x.day} title={`${mdw(x.day)} ${x.q}장`} className={"w-1.5 rounded-t-sm " + (x.q ? "bg-rose-400" : "bg-stone-200")} style={{ height: `${x.q ? Math.max(12, (x.q / top) * 100) : 8}%` }} />
      ))}
    </div>
  );
}

export default function OrderCalcPage({ tx, vendors, pricing, stats, online }) {
  const [data, setData] = useState({ sales: null, stock: null, backlog: null, loaded: false });
  const [conf, setConfState] = useState(DEFAULT_CALC);
  const [err, setErr] = useState("");
  const [no, setNoState] = useState(() => recall("poclo_calc_no", ""));
  const setNo = (v) => (setNoState(v), remember("poclo_calc_no", v));
  const [q, setQ] = useState("");
  const [rows, setRows] = useState({}); // `${상품}|${옵션}` → {basis, manual, mode, qty}
  const confRef = useRef(conf);
  useEffect(() => {
    confRef.current = conf;
  });

  // 자료 — 판매·재고·밀린 주문·설정 (바뀌면 그 키만 다시)
  useEffect(() => {
    let alive = true;
    const read = async (keys) => {
      try {
        const got = await Promise.all(keys.map((k) => loadKey(k, online, null).catch(() => null)));
        if (!alive) return;
        const m = Object.fromEntries(keys.map((k, i) => [k, got[i]]));
        if ("order_calc" in m) setConfState({ ...DEFAULT_CALC, ...(m.order_calc || {}) });
        setData((d) => ({
          ...d,
          ...("opt_sales" in m ? { sales: m.opt_sales } : {}),
          ...("stock" in m ? { stock: m.stock } : {}),
          ...("order_backlog" in m ? { backlog: m.order_backlog } : {}),
          ...("product_stats" in m ? { stats: m.product_stats } : {}),
          loaded: true,
        }));
      } catch (e) {
        if (alive) setErr(e.message || "자료를 못 읽었어요.");
      }
    };
    const KEYS = ["opt_sales", "stock", "order_backlog", CALC_KEY];
    read(stats ? KEYS : [...KEYS, "product_stats"]);
    const off = onSettingsChange((k) => KEYS.includes(k) && read([k]));
    const stop = watchKeys(KEYS, (k) => read([k]), 15000);
    return () => {
      alive = false;
      off?.();
      stop?.();
    };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveConf = (fn) => {
    const next = fn(confRef.current);
    setConfState(next);
    changeKey(CALC_KEY, online, (v) => fn({ ...DEFAULT_CALC, ...(v || {}) }), DEFAULT_CALC).catch((e) => setErr(e.message || "설정을 저장하지 못했어요."));
  };

  const vname = useMemo(() => Object.fromEntries((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const misLines = useMemo(
    () =>
      flowBoard(tx || [], (id) => vname[id] || "", "pending")
        .groups.flatMap((g) => g.lines)
        .filter((l) => l.left > 0),
    [tx, vname],
  );
  // 판매 중 상품 이름(찾기용) — App 이 준 것, 없으면(이 기기 저장 모드 등) 직접 읽은 것
  const allStats = stats || data.stats;
  const list = useMemo(() => productList({ sales: data.sales, stats: allStats, backlog: data.backlog }), [data.sales, allStats, data.backlog]);
  const curNo = list.some((x) => x.no === no) ? no : list[0]?.no || "";
  const prod = list.find((x) => x.no === curNo);
  const today = dayKey(new Date());

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? list.filter((x) => words.every((w) => `${x.no} ${x.name}`.toLowerCase().includes(w))).slice(0, 12) : [];
  const top = list.filter((x) => x.sold7 > 0 || x.backlog).slice(0, 10);

  // 거래처 — 넥스트팩 줄·판매가 목록에 없으면 남은 미송 줄(도매 상품명이 같은 줄)의 거래처
  const w = useMemo(() => {
    if (!prod) return null;
    const x = wholesaleOf({ stock: data.stock, pricing }, prod.no, prod.name);
    return x.vendor ? x : { ...x, vendor: misongOf(misLines, x, "").vendor || "" };
  }, [prod, data.stock, pricing, misLines]);
  const opts = useMemo(() => (prod ? optionsOf({ sales: data.sales, stock: data.stock, backlog: data.backlog }, prod.no, prod.name) : []), [prod, data.sales, data.stock, data.backlog]);
  const vk = vendorKey(w?.vendor || "");
  const leadOf = (mode) => {
    const own = (vk && conf.lead?.[vk]) || {};
    return mode === "misong" ? (own.misong ?? conf.misong) : (own.fast ?? conf.fast);
  };
  const lines = opts.map((o) => {
    const key = `${curNo}|${o.option}`;
    const st = rows[key] || {};
    const d = dailyOf(data.sales, curNo, o.option);
    const stock = stockFor(data.stock, prod.name, o.option);
    const backlog = Number(data.backlog?.byNo?.[curNo]?.[o.option]) || 0;
    const ms = misongOf(misLines, w || {}, o.option);
    const basis = st.basis || "d7";
    const daily = basis === "manual" ? Number(st.manual) || 0 : d[basis] || 0;
    const mode = st.mode || (ms.left > 0 ? "misong" : "fast");
    const lead = leadOf(mode);
    const r = calcRow({ daily, stock: stock.total, backlog, misong: ms.left, lead, cover: conf.cover, qty: st.qty });
    const out = addDays(today, r.runDays);
    const again = Number.isFinite(r.runDays) ? addDays(today, r.runDays - lead) : "";
    return { key, o, st, d, stock, backlog, ms, basis, daily, mode, lead, r, out, again };
  });
  const setRow = (key, patch) => setRows((m) => ({ ...m, [key]: { ...(m[key] || {}), ...patch } }));
  const totalQty = lines.reduce((a, x) => a + x.r.qty, 0);
  const totalWon = totalQty * (w?.supply || 0);
  const hot = lines.filter((x) => x.daily >= conf.alert && x.again);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
            <Calculator size={20} className="text-rose-700" /> 발주 계산기
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-500">
            옵션마다 <b className="font-semibold text-stone-700">밀린 주문 + 하루 판매 × (리드타임 + 버틸 날) − 재고 − 남은 미송</b> 만큼 넣으면 돼요. 수량을 바꿔 보면 바닥나는 날이 바로 바뀌어요 · 발주는 직접 넣어요.
          </p>
        </div>
        <p className="text-right text-[11px] leading-relaxed text-stone-400">
          판매 {since(data.sales?.updated) || "—"} 기준(새벽마다)
          <br />
          재고 {since(data.stock?.nextpack?.at) || "—"} · 밀린 주문 {since(data.backlog?.at) || "—"}(30분마다)
        </p>
      </div>

      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}

      {/* 상품 고르기 */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품 찾기 (이름 · 상품번호)" aria-label="상품 찾기" className={FIELD + " pl-9"} />
          {q && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="찾기 지우기" className="hit absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-400">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(found.length ? found : top).map((x) => (
            <button
              key={x.no}
              type="button"
              onClick={() => (setNo(x.no), setQ(""))}
              className={"max-w-full truncate rounded-full border px-2.5 py-1 text-xs " + (x.no === curNo ? "border-rose-700 bg-rose-700 font-semibold text-white" : "border-stone-200 bg-white text-stone-700 hover:border-rose-300")}
            >
              {clean(x.name).replace(/\s*\([^)]*colou?r\)\s*$/i, "")} <span className="opacity-70">· 7일 {x.sold7}장{x.backlog ? ` · 밀림 ${x.backlog}` : ""}</span>
            </button>
          ))}
          {words.length > 0 && !found.length && <span className="text-xs text-stone-400">찾는 상품이 없어요</span>}
        </div>
      </section>

      {!data.loaded ? (
        <p className="py-10 text-center text-sm text-stone-400">
          <Loader2 size={16} className="mx-auto mb-1 animate-spin" /> 불러오는 중
        </p>
      ) : !prod ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-400">판매 자료가 아직 없어요 — 새벽 갱신 뒤 다시 열어 봐요.</p>
      ) : (
        <>
          {/* 상품 머리 · 설정 */}
          <section className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-start gap-3">
              {prod.image && <img src={prod.image} alt="" className="aspect-[3/4] w-14 shrink-0 rounded-lg bg-stone-100 object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="text-base leading-snug font-bold text-stone-900">{clean(prod.name)}</div>
                <div className="mt-0.5 text-xs text-stone-500">
                  {w?.vendor || "거래처 모름"}
                  {w?.wholesale ? ` · ${w.wholesale}` : ""} · 공급가 {w?.supply ? won(w.supply) : "모름"}
                  {w?.from ? <span className="text-stone-400"> ({w.from})</span> : null}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-500">넣을 수량 합</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{totalQty}장</div>
                {w?.supply > 0 && <div className="text-xs text-stone-500 tabular-nums">{won(totalWon)}</div>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-100 pt-3 text-xs text-stone-600">
              <label className="flex items-center gap-1.5">
                버틸 날 <NumBox value={conf.cover} label="버틸 날" onChange={(v) => saveConf((c) => ({ ...c, cover: v }))} w="w-12" max={60} />일
              </label>
              <span className="flex flex-wrap items-center gap-1.5">
                리드타임{w?.vendor ? <b className="font-semibold text-stone-700">({w.vendor})</b> : null} 바로 나오면
                <NumBox value={leadOf("fast")} label="바로 나오면 리드타임" w="w-10" max={30} onChange={(v) => saveConf((c) => (vk ? { ...c, lead: { ...(c.lead || {}), [vk]: { ...(c.lead?.[vk] || {}), fast: v } } } : { ...c, fast: v }))} />일 · 미송이면
                <NumBox value={leadOf("misong")} label="미송이면 리드타임" w="w-10" max={30} onChange={(v) => saveConf((c) => (vk ? { ...c, lead: { ...(c.lead || {}), [vk]: { ...(c.lead?.[vk] || {}), misong: v } } } : { ...c, misong: v }))} />일
                {vk && conf.lead?.[vk] && (
                  <button type="button" onClick={() => saveConf((c) => ({ ...c, lead: Object.fromEntries(Object.entries(c.lead || {}).filter(([k]) => k !== vk)) }))} className="text-stone-400 underline decoration-dotted hover:text-rose-700">
                    기본으로({conf.fast}·{conf.misong}일)
                  </button>
                )}
              </span>
              <label className="flex items-center gap-1.5">
                다시 잡을 기준 하루 <NumBox value={conf.alert} label="다시 잡을 기준" w="w-10" max={99} onChange={(v) => saveConf((c) => ({ ...c, alert: v }))} />장↑
              </label>
            </div>
          </section>

          {hot.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 sm:px-4">
              <b className="font-semibold">다시 잡을 때</b> — 하루 {conf.alert}장 넘게 팔리는 옵션:{" "}
              {hot.map((x, i) => (
                <span key={x.key}>
                  {i ? " · " : ""}
                  {x.o.option || "기본"} <b className="font-semibold">{mdw(x.again)}</b> 추가 발주(바닥 {mdw(x.out)} − {x.lead}일)
                </span>
              ))}
            </section>
          )}

          {/* 옵션마다 */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {lines.map((x) => {
              const ms = x.ms;
              const first = ms.lines[0];
              return (
                <section key={x.key} className={"rounded-2xl border bg-white p-3 sm:p-4 " + (x.r.qty > 0 ? "border-rose-200" : "border-stone-200")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-base font-bold text-stone-900">{x.o.option || "기본"}</span>
                      <Bars series={x.d.series} />
                    </div>
                    <div className="flex rounded-lg bg-stone-100 p-0.5 text-xs font-semibold" role="group" aria-label="리드타임">
                      {[
                        ["fast", `바로 ${leadOf("fast")}일`],
                        ["misong", `미송 ${leadOf("misong")}일`],
                      ].map(([k, t]) => (
                        <button key={k} type="button" aria-pressed={x.mode === k} onClick={() => setRow(x.key, { mode: k })} className={"rounded-md px-2.5 py-1 " + (x.mode === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <div className="mb-1 text-xs text-stone-500">하루 판매</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {BASIS.map(([k, t]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={x.basis === k}
                          onClick={() => setRow(x.key, { basis: k })}
                          title={k === "best7" ? "최근 30일 중 가장 잘 팔린 7일 — 광고 켰을 때에 가까워요" : k === "d3" ? "최근 3일 — 광고를 껐을 때에 가까워요" : ""}
                          className={"rounded-full border px-2.5 py-1 text-xs tabular-nums " + (x.basis === k ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400")}
                        >
                          {t} {ONE(x.d[k])}
                          {k === "best7" ? <span className="opacity-70"> · 광고 켬</span> : k === "d3" ? <span className="opacity-70"> · 최근</span> : null}
                        </button>
                      ))}
                      <span className={"flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs " + (x.basis === "manual" ? "border-stone-800" : "border-stone-200")}>
                        직접
                        <NumBox value={x.basis === "manual" ? Number(x.st.manual) || 0 : Number(ONE(x.daily))} label={`${x.o.option} 하루 판매 직접`} w="w-12" step={0.1} max={999} onChange={(v) => setRow(x.key, { basis: "manual", manual: v })} />장
                      </span>
                    </div>
                  </div>

                  <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-stone-50 px-2 py-1.5">
                      <dt className="text-[11px] text-stone-500">재고</dt>
                      <dd className="text-sm font-semibold text-stone-900 tabular-nums">{x.stock.total}</dd>
                      <dd className="text-[10px] text-stone-400">넥스트팩 {x.stock.np} · 렉 {x.stock.rack}</dd>
                    </div>
                    <div className={"rounded-lg px-2 py-1.5 " + (x.backlog ? "bg-amber-50" : "bg-stone-50")}>
                      <dt className="text-[11px] text-stone-500">밀린 주문</dt>
                      <dd className="text-sm font-semibold text-stone-900 tabular-nums">{x.backlog}</dd>
                      <dd className="text-[10px] text-stone-400">카페24 안 나간 주문</dd>
                    </div>
                    <div className={"rounded-lg px-2 py-1.5 " + (ms.left ? "bg-sky-50" : "bg-stone-50")}>
                      <dt className="text-[11px] text-stone-500">남은 미송</dt>
                      <dd className="text-sm font-semibold text-stone-900 tabular-nums">{ms.left}</dd>
                      <dd className="text-[10px] text-stone-400">{first ? `${md(first.since)} 잡음 · ${daysSince(today, first.since)}일째` : ms.loose?.length ? "옵션 다른 미송 있음" : "없음"}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-stone-100 pt-3">
                    <div>
                      <div className="text-xs text-stone-500">넣을 수량</div>
                      <div className="flex items-center gap-1.5">
                        <NumBox value={x.r.qty} label={`${x.o.option} 넣을 수량`} w="w-16" max={9999} onChange={(v) => setRow(x.key, { qty: v })} />
                        <span className="text-sm text-stone-600">장</span>
                        {x.st.qty != null && x.st.qty !== x.r.auto && (
                          <button type="button" onClick={() => setRow(x.key, { qty: null })} className="flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-rose-700" title="계산한 수량으로">
                            <RotateCcw size={11} /> 계산 {x.r.auto}장
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className={x.r.short ? "font-semibold text-rose-700" : "text-stone-700"}>
                        {x.r.short ? "밀린 주문도 못 채워요" : Number.isFinite(x.r.runDays) ? `${mdw(x.out)} 바닥` : "안 팔려서 바닥 없음"}
                      </div>
                      {w?.supply > 0 && x.r.qty > 0 && <div className="text-stone-500 tabular-nums">{won(x.r.qty * w.supply)}</div>}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400 tabular-nums">
                    {x.backlog} + {ONE(x.daily)} × ({x.lead} + {conf.cover}) − {x.stock.total} − {ms.left} = {ONE(x.r.need)} → {x.r.auto}장
                    {Number.isFinite(x.r.runDays) && x.r.qty > 0 ? ` · ${x.r.qty}장이면 ${ONE(x.r.have)}장 ÷ 하루 ${ONE(x.daily)} = ${ONE(x.r.runDays)}일` : ""}
                    {x.daily >= conf.alert && x.again ? ` · 다시 잡을 날 ${mdw(x.again)}` : ""}
                  </p>
                </section>
              );
            })}
          </div>
          {!lines.length && <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-400">이 상품은 최근 판매·재고·밀린 주문이 없어요.</p>}
        </>
      )}
    </div>
  );
}
