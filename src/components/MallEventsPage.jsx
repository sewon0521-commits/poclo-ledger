import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search, X, CalendarRange, Sparkles, Flag, Store } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { dayKey } from "../lib/journal";
import { daysBetween } from "../lib/tracker";
import { colorOf as ourColor } from "../lib/events";
import {
  LOG_KEY, KINDS, kindLabel, kindColor, TIMELINE_DEFAULT, md, isLive, whenText, extraText, mallName, pick, recent, liveByMall,
  timelineRows, ourRows, pos, shiftKey, spanDays,
} from "../lib/mallEvents";

/**
 * 보고 › 경쟁몰 이벤트 (2026-10-22) — 계산·데이터 모양은 lib/mallEvents.js 머리말.
 * 사무실 PC poclo-cafe24/mall_events.py 가 매일 아침(아침 보고 마지막) 사입 트래커 몰마다 분류·띠 배너·팝업·메인 배너·상품 태그·
 * 상세 공통 배너·쿠폰을 보고 'mall_events_log'(누적 타임라인)에 처음 본 날·마지막 본 날을 쌓는다. 여기는 읽기만.
 * 세원: "누가 언제 뭘하는지 보고 우리도 따라하던 하게" · "얼리윈터 같은건 제니어리는 언제부터 시작했고 언제까지 하는지도"
 */

/** 여러 몰에 걸친 캠페인 낱말 — 누르면 그 낱말 든 것만 (몰 수 = 지금 진행 중인 몰) */
const CAMPAIGNS = [
  ["얼리윈터", /얼리\s*윈터|early\s*-?\s*winter/i],
  ["얼리어텀", /얼리\s*어텀|early\s*autumn/i],
  ["겨울·윈터", /겨울|winter|윈터/i],
  ["가을·어텀", /가을|autumn|어텀|\bfall\b/i],
  ["블랙프라이데이", /블랙\s*프라이데이|블프|black\s*friday/i],
  ["할로윈", /할로윈|halloween/i],
  ["크리스마스·연말", /크리스마스|christmas|x-?mas|holiday|홀리데이|연말/i],
  ["시즌오프·세일", /시즌\s*오프|season\s*-?\s*off|clearance|outlet|아울렛|last\s*chance|라스트\s*찬스|\bsale\b|세일/i],
  ["1+1·세트 할인", /1\s*\+\s*1|2\s*\+\s*1|세트\s*\d+\s*%|set\s*\d+\s*%|두\s*장\s*이상/i],
  ["신상 할인", /(new|신상)[^가-힣]{0,6}\d+\s*%|\d+\s*%[^가-힣]{0,6}(new|신상)/i],
  ["가입 쿠폰", /가입|쿠폰\s*팩|웰컴|welcome/i],
  ["앱·카톡 친구", /\bapp\b|앱\s*(설치|다운|첫|푸시)|카톡|카카오|플친|톡\s*채널|플러스\s*친구/i],
  ["무료배송", /무료\s*배송|free\s*ship/i],
  ["타임세일·특가", /타임\s*(세일|딜|특가)|특가|time\s*sale/i],
  ["라방", /라방|라이브/i],
];
const campHit = (it, re) => re.test(String(it.text || "") + " " + String(it.extra?.rate || ""));

const SPANS = [30, 60, 90];
const SPAN_KEY = "poclo_mev_span";
const readNum = (k, d) => {
  try {
    return Number(localStorage.getItem(k)) || d;
  } catch {
    return d;
  }
};
const writeNum = (k, v) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* 무시 */
  }
};

const Thumb = ({ src, className = "" }) =>
  src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={"shrink-0 rounded-md bg-stone-100 object-cover " + className} /> : null;

function KindChip({ kind }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 align-[1px] text-[10px] leading-none font-semibold text-stone-600">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: kindColor(kind) }} />
      {kindLabel(kind)}
    </span>
  );
}

