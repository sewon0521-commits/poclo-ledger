import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ChevronDown, Loader2, RotateCcw, Search, X } from "lucide-react";
import { loadKey, changeKey, onSettingsChange, watchKeys, FIELD } from "../lib/shoot";
import { flowBoard } from "../lib/pending";
import { won } from "../lib/sales";
import { dayKey } from "../lib/journal";
import { CALC_KEY, DEFAULT_CALC, productList, dailyOf, optionsOf, stockFor, wholesaleOf, misongOf, calcRow, addDays, daysSince, vendorKey } from "../lib/orderCalc";

/**
 * 일 › 발주 계산기 (11/17 밤, lib/orderCalc.js 머리말) — 세원: "미송 + 리드타임 계산기 … 팔리는 거 보고 다시 잡으면 되지"
 * 11/18 세원 "좀 이해가 안 되는데?? 조금 더 간결하게" → 결론 먼저:
 *   맨 위 큰 한 줄('아이보리 19장 · 블랙 0장 → 모두 19장 · 12/1(화)까지 버텨요') · 상품 전체에 질문 하나 '얼마나 팔릴 것 같아요?'
 *   (지금처럼 = 최근 7일 · 광고 켜면 = 가장 잘 팔린 주 · 직접) · 색상마다 한 줄 표(지금 있는 것 · 하루 판매 · 넣을 수량 · 바닥나는 날).
 *   받는 데 걸리는 날(리드타임)·며칠치 쌓아 둘까(버틸 날)·다시 잡을 기준·계산식·14일 막대는 접는 칸 '설정·계산 자세히'.
 *   색마다 있던 바로/미송 고르기는 없앰 — 남은 미송이 있으면 저절로 미송 날수. 발주는 세원이 직접(계산기는 숫자만).
 */

const BASIS = [
  ["d7", "지금처럼", "최근 7일"],
  ["best7", "광고 켜면", "가장 잘 팔린 주"],
  ["manual", "직접", "하루 몇 장"],
];
const ONE = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const wd = (d) => (d ? "일월화수목금토"[new Date(`${d}T00:00:00`).getDay()] : "");
const mdw = (d) => (d ? `${md(d)}(${wd(d)})` : "");
const clean = (s) =>
  String(s || "")
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
    .trim();
