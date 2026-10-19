import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ChevronDown, Settings2, Flame, Sparkles, Tag, Plus, RotateCcw } from "lucide-react";
import { loadKey, changeKey, onSettingsChange } from "../lib/shoot";
import { won } from "../lib/sales";
import { dayTitle } from "../lib/journal";
import { baseDay, compareSnaps, catBoard, topBand, daysBetween, detailWords, BANDS } from "../lib/tracker";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 보고 › 사입 트래커 (2026-10-19, 위키 topics/보고-체계-설계.md).
 * 사무실 PC poclo-cafe24/tracker.py 가 매일 아침(아침 보고 전) 경쟁몰 베스트 상위 30개를 읽어 settings 'tracker_<날짜>' 에 둔다.
 * 10/19 저녁 세원(쇼만마 트래커 화면): "한눈에 보이게 — 남성·아동은 안 봐도 되고, 제일 중요한 건 1일 변화·7일 변화.
 * 하루 만에 뜬 상품을 보고 무엇을 가져올지 판단." → 두 날 기록을 화면에서 비교(lib/tracker.js), 품목·가격대로 묶는다.
 * 몰 목록은 settings 'tracker_malls' — 여기 '경쟁몰 관리'에서 빼고 더한다(세원: "하나씩 빼고 더하면서 우리 스타일로").
 */

const STYLES = ["러블리·데일리", "캐주얼·데일리", "로맨틱·페미닌", "미니멀·오피스", "유니크"];
const SPAN_KEY = "poclo_trk_span";
const readSpan = () => {
  try {
    return localStorage.getItem(SPAN_KEY) === "7" ? 7 : 1;
  } catch {
    return 1;
  }
};

function badgeOf(it) {
  if (it.gone) return ["이탈", "bg-stone-700 text-white"];
  if (it.was === null) return ["NEW", "bg-rose-700 text-white"];
  if (it.was == null) return null;
  if (it.was > it.rank) return [`▲${it.was - it.rank}`, "bg-emerald-600 text-white"];
  if (it.was < it.rank) return [`▼${it.rank - it.was}`, "bg-stone-500 text-white"];
  return null;
}

const Img = ({ src, className = "" }) => (src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={"h-full w-full object-cover " + className} /> : null);