/** 이름 없는 그림(배너·팝업)은 '메인 배너 · 10/14 올린 그림' */
const textOf = (it) => it.text || (it.kind === "banner" ? "메인 배너" : it.kind === "popup" ? "팝업 그림" : it.kind === "detail" ? "상세 공통 그림" : kindLabel(it.kind));
const linkOf = (it) => it.link || `https://${it.host}/`;

/** 한 줄 — 누르면 그 몰 페이지(그 분류·배너 링크) */
function EvRow({ it, today, name, showMall = true, ended = false }) {
  const ex = extraText(it);
  return (
    <a href={linkOf(it)} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5 rounded-xl px-2 py-2 transition hover:bg-rose-50/70">
      {it.img ? <Thumb src={it.img} className={it.kind === "banner" || it.kind === "detail" ? "h-10 w-16" : "h-10 w-10"} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug break-words">
          <KindChip kind={it.kind} />
          {showMall && <b className="ml-1.5 text-xs text-stone-800">{name}</b>}
          <span className={"ml-1.5 " + (ended ? "text-stone-500 line-through decoration-stone-300" : "text-stone-900")}>{textOf(it)}</span>
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">
          {whenText(it, today)}
          {ex && <span className="text-stone-400"> · {ex}</span>}
        </span>
      </span>
      <ExternalLink size={12} className="mt-1 shrink-0 text-stone-300 group-hover:text-rose-600" />
    </a>
  );
}

function Stat({ icon: Icon, label, value, unit, sub, onClick, on }) {
  const Box = onClick ? "button" : "div";
  return (
    <Box type={onClick ? "button" : undefined} onClick={onClick} className={"rounded-2xl border bg-white px-4 py-3.5 text-left " + (on ? "border-rose-400 ring-1 ring-rose-200" : "border-stone-200") + (onClick ? " hover:border-rose-300" : "")}>
      <div className="flex items-center gap-1 text-xs text-stone-500">
        <Icon size={13} className="text-stone-400" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-stone-900 tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-stone-500">{unit}</span>}
      </div>
      <div className="mt-0.5 text-xs text-stone-500">{sub}</div>
    </Box>
  );
}

function Guide() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 to-white">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-baseline gap-2">
          <b className="text-sm text-stone-900">이 화면 보는 법</b>
          <span className="text-[11px] text-stone-500">무엇을 모으고 '이전부터'가 무슨 뜻인지</span>
        </span>
        <ChevronDown size={15} className={"shrink-0 text-stone-400 transition " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-rose-100 px-4 py-4 text-[13px] leading-relaxed text-stone-600 lg:grid-cols-3">
          <div className="space-y-1">
            <div className="text-xs font-bold text-rose-800">매일 아침 모으는 것</div>
            <p>사입 트래커 경쟁몰마다 첫 화면의 <b>이벤트 분류</b>(Early Winter·SALE·1+1…) · <b>띠 배너</b>(맨 위·아래 고정 문구) · <b>팝업</b> · <b>메인 배너</b>, 상품 이름 앞 <b>[태그]</b>, 베스트 1위 상품의 <b>상세 공통 배너</b>와 <b>쿠폰</b>(이름·할인·기간).</p>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-rose-800">시작 · 끝</div>
            <p>어제 없던 게 오늘 보이면 <b>시작</b>, 어제까지 있다가 오늘 사라지면 <b>끝</b>이에요. 모으기 시작한 날(10/22) 이미 있던 건 <b>'10/22 이전부터'</b> — 정확한 시작일은 몰라요.
              대신 쿠폰은 <b>쿠폰 기간</b>, 이벤트 분류는 그 분류 <b>상품 사진 올린 날</b>, 배너는 <b>그림 올린 날</b>로 시작을 짐작해 타임라인에 점선으로 그려요.</p>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-rose-800">이렇게 써요</div>
            <p>위 <b>캠페인 칩</b>(얼리윈터·블프·가입 쿠폰…)을 누르면 그 이벤트를 하는 몰만 모여요. 줄을 누르면 그 몰 페이지가 열려요. 아래 <b>타임라인</b>에서 우리 이벤트 캘린더와 같이 놓고 언제 따라 할지 정해요.</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** 몰 하나 — 진행 중인 것 (배너는 그림 띠, 태그는 칩) */
function MallCard({ host, list, today, name, status }) {
  const [all, setAll] = useState(false);
  const rows = list.filter((x) => x.kind !== "banner" && x.kind !== "tag");
  const banners = list.filter((x) => x.kind === "banner");
  const tags = list.filter((x) => x.kind === "tag");
  const since = shiftKey(today, -6);
  const fresh = list.filter((x) => !x.pre && x.first >= since).length;
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-3.5 pt-3 pb-2">
        <a href={`https://${host}/`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-bold text-stone-900 hover:text-rose-700">
          {name}
        </a>
        <span className="shrink-0 text-[11px] text-stone-400">
          {fresh > 0 && <b className="mr-1 text-rose-700">새로 {fresh}</b>}진행 중 {list.length}
          {status && <span className="ml-1 text-amber-700">· {status}</span>}
        </span>
      </header>
      <div className="flex-1 px-1.5 py-1">
        {shown.map((it) => (
          <EvRow key={it.id} it={it} today={today} name={name} showMall={false} />
        ))}
        {rows.length > shown.length && (
          <button type="button" onClick={() => setAll(true)} className="w-full rounded-lg py-1.5 text-[11px] text-stone-500 hover:text-rose-700">
            {rows.length - shown.length}개 더 보기
          </button>
        )}
        {tags.length > 0 && (
          <div className="px-2 py-2">
            <div className="mb-1 text-[11px] text-stone-500">상품 이름 앞 태그 (상품 수)</div>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <a key={t.id} href={linkOf(t)} target="_blank" rel="noreferrer" title={whenText(t, today)} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-700 hover:bg-rose-100">
                  {t.text} <span className="text-stone-400">{t.extra?.n || ""}</span>
                  {!t.pre && t.first >= since && <b className="ml-0.5 text-rose-700">N</b>}
                </a>
              ))}
            </div>
          </div>
        )}
        {banners.length > 0 && (
          <div className="px-2 pt-1 pb-2.5">
            <div className="mb-1 text-[11px] text-stone-500">메인 배너 {banners.length}장{banners.some((b) => !b.pre && b.first >= since) && <b className="ml-1 text-rose-700">새로 {banners.filter((b) => !b.pre && b.first >= since).length}</b>}</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {banners.map((b) => (
                <a key={b.id} href={linkOf(b)} target="_blank" rel="noreferrer" title={`${textOf(b)}\n${whenText(b, today)}${extraText(b) ? " · " + extraText(b) : ""}`} className={"relative shrink-0 overflow-hidden rounded-md ring-1 " + (!b.pre && b.first >= since ? "ring-2 ring-rose-500" : "ring-stone-200")}>
                  <Thumb src={b.img} className="h-14 w-24" />
                  {b.text && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1 pt-2 pb-0.5 text-[9px] text-white">{b.text}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** 타임라인 — 몰별 줄, 막대 = 본 기간(진행 중이면 오늘까지) · 앞 점선 = 시작 짐작 · 뒤 점선 = 쿠폰 끝나는 날까지 */
function Timeline({ items, events, today, conf, log, kindsOn }) {
  const [span, setSpanState] = useState(() => readNum(SPAN_KEY, 30));
  const [ours, setOurs] = useState(true);
  const [allMalls, setAllMalls] = useState(false);
  const setSpan = (n) => {
    setSpanState(n);
    writeNum(SPAN_KEY, n);
  };
  const from = shiftKey(today, -(span - 1));
  const to = shiftKey(today, Math.max(7, Math.round(span / 4)));
  const days = daysBetween(from, to) + 1;
  const kinds = kindsOn.length ? kindsOn : TIMELINE_DEFAULT;
  const rows = timelineRows(items.filter((it) => kinds.includes(it.kind)), today, from);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.it.host)) by.set(r.it.host, []);
    by.get(r.it.host).push(r);
  }
  const groups = [...by.entries()]
    .map(([host, list]) => ({ host, list: list.sort((a, b) => KINDS.findIndex((k) => k[0] === a.it.kind) - KINDS.findIndex((k) => k[0] === b.it.kind) || (a.lo < b.lo ? -1 : 1)) }))
    .sort((a, b) => b.list.filter((r) => !r.it.pre).length - a.list.filter((r) => !r.it.pre).length || b.list.length - a.list.length);
  const our = ours ? ourRows(events, today, from).filter((e) => e.start <= to) : [];
  const shownGroups = allMalls ? groups : groups.slice(0, 12);
  // 눈금 — 7일마다(달이 바뀌면 그 달 1일도)
  const ticks = [];
  for (let i = 0; i < days; i++) {
    const d = shiftKey(from, i);
    if (d.endsWith("-01") || i % 7 === 0) ticks.push(d);
  }
  const left = (d) => pos(d, from, to) + "%";
  const width = (a, b) => Math.max(0.6, pos(shiftKey(b, 1), from, to) - pos(a, from, to)) + "%";
  const todayX = left(today);

  const bar = (r) => {
    const c = kindColor(r.it.kind);
    const seenFrom = r.seenFrom < from ? from : r.seenFrom;
    const tip = `${mallName(log, conf, r.it.host)} · ${kindLabel(r.it.kind)}\n${textOf(r.it)}\n${whenText(r.it, today)}${extraText(r.it) ? "\n" + extraText(r.it) : ""}${r.guessFrom ? `\n점선 = ${r.guessWhy} 기준 ${md(r.guessFrom)}부터로 짐작` : ""}`;
    return (
      <a href={linkOf(r.it)} target="_blank" rel="noreferrer" title={tip} className="group relative block h-5">
        {r.guessFrom && r.guessFrom < r.seenFrom && (
          <span className="absolute top-1/2 h-0 -translate-y-1/2 border-t-2 border-dashed" style={{ left: left(r.guessFrom < from ? from : r.guessFrom), width: width(r.guessFrom < from ? from : r.guessFrom, shiftKey(r.seenFrom, -1)), borderColor: c, opacity: 0.55 }} />
        )}
        <span
          className={"absolute top-0.5 bottom-0.5 rounded-md transition group-hover:brightness-110 " + (r.it.pre && !r.guessFrom ? "rounded-l-none" : "")}
          style={{ left: left(seenFrom), width: width(seenFrom, r.seenTo), background: r.it.gone ? c + "99" : c, backgroundImage: r.it.pre && !r.guessFrom ? `linear-gradient(90deg, ${c}22, ${c} 18px)` : undefined }}
        />
        {r.planTo && <span className="absolute top-0.5 bottom-0.5 rounded-r-md border-2 border-l-0 border-dashed" style={{ left: left(shiftKey(r.seenTo, 1)), width: width(shiftKey(r.seenTo, 1), r.planTo), borderColor: c + "aa" }} />}
      </a>
    );
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 pt-3.5 pb-2.5">
        <h3 className="flex items-center gap-1 text-sm font-bold text-stone-900">
          <CalendarRange size={14} className="text-rose-600" /> 타임라인 — 누가 언제 무엇을
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-stone-600">
            <input type="checkbox" checked={ours} onChange={(e) => setOurs(e.target.checked)} className="accent-rose-700" /> 우리 이벤트 같이
          </label>
          <div className="flex rounded-full bg-stone-100 p-0.5">
            {SPANS.map((n) => (
              <button key={n} type="button" onClick={() => setSpan(n)} className={"rounded-full px-3 py-1 text-xs font-semibold " + (span === n ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
                {n}일
              </button>
            ))}
          </div>
        </div>
      </div>
      {!kindsOn.length && <p className="px-4 pt-2 text-[11px] text-stone-400">메인 배너·상품 태그는 많고 자주 바뀌어서 빼고 그려요 — 위 종류 칩에서 고르면 같이 보여요.</p>}
      <div className="overflow-x-auto px-2 pt-2 pb-3">
        <div className="min-w-[760px]">
          {/* 눈금 */}
          <div className="flex text-[10px] text-stone-400">
            <div className="w-52 shrink-0 px-2">몰 · 이벤트</div>
            <div className="relative h-5 flex-1">
              {ticks
                .filter((d) => Math.abs(daysBetween(d, today)) > 2)
                .map((d) => (
                  <span key={d} className="absolute -translate-x-1/2 tabular-nums" style={{ left: left(d) }}>
                    {md(d)}
                  </span>
                ))}
              <span className="absolute -translate-x-1/2 rounded bg-rose-700 px-1 font-bold text-white" style={{ left: todayX }}>
                오늘
              </span>
            </div>
          </div>
          <div className="relative">
            {/* 오늘 줄 · 눈금 줄 */}
            <div className="pointer-events-none absolute inset-y-0 right-0 left-52">
              {ticks.map((d) => (
                <span key={d} className="absolute inset-y-0 border-l border-stone-100" style={{ left: left(d) }} />
              ))}
              <span className="absolute inset-y-0 border-l-2 border-rose-400/70" style={{ left: todayX }} />
            </div>
            {our.length > 0 && (
              <div className="border-b border-stone-200 pb-1">
                <div className="px-2 pt-1.5 text-[11px] font-bold text-rose-800">포클로 (이벤트 캘린더)</div>
                {our.map((e) => (
                  <div key={e.id} className="flex items-center">
                    <div className="w-52 shrink-0 truncate px-2 text-xs text-stone-700" title={e.title}>
                      {e.title} <span className="text-stone-400">{md(e.start)}{e.end !== e.start ? `~${md(e.end)}` : ""}</span>
                    </div>
                    <div className="relative h-5 flex-1">
                      <span className="absolute top-0.5 bottom-0.5 rounded-md" title={`${e.title} ${md(e.start)}~${md(e.end)}`} style={{ left: left(e.start < from ? from : e.start), width: width(e.start < from ? from : e.start, e.end > to ? to : e.end), background: ourColor(e.kind), opacity: e.future ? 0.55 : 1 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {shownGroups.map((g) => (
              <div key={g.host} className="border-b border-stone-100 pb-1 last:border-0">
                <div className="px-2 pt-1.5 text-[11px] font-bold text-stone-800">{mallName(log, conf, g.host)}</div>
                {g.list.map((r) => (
                  <div key={r.it.id} className="flex items-center">
                    <div className="flex w-52 shrink-0 items-center gap-1 px-2 text-xs" title={`${textOf(r.it)} — ${whenText(r.it, today)}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: kindColor(r.it.kind) }} />
                      <span className={"min-w-0 truncate " + (r.it.gone ? "text-stone-400" : "text-stone-700")}>{textOf(r.it)}</span>
                      <span className="shrink-0 text-[10px] text-stone-400 tabular-nums">{r.it.gone ? "끝" : `${spanDays(r.it, today)}일${r.it.pre ? "+" : ""}`}</span>
                    </div>
                    <div className="relative flex-1">{bar(r)}</div>
                  </div>
                ))}
              </div>
            ))}
            {!groups.length && <p className="px-2 py-6 text-center text-xs text-stone-400">이 기간·종류에 그릴 이벤트가 없어요.</p>}
          </div>
        </div>
      </div>
      {groups.length > shownGroups.length && (
        <button type="button" onClick={() => setAllMalls(true)} className="w-full border-t border-stone-100 py-2 text-xs text-stone-500 hover:text-rose-700">
          몰 {groups.length - shownGroups.length}곳 더 보기
        </button>
      )}
      <p className="border-t border-stone-100 px-4 py-2 text-[11px] leading-relaxed text-stone-400">
        막대 = 우리가 본 기간(진행 중이면 오늘까지). 왼쪽이 흐리게 시작하면 '모으기 전부터' · 앞 점선 = 쿠폰 기간·상품 사진·그림 올린 날로 짐작한 시작 · 뒤 점선 = 쿠폰 끝나는 날까지 남은 기간. 막대를 누르면 그 몰 페이지.
      </p>
    </section>
  );
}

export default function MallEventsPage({ online }) {
  const [log, setLog] = useState(null);
  const [conf, setConf] = useState({});
  const [events, setEvents] = useState([]);
  const [state, setState] = useState("loading");
  const [kinds, setKinds] = useState([]);
  const [host, setHost] = useState("");
  const [q, setQ] = useState("");
  const [camp, setCamp] = useState("");
  const [focus, setFocus] = useState(""); // started | ended | live
  const [moreMalls, setMoreMalls] = useState(false);
  const today = dayKey();

  const load = useCallback(async () => {
    try {
      const [lg, tm, ev] = await Promise.all([loadKey(LOG_KEY, online, null), loadKey("tracker_malls", online, { items: [] }), loadKey("events", online, { items: [] })]);
      setLog(lg);
      setConf(Object.fromEntries((tm?.items || []).map((m) => [m.host, m])));
      setEvents(ev?.items || []);
      setState(lg?.items?.length ? "ready" : "empty");
    } catch {
      setState("error");
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
    const off = onSettingsChange((k) => (k === LOG_KEY || k === "events" || k === "tracker_malls" ? load() : null));
    const stop = watchKeys([LOG_KEY], () => load(), 60000);
    return () => {
      off();
      stop();
    };
  }, [load]);

  const all = useMemo(() => (log?.items || []).filter((it) => !conf[it.host]?.off), [log, conf]);
  const name = useCallback((h) => mallName(log, conf, h), [log, conf]);
  const campRe = CAMPAIGNS.find((c) => c[0] === camp)?.[1];
  const base = useMemo(() => {
    const p = pick(all, { host, q, log, conf });
    return campRe ? p.filter((it) => campHit(it, campRe)) : p;
  }, [all, host, q, log, conf, campRe]);
  const items = useMemo(() => (kinds.length ? base.filter((it) => kinds.includes(it.kind)) : base), [base, kinds]);
  const live = items.filter(isLive);
  const { started, ended } = recent(items, today, 7);
  const byMall = liveByMall(items, today);

  // 캠페인 칩 — 진행 중인 몰 수 (종류·찾기·몰 고르기와 상관없이 전체에서)
  const camps = useMemo(() => {
    const liveAll = all.filter(isLive);
    return CAMPAIGNS.map(([label, re]) => [label, new Set(liveAll.filter((it) => campHit(it, re)).map((it) => it.host)).size]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }, [all]);
  const kindCount = (k) => base.filter((it) => isLive(it) && it.kind === k).length;

  // 수집 상태 — 마지막으로 돈 날의 성공·실패
  const malls = log?.malls || {};
  const lastRun = Object.values(malls).reduce((m, x) => [x.last, x.err].filter(Boolean).reduce((a, b) => (b > a ? b : a), m), "");
  const okHosts = Object.entries(malls).filter(([h, x]) => x.last === lastRun && !conf[h]?.off);
  const failHosts = Object.entries(malls).filter(([h, x]) => x.err === lastRun && !conf[h]?.off);
  const firstDay = Object.values(malls).reduce((m, x) => (x.first && (!m || x.first < m) ? x.first : m), "");
  const firstOnly = lastRun && lastRun === firstDay;
  const hostList = Object.keys(malls)
    .filter((h) => !conf[h]?.off)
    .sort((a, b) => name(a).localeCompare(name(b), "ko"));
  const shownMalls = moreMalls || host || q || camp ? byMall : byMall.slice(0, 12);
  const filtering = !!(host || q || camp || kinds.length);

  const toggleKind = (k) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const clearAll = () => {
    setKinds([]);
    setHost("");
    setQ("");
    setCamp("");
    setFocus("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">경쟁몰 이벤트</h2>
          <p className="mt-0.5 text-sm text-stone-500">경쟁몰 첫 화면·상세·쿠폰을 매일 아침 보고, 누가 언제 무슨 이벤트를 시작하고 끝냈는지 쌓아요.</p>
        </div>
        {lastRun && (
          <span className="text-xs text-stone-500">
            마지막 수집 {md(lastRun)}
            {log?.updated ? ` ${log.updated.slice(11, 16)}` : ""} · {okHosts.length}/{okHosts.length + failHosts.length}곳
          </span>
        )}
      </div>

      <Guide />

      {state === "loading" && <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>}
      {state === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">경쟁몰 이벤트를 불러오지 못했어요.</p>}
      {state === "empty" && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">
          아직 모은 기록이 없어요. 사무실 PC 가 매일 아침 아침 보고 다음에 모아요{online ? "." : " (공유 장부로 로그인해야 보여요)."}
        </div>
      )}

      {state === "ready" && (
        <>
          {/* 고르기 */}
          <div className="space-y-2">
            {camps.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11px] font-semibold text-stone-500">지금 하는 캠페인</span>
                {camps.map(([label, n]) => (
                  <button key={label} type="button" onClick={() => setCamp(camp === label ? "" : label)} className={"rounded-full px-2.5 py-1 text-xs font-semibold transition " + (camp === label ? "bg-rose-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-rose-300")}>
                    {label} <span className={camp === label ? "text-white/80" : "text-stone-400"}>{n}곳</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 basis-56">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="찾기 — 예: 얼리윈터, 쿠폰, 제니어리" className="w-full rounded-full border border-stone-200 bg-white py-1.5 pr-8 pl-8 text-sm outline-none focus:border-rose-500" />
                {q && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-stone-400 hover:text-stone-700" aria-label="지우기">
                    <X size={13} />
                  </button>
                )}
              </label>
              <select value={host} onChange={(e) => setHost(e.target.value)} className="max-w-full rounded-full border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700">
                <option value="">전체 몰</option>
                {hostList.map((h) => (
                  <option key={h} value={h}>
                    {name(h)}
                    {malls[h]?.err === lastRun ? " (못 읽음)" : ""}
                  </option>
                ))}
              </select>
              {filtering && (
                <button type="button" onClick={clearAll} className="rounded-full px-2.5 py-1.5 text-xs text-stone-500 hover:text-rose-700">
                  다 풀기
                </button>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              <button type="button" onClick={() => setKinds([])} className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (!kinds.length ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900")}>
                전체 종류
              </button>
              {KINDS.map(([k, label, c]) => (
                <button key={k} type="button" onClick={() => toggleKind(k)} className={"flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold " + (kinds.includes(k) ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900")}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                  {label} <span className="font-normal opacity-60">{kindCount(k)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 숫자 칸 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Flag} label="진행 중" value={live.length} unit="개" sub={`${new Set(live.map((x) => x.host)).size}개 몰`} onClick={() => setFocus(focus === "live" ? "" : "live")} on={focus === "live"} />
            <Stat icon={Sparkles} label="최근 7일 새로 시작" value={firstOnly ? "—" : started.length} unit={firstOnly ? "" : "개"} sub={firstOnly ? "내일 아침부터 오늘과 비교해요" : `${new Set(started.map((x) => x.host)).size}개 몰`} onClick={firstOnly ? undefined : () => setFocus(focus === "started" ? "" : "started")} on={focus === "started"} />
            <Stat icon={CalendarRange} label="최근 7일 끝남" value={firstOnly ? "—" : ended.length} unit={firstOnly ? "" : "개"} sub={firstOnly ? "어제까지 있다가 사라진 것" : `${new Set(ended.map((x) => x.host)).size}개 몰`} onClick={firstOnly ? undefined : () => setFocus(focus === "ended" ? "" : "ended")} on={focus === "ended"} />
            <Stat icon={Store} label="오늘 수집" value={`${okHosts.length}`} unit={`/ ${okHosts.length + failHosts.length}곳`} sub={failHosts.length ? `못 읽음: ${failHosts.map(([h]) => name(h)).join(", ")}` : "다 읽었어요"} />
          </div>

          {/* 최근 7일 — 시작·끝 */}
          {focus !== "live" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {focus !== "ended" && (
                <section className="rounded-2xl border border-stone-200 bg-white">
                  <div className="flex items-baseline justify-between border-b border-stone-100 px-4 pt-3.5 pb-2">
                    <h3 className="text-sm font-bold text-stone-900">최근 7일 새로 시작 <span className="font-normal text-stone-400">{started.length}</span></h3>
                    <span className="text-[11px] text-stone-400">어제 없던 게 보인 날 = 시작</span>
                  </div>
                  <div className="max-h-[28rem] overflow-y-auto px-1.5 py-1">
                    {started.map((it) => (
                      <EvRow key={it.id} it={it} today={today} name={name(it.host)} />
                    ))}
                    {!started.length && (
                      <p className="px-3 py-6 text-center text-xs leading-relaxed text-stone-400">
                        {firstOnly ? `오늘(${md(lastRun)})이 첫 수집이라 지금 보이는 건 전부 '${md(lastRun)} 이전부터'예요. 내일 아침부터 새로 생긴 게 여기 떠요.` : "최근 7일에 새로 시작한 게 없어요."}
                      </p>
                    )}
                  </div>
                </section>
              )}
              {focus !== "started" && (
                <section className="rounded-2xl border border-stone-200 bg-white">
                  <div className="flex items-baseline justify-between border-b border-stone-100 px-4 pt-3.5 pb-2">
                    <h3 className="text-sm font-bold text-stone-900">최근 7일 끝남 <span className="font-normal text-stone-400">{ended.length}</span></h3>
                    <span className="text-[11px] text-stone-400">어제까지 있다가 사라진 것</span>
                  </div>
                  <div className="max-h-[28rem] overflow-y-auto px-1.5 py-1">
                    {ended.map((it) => (
                      <EvRow key={it.id} it={it} today={today} name={name(it.host)} ended />
                    ))}
                    {!ended.length && <p className="px-3 py-6 text-center text-xs text-stone-400">{firstOnly ? "내일 아침부터 사라진 게 여기 떠요." : "최근 7일에 끝난 게 없어요."}</p>}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* 진행 중 — 몰별 */}
          {focus !== "started" && focus !== "ended" && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5">
                <h3 className="text-sm font-bold text-stone-900">
                  진행 중 — 몰별 <span className="font-normal text-stone-400">{byMall.length}곳</span>
                </h3>
                <span className="text-[11px] text-stone-400">최근에 새로 시작한 몰 먼저 · 줄을 누르면 그 몰 페이지</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {shownMalls.map((g) => (
                  <MallCard key={g.host} host={g.host} list={g.list} today={today} name={name(g.host)} status={malls[g.host]?.err === lastRun ? `${md(lastRun)} 못 읽음` : ""} />
                ))}
              </div>
              {!byMall.length && <p className="rounded-2xl border border-dashed border-stone-200 py-8 text-center text-xs text-stone-400">고른 조건에 진행 중인 이벤트가 없어요.</p>}
              {byMall.length > shownMalls.length && (
                <button type="button" onClick={() => setMoreMalls(true)} className="w-full rounded-xl border border-stone-200 bg-white py-2 text-xs text-stone-600 hover:border-rose-300">
                  몰 {byMall.length - shownMalls.length}곳 더 보기
                </button>
              )}
            </div>
          )}

          <Timeline items={items} events={events} today={today} conf={conf} log={log} kindsOn={kinds} />
        </>
      )}
      <p className="px-1 text-[11px] text-stone-400">
        <ExternalLink size={11} className="mr-0.5 inline align-[-1px]" /> 몰 목록은 사입 트래커 › 경쟁몰 관리와 같아요(뺀 몰은 여기서도 빠져요).
        {firstDay && ` 기록 ${md(firstDay)}부터.`}
      </p>
    </div>
  );
}