/** 받침 따라 이/가 · 은/는 — '아이보리가', '블랙이' (영문·숫자 끝은 이/가 그대로 둠) */
const josa = (w, a, b) => {
  const c = String(w || "").trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return `${w}${a}(${b})`;
  return w + ((c - 0xac00) % 28 ? a : b);
};
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
function NumBox({ value, onChange, w = "w-14", min = 0, max = 999, step = 1, label, big }) {
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
      className={`${w} rounded-md border border-stone-200 bg-white px-1.5 text-center text-stone-900 tabular-nums outline-none focus:border-rose-600 max-sm:text-base ${big ? "py-1.5 text-base font-semibold" : "py-1"}`}
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
  const [rows, setRows] = useState({}); // `${상품}|${옵션}` → {manual, qty}
  const [basisBy, setBasisBy] = useState({}); // 상품번호 → d7 | best7 | manual
  const [more, setMoreState] = useState(() => recall("poclo_calc_more", "") === "1");
  const setMore = (v) => (setMoreState(v), remember("poclo_calc_more", v ? "1" : ""));
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
  const basis = basisBy[curNo] || "d7";
  const lines = opts.map((o) => {
    const key = `${curNo}|${o.option}`;
    const st = rows[key] || {};
    const d = dailyOf(data.sales, curNo, o.option);
    const stock = stockFor(data.stock, prod.name, o.option);
    const backlog = Number(data.backlog?.byNo?.[curNo]?.[o.option]) || 0;
    const ms = misongOf(misLines, w || {}, o.option);
    const daily = basis === "manual" ? (st.manual ?? Number(ONE(d.d7))) : d[basis] || 0;
    // 남은 미송이 있으면 미송 날수(거래처가 미송으로 잡아 둔 상품), 없으면 바로 나오는 날수
    const mode = ms.left > 0 ? "misong" : "fast";
    const lead = leadOf(mode);
    const r = calcRow({ daily, stock: stock.total, backlog, misong: ms.left, lead, cover: conf.cover, qty: st.qty });
    const out = addDays(today, r.runDays);
    const again = Number.isFinite(r.runDays) ? addDays(today, r.runDays - lead) : "";
    const have = stock.total + ms.left - backlog; // 지금 있는 것 (넣기 전)
    return { key, o, st, d, stock, backlog, ms, daily, mode, lead, r, out, again, have };
  });
  const setRow = (key, patch) => setRows((m) => ({ ...m, [key]: { ...(m[key] || {}), ...patch } }));
  const totalQty = lines.reduce((a, x) => a + x.r.qty, 0);
  const totalWon = totalQty * (w?.supply || 0);
  const hot = lines.filter((x) => x.daily >= conf.alert && x.again);
  const sumDaily = (k) => opts.reduce((a, o) => a + (dailyOf(data.sales, curNo, o.option)[k] || 0), 0);
  // 결론 — 가장 먼저 바닥나는 색의 날짜(팔리는 색만)
  const selling = lines.filter((x) => x.daily > 0);
  const first = selling.reduce((a, x) => (!a || x.r.runDays < a.r.runDays ? x : a), null);
  const shortLines = lines.filter((x) => x.r.short);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Calculator size={20} className="text-rose-700" /> 발주 계산기
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">상품을 고르면 색상마다 몇 장 넣으면 되는지 알려 줘요. 발주는 직접 넣어요.</p>
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
        {/* 폰은 한 줄로 밀어 보기 — 결론이 화면 위쪽에 오게 (11/18) */}
        <div className="mt-2 flex gap-1.5 max-sm:-mx-3 max-sm:overflow-x-auto max-sm:px-3 max-sm:pb-1 sm:flex-wrap">
          {(found.length ? found : top).map((x) => (
            <button
              key={x.no}
              type="button"
              onClick={() => (setNo(x.no), setQ(""))}
              className={"max-w-full shrink-0 truncate rounded-full border px-2.5 py-1 text-xs max-sm:max-w-[15rem] " + (x.no === curNo ? "border-rose-700 bg-rose-700 font-semibold text-white" : "border-stone-200 bg-white text-stone-700 hover:border-rose-300")}
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
      ) : !lines.length ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-8 text-center text-sm text-stone-400">이 상품은 최근 판매·재고·밀린 주문이 없어요.</p>
      ) : (
        <>
          {/* 결론 */}
          <section className="rounded-2xl border border-rose-200 bg-white p-4 sm:p-5" aria-label="결론">
            <div className="flex items-start gap-3">
              {prod.image && <img src={prod.image} alt="" className="aspect-[3/4] w-12 shrink-0 rounded-lg bg-stone-100 object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-700">{clean(prod.name)}</div>
                <p className="mt-1 text-base leading-relaxed text-stone-800">
                  {lines.map((x, i) => (
                    <Fragment key={x.key}>
                      {i ? <span className="text-stone-300"> · </span> : null}
                      <span className="whitespace-nowrap">
                        {x.o.option || "기본"} <b className={"font-bold tabular-nums " + (x.r.qty ? "text-rose-700" : "text-stone-400")}>{x.r.qty}장</b>
                      </span>
                    </Fragment>
                  ))}
                </p>
                <p className="mt-1.5 text-2xl font-bold text-stone-900 tabular-nums" data-total>
                  모두 {totalQty}장{w?.supply > 0 && totalQty > 0 ? <span className="ml-1.5 text-base font-semibold text-stone-500"> · 약 {won(totalWon)}원</span> : null}
                </p>
                <p className="mt-1 text-sm text-stone-600" data-until>
                  {shortLines.length
                    ? `${josa(shortLines.map((x) => x.o.option || "기본").join(", "), "은", "는")} 밀린 주문도 못 채워요 — 수량을 늘려 주세요`
                    : first
                      ? `이만큼이면 ${mdw(first.out)}까지 버텨요${selling.length > 1 ? ` (${josa(first.o.option || "기본", "이", "가")} 가장 먼저 떨어져요)` : ""}`
                      : "최근에 안 팔려서 바닥나는 날이 없어요"}
                </p>
              </div>
            </div>
          </section>

          {/* 얼마나 팔릴 것 같아요? */}
          <section className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
            <div className="text-sm font-semibold text-stone-800">얼마나 팔릴 것 같아요?</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="얼마나 팔릴 것 같아요">
              {BASIS.map(([k, t, sub]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={basis === k}
                  onClick={() => setBasisBy((m) => ({ ...m, [curNo]: k }))}
                  className={"rounded-xl border px-2 py-2 text-left " + (basis === k ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400")}
                >
                  <div className="text-sm font-semibold">{t}</div>
                  <div className={"text-[11px] tabular-nums " + (basis === k ? "text-stone-300" : "text-stone-500")}>{k === "manual" ? sub : `${sub} · 하루 ${ONE(sumDaily(k))}장`}</div>
                </button>
              ))}
            </div>
            {basis === "manual" && <p className="mt-2 text-xs text-stone-500">아래 표의 '하루 판매' 칸에 색상마다 하루 몇 장 팔릴지 적어요.</p>}
          </section>

          {hot.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 sm:px-4">
              <b className="font-semibold">다시 잡을 날</b> —{" "}
              {hot.map((x, i) => (
                <span key={x.key}>
                  {i ? " · " : ""}
                  {x.o.option || "기본"} <b className="font-semibold">{mdw(x.again)}</b>에 더 넣기
                </span>
              ))}
              <span className="block text-xs text-amber-800/80">팔리는 거 보고 그날 다시 계산해요 (바닥나는 날 − 받는 데 걸리는 날)</span>
            </section>
          )}

          {/* 색상마다 한 줄 */}
          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[22%]" />
                <col className="w-[17%]" />
                <col className="w-[24%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead className="bg-stone-50 text-[11px] leading-tight text-stone-500">
                <tr>
                  <th className="px-2 py-2 text-left font-medium sm:px-3">색상</th>
                  <th className="px-1 py-2 text-right font-medium">지금 있는 것</th>
                  <th className="px-1 py-2 text-right font-medium">하루 판매</th>
                  <th className="px-1 py-2 text-center font-medium">넣을 수량</th>
                  <th className="px-2 py-2 text-right font-medium sm:px-3">바닥나는 날</th>
                </tr>
              </thead>
              {lines.map((x) => (
                <tbody key={x.key} className="border-t border-stone-100" data-opt={x.o.option}>
                  <tr>
                    <td className="truncate px-2 pt-2.5 font-semibold text-stone-900 sm:px-3">{x.o.option || "기본"}</td>
                    <td className={"px-1 pt-2.5 text-right text-base font-semibold tabular-nums " + (x.have < 0 ? "text-rose-700" : "text-stone-900")} data-have>
                      {x.have}
                    </td>
                    <td className="px-1 pt-2.5 text-right tabular-nums text-stone-700">
                      {basis === "manual" ? (
                        <NumBox value={x.daily} label={`${x.o.option} 하루 판매`} w="w-12" step={0.1} max={999} onChange={(v) => setRow(x.key, { manual: v })} />
                      ) : (
                        `${ONE(x.daily)}장`
                      )}
                    </td>
                    <td className="px-1 pt-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <NumBox value={x.r.qty} label={`${x.o.option} 넣을 수량`} w="w-14" max={9999} big onChange={(v) => setRow(x.key, { qty: v })} />
                      </div>
                    </td>
                    <td className={"px-2 pt-2.5 text-right text-xs leading-tight tabular-nums sm:px-3 " + (x.r.short ? "font-semibold text-rose-700" : "text-stone-700")}>
                      {x.r.short ? "모자라요" : Number.isFinite(x.r.runDays) ? mdw(x.out) : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-2 pt-1 pb-2.5 text-[11px] leading-relaxed text-stone-400 sm:px-3">
                      재고 {x.stock.total} · 받을 미송 {x.ms.left}
                      {x.ms.lines[0] ? `(${md(x.ms.lines[0].since)} 잡음)` : ""} · 밀린 주문 {x.backlog}
                      {w?.supply > 0 && x.r.qty > 0 ? ` · ${won(x.r.qty * w.supply)}원` : ""}
                      {x.st.qty != null && x.st.qty !== x.r.auto && (
                        <button type="button" onClick={() => setRow(x.key, { qty: null })} className="ml-1.5 inline-flex items-center gap-0.5 text-stone-500 underline decoration-dotted hover:text-rose-700" title="계산한 수량으로">
                          <RotateCcw size={10} /> 계산 {x.r.auto}장으로
                        </button>
                      )}
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
            <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400">지금 있는 것 = 재고 + 받을 미송 − 밀린 주문 · 넣을 수량은 고쳐 볼 수 있어요</p>
          </section>

          {/* 설정·계산 자세히 */}
          <section className="rounded-2xl border border-stone-200 bg-white">
            <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-stone-700 sm:px-4">
              설정·계산 자세히
              <ChevronDown size={16} className={"text-stone-400 transition-transform " + (more ? "rotate-180" : "")} />
            </button>
            {more && (
              <div className="space-y-3 border-t border-stone-100 px-3 pt-3 pb-4 text-xs text-stone-600 sm:px-4">
                <div className="text-stone-500">
                  {w?.vendor || "거래처 모름"}
                  {w?.wholesale ? ` · ${w.wholesale}` : ""} · 공급가 {w?.supply ? `${won(w.supply)}원` : "모름"}
                  {w?.from ? ` (${w.from})` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  받는 데 걸리는 날{w?.vendor ? <b className="font-semibold text-stone-700">({w.vendor})</b> : null} — 바로 나오면
                  <NumBox value={leadOf("fast")} label="바로 나오면 받는 데 걸리는 날" w="w-10" max={30} onChange={(v) => saveConf((c) => (vk ? { ...c, lead: { ...(c.lead || {}), [vk]: { ...(c.lead?.[vk] || {}), fast: v } } } : { ...c, fast: v }))} />일 · 미송이면
                  <NumBox value={leadOf("misong")} label="미송이면 받는 데 걸리는 날" w="w-10" max={30} onChange={(v) => saveConf((c) => (vk ? { ...c, lead: { ...(c.lead || {}), [vk]: { ...(c.lead?.[vk] || {}), misong: v } } } : { ...c, misong: v }))} />일
                  {vk && conf.lead?.[vk] && (
                    <button type="button" onClick={() => saveConf((c) => ({ ...c, lead: Object.fromEntries(Object.entries(c.lead || {}).filter(([k]) => k !== vk)) }))} className="text-stone-400 underline decoration-dotted hover:text-rose-700">
                      기본으로({conf.fast}·{conf.misong}일)
                    </button>
                  )}
                  <span className="basis-full text-[11px] text-stone-400">남은 미송이 있는 색은 미송 날수로 계산해요</span>
                </div>
                <label className="flex items-center gap-1.5">
                  며칠치 쌓아 둘까 <NumBox value={conf.cover} label="며칠치 쌓아 둘까" onChange={(v) => saveConf((c) => ({ ...c, cover: v }))} w="w-12" max={60} />일치
                </label>
                <label className="flex items-center gap-1.5">
                  다시 잡을 날 알림 — 하루 <NumBox value={conf.alert} label="다시 잡을 기준" w="w-10" max={99} onChange={(v) => saveConf((c) => ({ ...c, alert: v }))} />장 넘게 팔리는 색만
                </label>
                <ul className="space-y-2.5 border-t border-stone-100 pt-3">
                  {lines.map((x) => (
                    <li key={x.key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <b className="font-semibold text-stone-800">{x.o.option || "기본"}</b>
                        <Bars series={x.d.series} />
                        <span className="text-[11px] text-stone-400">14일</span>
                      </div>
                      <div className="text-[11px] text-stone-500 tabular-nums">
                        하루 판매 — 최근 7일 {ONE(x.d.d7)} · 14일 {ONE(x.d.d14)} · 가장 잘 팔린 주 {ONE(x.d.best7)} · 최근 3일 {ONE(x.d.d3)}
                      </div>
                      <div className="text-[11px] leading-relaxed text-stone-500 tabular-nums">
                        밀린 주문 {x.backlog} + 하루 {ONE(x.daily)} × (받는 데 {x.lead}일{x.mode === "misong" ? "·미송" : ""} + {conf.cover}일치) − 재고 {x.stock.total} − 받을 미송 {x.ms.left} = {ONE(x.r.need)} → {x.r.auto}장
                        {Number.isFinite(x.r.runDays) && x.r.qty > 0 ? ` · ${x.r.qty}장이면 ${ONE(x.r.have)}장 ÷ 하루 ${ONE(x.daily)} = ${ONE(x.r.runDays)}일` : ""}
                        {x.ms.lines[0] ? ` · 미송 ${md(x.ms.lines[0].since)} 잡음(${daysSince(today, x.ms.lines[0].since)}일째)` : x.ms.loose?.length ? " · 옵션 다른 미송 있음" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] leading-relaxed text-stone-400">
                  판매 {since(data.sales?.updated) || "—"} 기준(새벽마다) · 재고 {since(data.stock?.nextpack?.at) || "—"} · 밀린 주문 {since(data.backlog?.at) || "—"}(30분마다)
                  <br />
                  재고 = 넥스트팩 실재고 + 사무실 렉 · 미송·밀린 주문을 따로 빼서 가용 재고는 안 써요
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