function Item({ it, baseLabel }) {
  const b = badgeOf(it);
  return (
    <a href={it.url} target="_blank" rel="noreferrer" className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[3/4] bg-stone-100">
        <Img src={it.img} />
        <span className="absolute top-1.5 left-1.5 flex gap-1">
          {b && <span className={"rounded px-1.5 py-0.5 text-[11px] font-bold shadow-sm " + b[1]}>{b[0]}</span>}
          {it.made && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">MADE</span>}
        </span>
        {it.streak >= 3 && !it.gone && <span className="absolute top-1.5 right-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm">{it.streak}일 연속</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <div className="text-[11px] font-semibold text-rose-700">{it.cat}</div>
        <div className="line-clamp-2 min-h-[2.5em] text-[13px] leading-snug font-medium text-stone-900">{it.name || "이름 없음"}</div>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="text-sm font-bold text-stone-900 tabular-nums">{it.price > 0 ? `${won(it.price)}원` : "—"}</span>
          <span className="min-w-0 truncate text-right text-[11px] text-stone-400">
            {it.mall} {it.gone ? `${baseLabel} ${it.was}위` : `${it.rank}위`}
            {!it.gone && it.was > 0 && it.was !== it.rank && ` (${baseLabel} ${it.was}위)`}
          </span>
        </div>
      </div>
    </a>
  );
}

function Section({ title, sub, list, baseLabel, limit = 15, open: startOpen = true }) {
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(startOpen);
  if (!list.length) return null;
  const shown = more ? list : list.slice(0, limit);
  return (
    <section className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5 text-left">
        <span className="text-sm font-bold text-stone-900">
          {title} <span className="font-normal text-stone-400">{list.length}</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] text-stone-400">
          {sub} <ChevronDown size={13} className={open ? "rotate-180" : ""} />
        </span>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {shown.map((it) => (
              <Item key={it.host + it.id + (it.gone ? "g" : "")} it={it} baseLabel={baseLabel} />
            ))}
          </div>
          {list.length > shown.length && (
            <button type="button" onClick={() => setMore(true)} className="w-full rounded-lg border border-stone-200 py-2 text-xs text-stone-600 hover:border-rose-300">
              {list.length - shown.length}개 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** 위 숫자 칸 셋 */
function Stat({ icon: Icon, label, value, unit, sub, accent }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-1 text-xs text-stone-500">
        <Icon size={13} className="text-stone-400" /> {label}
      </div>
      <div className={"mt-1 text-2xl font-bold tracking-tight tabular-nums " + (accent ? "text-rose-700" : "text-stone-900")}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-stone-500">{unit}</span>}
      </div>
      <div className="mt-0.5 text-xs text-stone-500">{sub}</div>
    </div>
  );
}

/** 품목을 펼치면 — 그 품목 안에서 많이 보이는 디테일 키워드(핏·소재·넥라인…) + 상품. 키워드를 누르면 그 상품만 */
function CatDetail({ c, baseLabel }) {
  const [kw, setKw] = useState("");
  const words = useMemo(() => detailWords(c.items), [c.items]);
  const hit = words.find((w) => w.word === kw);
  const list = hit ? c.items.filter((x) => hit.re.test(x.name || "")) : c.items;
  const max = Math.max(1, ...words.map((w) => w.malls));
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-2.5">
      {words.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-stone-500">{c.cat} 안에서 많이 보이는 디테일 (몰 수 기준) — 누르면 그 상품만</div>
          <div className="grid gap-1 sm:grid-cols-2">
            {words.map((w) => (
              <button key={w.word} type="button" onClick={() => setKw(kw === w.word ? "" : w.word)} className={"flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs " + (kw === w.word ? "bg-rose-700 text-white" : "bg-white text-stone-700 hover:bg-rose-50")}>
                <span className="w-24 shrink-0 truncate font-semibold">{w.word}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-stone-200">
                  <span className={"block h-full rounded-full " + (kw === w.word ? "bg-white" : "bg-rose-500")} style={{ width: `${(w.malls / max) * 100}%` }} />
                </span>
                <span className={"shrink-0 tabular-nums " + (kw === w.word ? "text-white/80" : "text-stone-400")}>
                  {w.malls}개 몰 · {w.count}개
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.slice(0, 24).map((x) => (
          <Item key={x.host + x.id} it={x} baseLabel={baseLabel} />
        ))}
      </div>
      {list.length > 24 && <p className="text-center text-[11px] text-stone-400">그 밖에 {list.length - 24}개 — 아래 '전체 상품'에서 품목으로 걸러 보세요</p>}
    </div>
  );
}

/** 다몰 동시 인기 품목 — 여러 몰 베스트에 동시에 오른 품목 순(사입 우선순위) */
function CatBoard({ board, malls, baseLabel }) {
  const [open, setOpen] = useState("");
  const [all, setAll] = useState(false);
  const shown = all ? board : board.slice(0, 8);
  const max = Math.max(1, malls);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-stone-100 px-4 pt-3.5 pb-2.5">
        <h3 className="flex items-center gap-1 text-sm font-bold text-stone-900">
          <Flame size={14} className="text-rose-600" /> 여러 몰 동시 인기 품목
        </h3>
        <span className="text-[11px] text-stone-400">여러 몰 베스트에 같이 오른 품목 순 — 사입 우선순위</span>
      </div>
      <ul className="divide-y divide-dashed divide-stone-200 px-4">
        {shown.map((c, i) => {
          const isOpen = open === c.cat;
          const fresh = c.items.filter((x) => x.was === null).length;
          return (
            <li key={c.cat} className="py-2">
              <button type="button" onClick={() => setOpen(isOpen ? "" : c.cat)} className="flex w-full items-center gap-3 text-left">
                <span className="w-4 shrink-0 text-xs text-stone-400 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5 text-sm font-semibold text-stone-900">
                    {c.cat}
                    {fresh > 0 && <span className="text-[10px] font-bold text-rose-700">NEW {fresh}</span>}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <span className="block h-full rounded-full bg-rose-600" style={{ width: `${(c.mallCount / max) * 100}%` }} />
                  </span>
                </span>
                <span className="hidden shrink-0 gap-1 sm:flex">
                  {c.items.slice(0, 5).map((x) => (
                    <span key={x.host + x.id} className="h-10 w-8 overflow-hidden rounded bg-stone-100">
                      <Img src={x.img} />
                    </span>
                  ))}
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-stone-500 tabular-nums">{c.mallCount}개 몰</span>
                <ChevronDown size={14} className={"shrink-0 text-stone-400 transition " + (isOpen ? "rotate-180" : "")} />
              </button>
              {isOpen && <CatDetail c={c} baseLabel={baseLabel} />}
            </li>
          );
        })}
      </ul>
      {board.length > 8 && (
        <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-stone-100 py-2 text-xs text-stone-500 hover:text-rose-700">
          {all ? "접기" : `품목 ${board.length - 8}개 더 보기`}
        </button>
      )}
    </section>
  );
}

/** 급상승 · 신규 진입 Top — 새로 들어온 것(순위 높은 것부터) 다음 크게 오른 것 */
function RiseList({ list, span, first }) {
  const [n, setN] = useState(10);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-stone-100 px-4 pt-3.5 pb-2.5">
        <h3 className="flex items-center gap-1 text-sm font-bold text-stone-900">
          <Sparkles size={14} className="text-rose-600" /> {first ? "몰별 1위" : `급상승 · ${span}일 신규 진입 Top`}
        </h3>
        <span className="text-[11px] text-stone-400">{first ? "비교할 기록이 쌓이면 새로 들어온 상품이 여기에 떠요" : "새로 들어왔는데 순위가 높은 것부터 · 그다음 크게 오른 것"}</span>
      </div>
      {!list.length && <p className="px-4 py-8 text-center text-xs text-stone-400">새로 들어온 상품이 없어요.</p>}
      <ul className="divide-y divide-dashed divide-stone-200 px-4">
        {list.slice(0, n).map((x, i) => {
          const b = badgeOf(x);
          return (
            <li key={x.host + x.id}>
              <a href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2 hover:bg-stone-50/70">
                <span className="w-4 shrink-0 text-xs text-stone-400 tabular-nums">{i + 1}</span>
                <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-stone-100">
                  <Img src={x.img} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-900">{x.name}</span>
                  <span className="block truncate text-[11px] text-stone-500">
                    {x.mall} {x.rank}위 · {x.style} · {x.cat}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {b && <span className={"mb-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold " + b[1]}>{b[0]}</span>}
                  {x.price > 0 && <span className="block text-xs text-stone-600 tabular-nums">{won(x.price)}원</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {list.length > n && (
        <button type="button" onClick={() => setN(n + 15)} className="w-full border-t border-stone-100 py-2 text-xs text-stone-500 hover:text-rose-700">
          {list.length - n}개 더 보기
        </button>
      )}
    </section>
  );
}

/**
 * 전체 상품 — 정렬·거르기로 사입 후보 좁히기 (10/19 세원 쇼만마 화면).
 * 사입 신호순 = 쇼만마와 같은 기준: ① 새로 들어온 것(NEW) 먼저 ② 그 품목이 베스트에 든 몰 수가 많은 것 ③ 몰 안 순위 높은 것.
 * 여러 몰 인기 품목 = 2개 몰 이상 베스트에 든 품목. 우리만 더한 것: '사입 상품만'(MADE·자체제작 빼기 — 동대문에서 못 가져온다), '많이 오른 순'.
 */
const SORTS = [
  ["signal", "사입 신호순 (NEW · 여러 몰 품목)"],
  ["rank", "몰 안 순위 높은 순"],
  ["rise", "많이 오른 순"],
  ["newfirst", "NEW 먼저"],
  ["pricedesc", "가격 높은 순"],
  ["priceasc", "가격 낮은 순"],
];
const VIEWS = [
  ["flat", "전체"],
  ["bycat", "품목별 묶기"],
  ["bymall", "몰별 묶기"],
];
const SEL = "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800";
const CHK = "flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold select-none ";

function AllProducts({ items, board, span, first, baseLabel, onlyNew, setOnlyNew, boxRef }) {
  const [sort, setSort] = useState("signal");
  const [view, setView] = useState("flat");
  const [cat, setCat] = useState("");
  const [band, setBand] = useState("");
  const [multi, setMulti] = useState(false);
  const [noMade, setNoMade] = useState(false);
  const [q, setQ] = useState("");
  const [n, setN] = useState(40);
  const reset = (fn) => (v) => {
    fn(v);
    setN(40);
  };
  const catMalls = useMemo(() => Object.fromEntries(board.map((c) => [c.cat, c.mallCount])), [board]);
  const isNew = (x) => (x.was === null ? 1 : 0);
  const jump = (x) => (x.was > 0 ? x.was - x.rank : x.was === null ? 31 - x.rank : -99);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const bandRow = BANDS.find((b) => b[0] === band);
  const list = items
    .filter((x) => !cat || x.cat === cat)
    .filter((x) => !bandRow || (x.price >= bandRow[1] && x.price <= bandRow[2]))
    .filter((x) => !onlyNew || x.was === null)
    .filter((x) => !multi || (catMalls[x.cat] || 0) >= 2)
    .filter((x) => !noMade || !x.made)
    .filter((x) => !words.length || words.every((w) => `${x.name} ${x.mall}`.toLowerCase().includes(w)))
    .sort(
      {
        signal: (a, b) => isNew(b) - isNew(a) || (catMalls[b.cat] || 0) - (catMalls[a.cat] || 0) || a.rank - b.rank,
        rank: (a, b) => a.rank - b.rank || a.mall.localeCompare(b.mall),
        rise: (a, b) => jump(b) - jump(a) || a.rank - b.rank,
        newfirst: (a, b) => isNew(b) - isNew(a) || a.rank - b.rank,
        pricedesc: (a, b) => b.price - a.price,
        priceasc: (a, b) => (a.price || 9e9) - (b.price || 9e9),
      }[sort],
    );
  const keyOf = (x) => (view === "bycat" ? x.cat : x.mall);
  const groups =
    view === "flat"
      ? null
      : [...list.reduce((m, x) => m.set(keyOf(x), [...(m.get(keyOf(x)) || []), x]), new Map())].sort((a, b) => b[1].length - a[1].length);
  const cats = board.map((c) => c.cat);

  return (
    <section ref={boxRef} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-bold text-stone-900">전체 상품</h3>
        <span className="text-xs text-stone-400">정렬·거르기로 사입 후보를 좁혀 보세요</span>
      </div>
      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            정렬
            <select value={sort} onChange={(e) => reset(setSort)(e.target.value)} className={SEL}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            보기
            <select value={view} onChange={(e) => reset(setView)(e.target.value)} className={SEL}>
              {VIEWS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            품목
            <select value={cat} onChange={(e) => reset(setCat)(e.target.value)} className={SEL}>
              <option value="">전체</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            가격대
            <select value={band} onChange={(e) => reset(setBand)(e.target.value)} className={SEL}>
              <option value="">전체</option>
              {BANDS.map(([b]) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={CHK + (onlyNew ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200") + (first ? " pointer-events-none opacity-40" : "")}>
            <input type="checkbox" checked={onlyNew} disabled={first} onChange={(e) => reset(setOnlyNew)(e.target.checked)} className="accent-white" />
            {span === 1 ? "오늘 NEW만" : "7일 NEW만"}
          </label>
          <label className={CHK + (multi ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}>
            <input type="checkbox" checked={multi} onChange={(e) => reset(setMulti)(e.target.checked)} className="accent-white" />
            여러 몰 인기 품목만
          </label>
          <label className={CHK + (noMade ? "bg-rose-700 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")} title="상품명에 MADE·자체제작이 든 것은 그 몰이 직접 만든 거라 사입할 수 없어요">
            <input type="checkbox" checked={noMade} onChange={(e) => reset(setNoMade)(e.target.checked)} className="accent-white" />
            사입 상품만 (MADE 빼기)
          </label>
          <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="상품명·몰 찾기" className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-rose-600 sm:max-w-[16rem]" />
          <span className="ml-auto text-xs text-stone-400 tabular-nums">{list.length}개</span>
        </div>
        {first && <p className="text-[11px] text-amber-700">첫 기록이라 NEW 는 비교할 날이 생기는 내일부터 골라져요.</p>}
      </div>

      {!list.length && <p className="rounded-xl border border-dashed border-stone-300 bg-white py-10 text-center text-sm text-stone-400">조건에 맞는 상품이 없어요.</p>}
      {!groups && list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {list.slice(0, n).map((it) => (
              <Item key={it.host + it.id} it={it} baseLabel={baseLabel} />
            ))}
          </div>
          {list.length > n && (
            <button type="button" onClick={() => setN(n + 40)} className="w-full rounded-lg border border-stone-200 bg-white py-2 text-xs text-stone-600 hover:border-rose-300">
              {list.length - n}개 더 보기
            </button>
          )}
        </>
      )}
      {groups?.map(([g, arr]) => (
        <Group key={g} title={g} arr={arr} sub={view === "bycat" ? `${arr.length}개 · ${new Set(arr.map((x) => x.host)).size}개 몰` : `${arr.length}개 · ${arr[0]?.style || ""}`} baseLabel={baseLabel} />
      ))}
    </section>
  );
}

function Group({ title, arr, sub, baseLabel }) {
  const [all, setAll] = useState(false);
  const shown = all ? arr : arr.slice(0, 10);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5">
        <span className="text-sm font-bold text-stone-900">{title}</span>
        <span className="text-[11px] text-stone-400">{sub}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
        {shown.map((it) => (
          <Item key={it.host + it.id} it={it} baseLabel={baseLabel} />
        ))}
      </div>
      {arr.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="w-full rounded-lg border border-stone-200 bg-white py-1.5 text-xs text-stone-600 hover:border-rose-300">
          {arr.length - shown.length}개 더 보기
        </button>
      )}
    </div>
  );
}

/** 사입 전 3분 루틴 — 접는 가이드 (10/19 세원: "쇼만마 사입 대시보드 가이드를 토글로"). 쇼만마 가이드의 순서를 우리 화면·우리 기준으로 다시 씀 */
function Step({ n, title, children }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-700 text-[11px] font-bold text-white">{n}</span>
      <span>
        <b className="text-stone-900">{title}</b>
        <span className="block text-stone-600">{children}</span>
      </span>
    </li>
  );
}
const GUIDE_KEY = "poclo_trk_guide";
function Guide() {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setOpen = (v) => {
    setOpenState(v);
    try {
      localStorage.setItem(GUIDE_KEY, v ? "1" : "0");
    } catch {
      /* 무시 */
    }
  };
  return (
    <section className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 to-white">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-baseline gap-2">
          <b className="text-sm text-stone-900">사입 전 3분 루틴</b>
          <span className="text-[11px] text-stone-500">이 화면 보는 법 · 매일 아침 사입 정하기 전에</span>
        </span>
        <ChevronDown size={15} className={"shrink-0 text-stone-400 transition " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-rose-100 px-4 py-4 text-[13px] leading-relaxed lg:grid-cols-3">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-rose-800">이건 상품 목록이 아니라 '신호'예요</div>
            <p className="text-stone-600">
              경쟁몰 베스트 상위 30개를 매일 아침 8시 30분에 모아서, <b>어제(또는 7일 전)와 비교해 새로 들어오거나 오른 상품만</b> 골라 보여 줘요.
            </p>
            <p className="text-stone-600">
              <b>순위는 과거</b> — 이미 많이 팔린 결과라 다들 알아요. <b>변화는 오늘</b> — 막 팔리기 시작한 흐름이라, 하루라도 먼저 잡으면 재고 회전과 마진에서 앞서요.
            </p>
          </div>
          <ol className="space-y-2">
            <Step n="1" title="'1일 변화' → 위 'NEW 진입' 칸 누르기">오늘 새로 들어온 상품이 순위 높은 것부터 떠요.</Step>
            <Step n="2" title="'사입 상품만(MADE 빼기)' 켜기">몰이 직접 만든 상품은 동대문에서 못 가져와요.</Step>
            <Step n="3" title="여러 몰 동시 인기 품목 펼치기">품목을 누르면 크롭·셔링·레이스 같은 디테일 키워드가 몰 수 순으로 나와요. 여러 몰에서 같이 뜨면 우연이 아니에요.</Step>
            <Step n="4" title="오늘 사입 목록에 옮기기">신마에서 비슷한 상품을 찾아 신상 관리에 담아요. 이틀·사흘 이어지는 신호는 '7일 변화'로 한 번 더 봐요.</Step>
          </ol>
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-rose-800">우리 기준으로 거르기</div>
            <ul className="space-y-1 text-stone-600">
              <li>· 2030 데일리, 150~160cm 스트레이트 체형에 맞는지 먼저</li>
              <li>· 한 몰에서만 뜬 건 그 몰 광고 덕일 수 있어요 → <b>2곳 이상 · 2일 이상</b>이면 신호</li>
              <li>· 3일 넘게 10위 안에 버티는 상품은 검증된 스테디 → 색·기장 바꿔 가져오기</li>
              <li>· '가장 많은 가격대'와 우리 판매가 구간을 맞춰 보기</li>
            </ul>
            <p className="pt-1 text-[11px] text-stone-400">NEW = 비교한 날 베스트에 없던 상품(새로 넣은 몰은 빼고) · ▲ = 순위 오름 · MADE = 자체제작 · 사입 신호순 = NEW → 여러 몰 품목 → 순위</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** 경쟁몰 관리 — settings 'tracker_malls' {items:[{name, host, style, best?, off?, addedOn?, offOn?}]} */
function MallSheet({ online, conf, snap, onClose }) {
  const [list, setList] = useState(conf);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (fn, done) => {
    setBusy(true);
    try {
      const next = await changeKey("tracker_malls", online, (v) => ({ ...v, items: fn(v.items || []) }), { items: [] });
      setList(next.items || []);
      if (done) setMsg(done);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
    setBusy(false);
  };
  const patch = (host, p, done) => save((items) => items.map((m) => (m.host === host ? { ...m, ...p } : m)), done);
  const today = new Date().toISOString().slice(0, 10);

  const add = () => {
    let u;
    try {
      u = new URL(/^https?:\/\//.test(url.trim()) ? url.trim() : "https://" + url.trim());
    } catch {
      setMsg("주소를 다시 확인해 주세요 (예: https://yuini.co.kr/product/list.html?cate_no=101).");
      return;
    }
    const host = u.host;
    const best = u.pathname === "/" && !u.search ? "" : u.href;
    const nm = name.trim() || host.replace(/^www\./, "").split(".")[0];
    const was = list.find((m) => m.host === host);
    if (was && !was.off) {
      setMsg(`${was.name} 은(는) 이미 있어요.`);
      return;
    }
    save(
      (items) =>
        items.some((m) => m.host === host)
          ? items.map((m) => (m.host === host ? { ...m, name: nm, style, off: false, offOn: undefined, ...(best ? { best } : {}) } : m))
          : [...items, { name: nm, host, style, ...(best ? { best } : {}), addedOn: today }],
      `${nm} 을(를) 넣었어요 — 내일 아침 8시 30분부터 모아요.`,
    );
    setName("");
    setUrl("");
  };

  const on = list.filter((m) => !m.off);
  const off = list.filter((m) => m.off);
  const statusOf = (h) => {
    const m = snap?.malls?.[h];
    if (!m) return ["아직 안 모음", "text-stone-400"];
    if (m.error) return ["못 읽음", "text-amber-700"];
    return [`${m.items.length}개`, "text-stone-500"];
  };

  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={`경쟁몰 관리 · ${on.length}곳`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-2 rounded-xl bg-rose-50/60 p-3 ring-1 ring-rose-100">
          <div className="text-xs font-semibold text-rose-800">몰 더하기</div>
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_9rem_auto]">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 유이니)" className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-rose-600" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()} placeholder="베스트 페이지 주소 (첫 화면 주소면 BEST 메뉴를 찾아요)" className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-rose-600" />
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" disabled={busy || !url.trim()} onClick={add} className="flex items-center justify-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              <Plus size={14} /> 넣기
            </button>
          </div>
          {msg && <p className="text-xs text-stone-600">{msg}</p>}
        </div>

        {STYLES.map((s) => {
          const ms = on.filter((m) => m.style === s);
          if (!ms.length) return null;
          return (
            <div key={s}>
              <div className="mb-1 text-[11px] font-semibold text-stone-500">
                {s} · {ms.length}곳
              </div>
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {ms.map((m) => {
                  const [st, tone] = statusOf(m.host);
                  return (
                    <li key={m.host} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-stone-900">{m.name}</span> <span className={"text-[11px] " + tone}>{st}</span>
                        <a href={m.best || `https://${m.host}/`} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-stone-400 hover:text-rose-700">
                          {(m.best || m.host).replace(/^https?:\/\//, "")}
                        </a>
                      </span>
                      <select value={m.style} disabled={busy} onChange={(e) => patch(m.host, { style: e.target.value })} className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-xs text-stone-600">
                        {STYLES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <button type="button" disabled={busy} onClick={() => patch(m.host, { off: true, offOn: today }, `${m.name} 을(를) 뺐어요 — 아래 '뺀 몰'에서 되살릴 수 있어요.`)} className="rounded-md px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-rose-700">
                        빼기
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {off.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-semibold text-stone-400">뺀 몰 · {off.length}곳</div>
            <ul className="divide-y divide-stone-100 rounded-xl border border-dashed border-stone-200">
              {off.map((m) => (
                <li key={m.host} className="flex items-center gap-2 px-3 py-2 text-sm text-stone-400">
                  <span className="min-w-0 flex-1 truncate">
                    {m.name} <span className="text-[11px]">{m.style}{m.offOn ? ` · ${m.offOn.slice(5).replace("-", "/")} 뺌` : ""}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => patch(m.host, { off: false, offOn: undefined }, `${m.name} 을(를) 되살렸어요.`)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-stone-600 hover:bg-stone-100">
                    <RotateCcw size={12} /> 되살리기
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-stone-400">
          바꾼 것은 다음 날 아침 8시 30분 수집부터 들어가요. 스타일은 화면에 바로 반영돼요. 못 읽는 몰은 그 몰의 베스트 페이지 주소로 다시 넣으면 대부분 읽혀요.
        </p>
      </div>
    </Sheet>
  );
}

export default function TrackerPage({ online }) {
  const [days, setDays] = useState([]);
  const [day, setDay] = useState("");
  const [span, setSpanState] = useState(readSpan);
  const [snap, setSnap] = useState(null);
  const [baseSnap, setBaseSnap] = useState(null);
  const [state, setState] = useState("loading");
  const [style, setStyle] = useState("");
  const [mall, setMall] = useState("");
  const [conf, setConf] = useState([]);
  const [manage, setManage] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const allRef = useRef(null);

  const setSpan = (n) => {
    setSpanState(n);
    try {
      localStorage.setItem(SPAN_KEY, String(n));
    } catch {
      /* 무시 */
    }
  };

  const loadDays = useCallback(async () => {
    try {
      const items = (await loadKey("tracker_days", online, { items: [] })).items || [];
      setDays(items);
      setDay((d) => d || items[0] || "");
      if (!items.length) setState("empty");
    } catch {
      setState("error");
    }
  }, [online]);
  const loadConf = useCallback(async () => {
    try {
      setConf((await loadKey("tracker_malls", online, { items: [] })).items || []);
    } catch {
      /* 몰 목록이 없어도 기록은 보인다 */
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadDays();
    loadConf();
    return onSettingsChange((k) => (k === "tracker_days" ? loadDays() : k === "tracker_malls" ? loadConf() : null));
  }, [loadDays, loadConf]);

  const { base, exact } = useMemo(() => baseDay(days, day, span), [days, day, span]);

  useEffect(() => {
    if (!day) return;
    let alive = true;
    loadKey(`tracker_${day}`, online, null)
      .then((s) => {
        if (!alive) return;
        setSnap(s);
        setState(s ? "ready" : "empty");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [day, online]);
  useEffect(() => {
    let alive = true;
    if (!base) {
      // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
      setBaseSnap(null);
      return;
    }
    loadKey(`tracker_${base}`, online, null)
      .then((s) => alive && setBaseSnap(s))
      .catch(() => alive && setBaseSnap(null));
    return () => {
      alive = false;
    };
  }, [base, online]);

  const confMap = useMemo(() => Object.fromEntries(conf.map((m) => [m.host, m])), [conf]);
  const cmp = useMemo(() => compareSnaps(snap, base ? baseSnap : null, confMap), [snap, baseSnap, base, confMap]);
  const pick = (x) => (!style || x.style === style) && (!mall || x.host === mall);
  const live = cmp.items.filter(pick);
  const gone = cmp.gone.filter(pick).sort((a, b) => a.was - b.was);
  const first = !base || !baseSnap;
  const isNew = live.filter((x) => x.was === null).sort((a, b) => a.rank - b.rank);
  const up = live.filter((x) => x.was > x.rank).sort((a, b) => b.was - b.rank - (a.was - a.rank) || a.rank - b.rank);
  const down = live.filter((x) => x.was > 0 && x.was < x.rank).sort((a, b) => b.rank - b.was - (a.rank - a.was));
  const steady = live.filter((x) => x.streak >= 3 && x.rank <= 10).sort((a, b) => b.streak - a.streak || a.rank - b.rank);
  const rise = first ? live.filter((x) => x.rank === 1) : [...isNew, ...up.filter((x) => x.was - x.rank >= 5)];
  const board = useMemo(() => catBoard(live), [live]);
  const band = topBand(live);
  const mallsIn = new Set(live.map((x) => x.host)).size;
  const hot = board[0];

  const allMalls = Object.entries(snap?.malls || {})
    .map(([host, m]) => ({ host, ...m, style: confMap[host]?.style || m.style, name: confMap[host]?.name || m.name }))
    .filter((m) => !confMap[m.host]?.off);
  const failed = allMalls.filter((m) => m.error);
  const styleCount = (s) => allMalls.filter((m) => m.style === s && !m.error).length;
  const gap = base ? daysBetween(base, day) : 0;
  const baseLabel = gap === 1 ? "어제" : `${gap}일 전`;
  const pickDay = (d) => {
    if (!d || !days.length) return;
    const hit = [...days].sort().reverse().find((x) => x <= d) || [...days].sort()[0];
    setDay(hit);
  };
  const sorted = [...days].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">사입 트래커</h2>
          <p className="mt-0.5 text-sm text-stone-500">경쟁몰 베스트를 매일 아침 모아요. 하루·7일 사이에 새로 뜬 상품을 보고 무엇을 가져올지 정해요.</p>
        </div>
        <button type="button" onClick={() => setManage(true)} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 hover:border-rose-300">
          <Settings2 size={14} /> 경쟁몰 {conf.filter((m) => !m.off).length || allMalls.length}곳 관리
        </button>
      </div>

      <Guide />

      {state === "loading" && <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>}
      {state === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">트래커를 불러오지 못했어요.</p>}
      {state === "empty" && <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">아직 모은 기록이 없어요. 사무실 PC 가 매일 아침 모아요{online ? "." : " (공유 장부로 로그인해야 보여요)."}</div>}

      {state === "ready" && snap && (
        <>
          {/* 고르기 줄 — 스타일 · 1일/7일 · 날짜 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-0.5 overflow-x-auto rounded-full bg-stone-100 p-0.5 [scrollbar-width:none]">
                {["", ...STYLES].map((s) => (
                  <button key={s || "all"} type="button" onClick={() => { setStyle(s); setMall(""); }} className={"shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold " + (style === s ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
                    {s || "전체"} <span className="font-normal opacity-60">{s ? styleCount(s) : allMalls.filter((m) => !m.error).length}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full bg-stone-100 p-0.5">
                {[1, 7].map((n) => (
                  <button key={n} type="button" onClick={() => setSpan(n)} className={"rounded-full px-4 py-1.5 text-sm font-bold " + (span === n ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800")}>
                    {n}일 변화
                  </button>
                ))}
              </div>
              <input type="date" value={day} min={sorted[0]} max={sorted[sorted.length - 1]} onChange={(e) => pickDay(e.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800" />
              <button type="button" disabled={day === sorted[sorted.length - 1]} onClick={() => setDay(sorted[sorted.length - 1])} className="rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-bold text-white disabled:opacity-30">
                오늘
              </button>
              <select value={mall} onChange={(e) => setMall(e.target.value)} className="rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-600">
                <option value="">전체 몰</option>
                {allMalls
                  .filter((m) => !style || m.style === style)
                  .map((m) => (
                    <option key={m.host} value={m.host}>
                      {m.name}
                      {m.error ? " (못 읽음)" : ""}
                    </option>
                  ))}
              </select>
              <span className="text-xs text-stone-500">
                {first ? (
                  <span className="text-amber-700">{day === sorted[0] ? "첫 기록이에요 — 비교할 날이 생기는 내일부터 변화가 보여요" : "비교할 기록이 없어요"}</span>
                ) : (
                  <>
                    기준 {dayTitle(base)} 대비{!exact && span === 7 && <span className="text-amber-700"> · 7일 전 기록이 아직 없어서 가장 오래된 날과 비교</span>}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* 숫자 칸 셋 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat icon={Flame} label="가장 뜨거운 품목" value={hot?.cat || "—"} accent sub={hot ? `${hot.mallCount}개 몰 베스트에 같이 들어감 (${mallsIn}곳 중)` : ""} />
            <button
              type="button"
              disabled={first}
              onClick={() => {
                setOnlyNew(true);
                allRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-left disabled:cursor-default enabled:hover:[&>div]:border-rose-300"
            >
              <Stat icon={Sparkles} label={`${span}일 NEW 진입`} value={first ? "—" : isNew.length} unit={first ? "" : "건"} sub={first ? "비교할 기록이 쌓이면 보여요" : `${baseLabel} 베스트에 없던 상품 · 눌러서 보기`} />
            </button>
            <Stat icon={Tag} label="가장 많은 가격대" value={band?.band || "—"} sub={band ? `베스트의 ${Math.round(band.share * 100)}%가 이 가격` : ""} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CatBoard board={board} malls={mallsIn} baseLabel={baseLabel} />
            <RiseList list={rise} span={span} first={first} />
          </div>

          <AllProducts items={live} board={board} span={span} first={first} baseLabel={baseLabel} onlyNew={onlyNew && !first} setOnlyNew={setOnlyNew} boxRef={allRef} />

          <Section title="오래 버티는 상품" sub="3일 넘게 10위 안" list={steady} baseLabel={baseLabel} open={false} />
          {!first && <Section title="▼ 순위가 내린 상품" sub={`${baseLabel}보다 아래로`} list={down} baseLabel={baseLabel} open={false} />}
          {!first && <Section title="이탈 — 베스트에서 빠진 상품" sub={`${baseLabel} 있었는데 지금 없음`} list={gone} baseLabel={baseLabel} open={false} />}

          {failed.length > 0 && (
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
              못 읽은 곳 {failed.length}: {failed.map((m) => `${m.name}(${m.error})`).join(" · ")} — '경쟁몰 관리'에서 베스트 페이지 주소로 다시 넣거나 빼세요.
            </p>
          )}
        </>
      )}
      <p className="px-1 text-[11px] text-stone-400">
        <ExternalLink size={11} className="mr-0.5 inline align-[-1px]" /> 상품을 누르면 그 몰 상품 페이지가 열려요. 품목은 상품 이름 끝 낱말로 나눠요(가끔 틀릴 수 있어요). {days.length > 0 && `기록 ${days.length}일치 · ${dayTitle(sorted[0])}부터`}
      </p>
      {manage && <MallSheet online={online} conf={conf} snap={snap} onClose={() => { setManage(false); loadConf(); }} />}
    </div>
  );
}

