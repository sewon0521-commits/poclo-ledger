import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Target, Rocket, Power, Trophy, Camera, ExternalLink } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { won } from "../lib/sales";
import { readStats, weekly, weekOf, RULES, STATUS } from "../lib/creatives";
import { codeOfName } from "../lib/reportPeriod";

/**
 * 보고 › 소재 성적표 (2026-10-19 밤, 세원: "에이스 소재 찾기 = 확률 게임 · 가나다라 만들어줘" 중 가·다).
 * (가) 우리 광고 소재 — 주마다 쏜 수 · 에이스/후보 · 지금 끌 것·키울 것 (settings meta_ad_stats, 1시간마다)
 * (다) 우리 인스타 게시물 — 광고 안 쓰고 먼저 반응 보기 (계정 아카이브 p_poclo 기록)
 * 판정 규칙은 lib/creatives.js RULES.
 */

const man = (v) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, "")}만` : won(Math.round(v || 0)));
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const FILTERS = [
  ["on", "켜진 것"],
  ["kill", "끌 것"],
  ["hopeful", "에이스 후보"],
  ["ace", "에이스"],
  ["week", "이번 주 새 소재"],
  ["all", "전체"],
];
// 만든 날 — 10/19 세원: "에이스 후보가 진짜 옛날 것까지 뜬다, 1달 기준으로. 지금 겨울 소재 준비해야 되는데 여름 소재가 보여서"
const SPANS = [
  ["30", "최근 1달"],
  ["90", "최근 3달"],
  ["all", "전체"],
];
const SPAN_KEY = "poclo_creatives_span";
const readSpan = () => {
  try {
    return localStorage.getItem(SPAN_KEY) || "30";
  } catch {
    return "30";
  }
};
const sinceOf = (span) => (span === "all" ? "" : new Date(Date.now() - Number(span) * 864e5).toISOString().slice(0, 10));
const SORTS = [
  ["spend", "광고비 많은 순"],
  ["roas", "ROAS 높은 순"],
  ["new", "최근 만든 순"],
  ["today", "오늘 광고비 순"],
];

function Kpi({ icon: Icon, label, value, unit, sub, tone = "", onClick, active }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={"rounded-2xl border bg-white px-4 py-3.5 text-left " + (active ? "border-rose-400 ring-2 ring-rose-100" : "border-stone-200") + (onClick ? " transition hover:border-rose-300" : "")}>
      <div className="flex items-center gap-1 text-xs text-stone-500">
        <Icon size={13} className="text-stone-400" /> {label}
      </div>
      <div className={"mt-1 text-2xl font-bold tracking-tight tabular-nums " + (tone || "text-stone-900")}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-stone-500">{unit}</span>}
      </div>
      <div className="mt-0.5 text-xs text-stone-500">{sub}</div>
    </Tag>
  );
}

function Weeks({ rows }) {
  const max = Math.max(RULES.weekGoal, ...rows.map((r) => r.made));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-stone-900">주마다 쏜 소재 · 그중 에이스</h3>
        <span className="flex items-center gap-3 text-[11px] text-stone-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-stone-300" /> 새 소재
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> 에이스 후보
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-700" /> 에이스
          </span>
          <span>점선 = 주 {RULES.weekGoal}개 목표</span>
        </span>
      </div>
      <div className="relative flex h-40 items-end gap-1.5">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-rose-300" style={{ bottom: `${(RULES.weekGoal / max) * 100}%` }} />
        {rows.map((r) => (
          <div key={r.week} className="flex h-full flex-1 flex-col items-center gap-1" title={`${md(r.week)} 주 · 새 소재 ${r.made}개 · 에이스 ${r.ace} · 후보 ${r.hopeful}`}>
            <div className="flex w-full flex-1 flex-col justify-end">
              <span className="mb-0.5 text-center text-[10px] text-stone-500 tabular-nums">{r.made || ""}</span>
              <div className="flex w-full flex-col-reverse overflow-hidden rounded-t bg-stone-300" style={{ height: `${(r.made / max) * 100}%` }}>
                {r.ace > 0 && <div className="bg-rose-700" style={{ height: `${(r.ace / Math.max(1, r.made)) * 100}%`, minHeight: 4 }} />}
                {r.hopeful > 0 && <div className="bg-emerald-500" style={{ height: `${(r.hopeful / Math.max(1, r.made)) * 100}%`, minHeight: 4 }} />}
              </div>
            </div>
            <span className="text-[10px] text-stone-400 tabular-nums">{md(r.week)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rules() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-stone-50 text-xs text-stone-600">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left font-semibold">
        판정 기준 · 이렇게 쓰세요 <ChevronDown size={13} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-3 leading-relaxed">
          <li>
            · <b>에이스</b> = 누적 {man(RULES.ace.spend)}원 넘게 쓰고 ROAS {RULES.ace.roas} 이상. 광고 매출의 절반 이상이 이런 소재 몇 개에서 나와요(3월~10월 상위 5개 = 55%).
          </li>
          <li>
            · <b>에이스 후보</b> = {man(RULES.hopeful.spend)}원↑ · ROAS {RULES.hopeful.roas}↑ · 구매 {RULES.hopeful.pu}건↑ — 예산을 조금씩 올려 보고, 같은 상품으로 변형(첫 3초·색)을 5~10개 더 만들어요.
          </li>
          <li>
            · <b>끌 것</b> = 켜져 있는데 {man(RULES.kill.spend)}원 써도 구매 0, 또는 {man(RULES.kill.lowSpend)}원↑인데 ROAS {RULES.kill.lowRoas} 아래.
          </li>
          <li>· <b>시험 중</b> = 아직 {man(RULES.testMax)}원 전 — 판단하기 이르니 둬요.</li>
          <li>
            · 에이스가 4%쯤 나오면 주 {RULES.weekGoal}개를 쏴야 주 1개가 나와요. 돈을 덜 쓰려면 인스타에 먼저 올려 반응 좋은 것만 광고로(아래 '우리 인스타 게시물').
          </li>
          <li>· 숫자는 메타 기준(7일 클릭). 1시간마다 새로 받아요.</li>
        </ul>
      )}
    </div>
  );
}

function Row({ o, img }) {
  const [label, tone] = STATUS[o.status];
  return (
    <tr className="hover:bg-stone-50/70">
      <td className="px-3 py-2 align-middle">
        <span className={"inline-block rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap " + tone}>{label}</span>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-2.5">
          <span className="h-11 w-8 shrink-0 overflow-hidden rounded bg-stone-100">{img && <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
          <span className="min-w-0">
            <span className="line-clamp-1 font-medium text-stone-900" title={o.name}>
              {o.title}
            </span>
            <span className="block text-[11px] text-stone-400">
              {md(o.created)} 만듦{o.kind && ` · ${o.kind}`}
              {o.maker && ` · ${o.maker}`}
              {o.active ? <b className="ml-1 text-emerald-600">● 켜짐</b> : ""}
            </span>
          </span>
        </div>
      </td>
      <td className="px-2 py-2 text-right font-semibold text-stone-900">{man(o.spend)}</td>
      <td className={"px-2 py-2 text-right font-semibold " + (o.roas >= 3 ? "text-emerald-700" : o.spend >= 10000 && o.roas < 1.5 ? "text-rose-600" : "text-stone-700")}>{o.spend ? o.roas.toFixed(2) : "—"}</td>
      <td className="px-2 py-2 text-right text-stone-700">
        {o.pu ? Math.round(o.pu) : 0}
        <span className="text-stone-400"> ({Math.round(o.pu1 || 0)})</span>
      </td>
      <td className="px-2 py-2 text-right text-stone-600">{o.ctr != null ? `${o.ctr.toFixed(2)}%` : "—"}</td>
      <td className="px-2 py-2 text-right text-stone-600">{o.cpc != null ? won(Math.round(o.cpc)) : "—"}</td>
      <td className="px-2 py-2 text-right text-stone-600">{o.hook != null ? `${o.hook.toFixed(1)}%` : "—"}</td>
      <td className="px-2 py-2 text-right text-stone-600">
        {o.s7 ? (
          <>
            {man(o.s7)} <span className={o.roas7 >= 3 ? "text-emerald-700" : "text-stone-400"}>· {o.roas7.toFixed(1)}</span>
          </>
        ) : (
          <span className="text-stone-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-stone-600">{o.sT ? `${man(o.sT)}${o.puT ? ` · ${Math.round(o.puT)}건` : ""}` : <span className="text-stone-300">—</span>}</td>
    </tr>
  );
}

/** (다) 우리 인스타 게시물 — 광고 없이 먼저 반응 보기 */
function OrganicPosts({ online, fileUrls }) {
  const [acc, setAcc] = useState(null);
  const [data, setData] = useState(null);
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = (await loadKey("accounts", online, { items: [] }).catch(() => ({ items: [] }))).items || [];
      const mine = list.find((a) => /p_poclo|포클로/i.test(`${a.handle} ${a.name}`));
      if (!alive || !mine) return;
      setAcc(mine);
      const d = await loadKey(`acct_${mine.id}`, online, null).catch(() => null);
      if (alive) setData(d);
    })();
    return () => {
      alive = false;
    };
  }, [online]);
  const posts = useMemo(
    () =>
      Object.values(data?.posts || {})
        .filter((p) => p.takenAt)
        .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
        .slice(0, 20),
    [data],
  );
  useEffect(() => {
    const keys = posts.map((p) => p.thumb).filter((k) => k && !urls[k]);
    if (!keys.length || !fileUrls) return;
    let alive = true;
    fileUrls(keys).then((m) => alive && setUrls((u) => ({ ...u, ...m })));
    return () => {
      alive = false;
    };
  }, [posts, fileUrls, urls]);
  const mid = (xs) => {
    const s = xs.filter((x) => x != null).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const mLike = mid(posts.map((p) => p.likes));
  const mCom = mid(posts.map((p) => p.comments));
  const mView = mid(posts.map((p) => p.views));
  const hot = (p) => (p.likes || 0) >= Math.max(5, mLike * 1.5) || (p.comments || 0) >= Math.max(3, mCom * 2) || (p.views && mView && p.views >= mView * 1.5);
  if (!acc) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 px-4 pt-3.5 pb-2.5">
        <h3 className="flex items-center gap-1 text-sm font-bold text-stone-900">
          <Camera size={14} className="text-rose-600" /> 우리 인스타 게시물 — 광고 전에 먼저 반응 보기
        </h3>
        <span className="text-[11px] text-stone-400">
          @{acc.handle} · 계정 아카이브 하루 한 번 · 최근 게시물 중앙값 좋아요 {mLike} · 댓글 {mCom}
          {mView ? ` · 조회 ${won(mView)}` : ""} · 그보다 확 높으면 '광고 후보'
        </span>
      </div>
      {!posts.length ? (
        <p className="px-4 py-8 text-center text-xs text-stone-400">아직 기록이 없어요. 콘텐츠 › 계정 아카이브에서 우리 계정을 스캔해요.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5 lg:grid-cols-8 2xl:grid-cols-10">
          {posts.map((p) => (
            <a key={p.code} href={p.url} target="_blank" rel="noreferrer" className={"overflow-hidden rounded-xl border bg-white " + (hot(p) ? "border-rose-400 ring-2 ring-rose-100" : "border-stone-200")}>
              <div className="relative aspect-[4/5] bg-stone-100">
                {urls[p.thumb] && <img src={urls[p.thumb]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {hot(p) && <span className="absolute top-1 left-1 rounded bg-rose-700 px-1.5 py-0.5 text-[10px] font-bold text-white">광고 후보</span>}
                <span className="absolute right-1 bottom-1 rounded bg-black/55 px-1 text-[10px] text-white">{p.kind === "reel" ? "릴스" : p.kind === "carousel" ? `${p.slides || ""}장` : "사진"}</span>
              </div>
              <div className="px-1.5 py-1 text-[10px] leading-tight text-stone-500 tabular-nums">
                {md(p.takenAt)} · ♥ {p.likes ?? "—"} · 💬 {p.comments ?? "—"}
                {p.views ? ` · ▶ ${man(p.views)}` : ""}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CreativesPage({ online, fileUrls }) {
  const [raw, setRaw] = useState(null);
  const [ads, setAds] = useState(null);
  const [info, setInfo] = useState({});
  const [state, setState] = useState("loading");
  const [filter, setFilter] = useState("on");
  const [sort, setSort] = useState("spend");
  const [q, setQ] = useState("");
  const [n, setN] = useState(50);
  const [span, setSpanState] = useState(readSpan);
  const setSpan = (v) => {
    setSpanState(v);
    setN(50);
    try {
      localStorage.setItem(SPAN_KEY, v);
    } catch {
      /* 무시 */
    }
  };

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([loadKey("meta_ad_stats", online, null), loadKey("meta_ads", online, null)])
        .then(([s, a]) => {
          if (!alive) return;
          setRaw(s);
          setAds(a);
          setState(s ? "ready" : "empty");
        })
        .catch(() => alive && setState("error"));
    load();
    loadKey("prod_daily", online, null)
      .then((p) => {
        if (!alive || !p?.info) return;
        const m = {};
        for (const x of Object.values(p.info)) {
          const c = x.code || codeOfName(x.name);
          if (c && x.image && !m[c]) m[c] = x.image;
        }
        setInfo(m);
      })
      .catch(() => {});
    const off1 = onSettingsChange((k) => k === "meta_ad_stats" && load());
    const off2 = watchKeys(["meta_ad_stats"], load, 60000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [online]);

  const stats = useMemo(() => readStats(raw), [raw]);
  const weeks = useMemo(() => weekly(stats, ads, 12), [stats, ads]);
  const thisWeek = weeks[weeks.length - 1];
  const last4 = weeks.slice(-5, -1);
  const made4 = last4.reduce((a, w) => a + w.made, 0);
  const good4 = last4.reduce((a, w) => a + w.ace + w.hopeful, 0);
  const on = stats.filter((o) => o.active);
  const kill = on.filter((o) => o.status === "kill");
  const spendToday = on.reduce((a, o) => a + (o.sT || 0), 0);
  const curWeek = thisWeek?.week;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // 켜진 것·끌 것은 지금 켜진 광고라 기간과 상관없이, 나머지는 '만든 날'로 거른다
  const since = sinceOf(span);
  const inSpan = (o) => filter === "on" || filter === "kill" || !since || (o.created || "") >= since;
  const list = stats
    .filter(inSpan)
    .filter((o) =>
      filter === "all" ? true : filter === "on" ? o.active : filter === "week" ? o.created && weekOf(o.created) === curWeek : o.status === filter,
    )
    .filter((o) => !words.length || words.every((w) => `${o.name} ${o.code}`.toLowerCase().includes(w)))
    .sort(
      {
        spend: (a, b) => b.spend - a.spend,
        roas: (a, b) => b.roas - a.roas || b.spend - a.spend,
        new: (a, b) => (b.created || "").localeCompare(a.created || ""),
        today: (a, b) => (b.sT || 0) - (a.sT || 0) || b.spend - a.spend,
      }[sort],
    );
  const recent = (o) => !since || (o.created || "") >= since;
  const count = (k) =>
    k === "on" ? on.length : k === "kill" ? kill.length : k === "all" ? stats.filter(recent).length : k === "week" ? stats.filter((o) => o.created && weekOf(o.created) === curWeek).length : stats.filter((o) => o.status === k && recent(o)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">소재 성적표</h2>
          <p className="mt-0.5 text-sm text-stone-500">에이스 소재 찾기는 확률 게임이에요. 많이 쏘고, 빨리 끄고, 된 것은 변형을 늘려요.</p>
        </div>
        {raw?.at && <span className="text-xs text-stone-400">갱신 {raw.at.slice(5, 10).replace("-", "/")} {raw.at.slice(11, 16)} · 1시간마다</span>}
      </div>

      {state === "loading" && <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>}
      {state === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">성적을 불러오지 못했어요.</p>}
      {state === "empty" && <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">아직 기록이 없어요. 사무실 PC 가 1시간마다 메타에서 받아요{online ? "." : " (공유 장부로 로그인해야 보여요)."}</div>}

      {state === "ready" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Rocket} label="이번 주 새 소재" value={thisWeek?.made ?? 0} unit={`/ ${RULES.weekGoal}개`} sub={`${md(curWeek)}부터 · 주 ${RULES.weekGoal}개면 에이스가 주 1개 꼴`} tone={(thisWeek?.made || 0) >= RULES.weekGoal ? "text-emerald-700" : "text-stone-900"} onClick={() => setFilter("week")} active={filter === "week"} />
            <Kpi icon={Trophy} label="지난 4주 에이스 · 후보" value={good4} unit={`/ ${made4}개`} sub={made4 ? `비율 ${((good4 / made4) * 100).toFixed(1)}% · 누르면 최근 1달 후보` : "누르면 최근 1달 후보"} tone="text-rose-700" onClick={() => (setFilter("hopeful"), setSpan("30"))} active={filter === "hopeful"} />
            <Kpi icon={Target} label="지금 켜진 소재" value={on.length} unit="개" sub={`오늘 광고비 ${man(spendToday)}원`} onClick={() => setFilter("on")} active={filter === "on"} />
            <Kpi icon={Power} label="끌 것" value={kill.length} unit="개" sub={kill.length ? `${man(kill.reduce((a, o) => a + (o.sT || 0), 0))}원이 오늘도 나가는 중` : "지금은 없어요"} tone={kill.length ? "text-amber-600" : "text-stone-900"} onClick={() => setFilter("kill")} active={filter === "kill"} />
          </div>

          <Weeks rows={weeks} />
          <Rules />

          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-3 py-2.5">
              <div className="flex gap-0.5 overflow-x-auto rounded-full bg-stone-100 p-0.5 [scrollbar-width:none]">
                {FILTERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => (setFilter(k), setN(50))} className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (filter === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
                    {l} <span className="font-normal opacity-60">{count(k)}</span>
                  </button>
                ))}
              </div>
              <select value={span} onChange={(e) => setSpan(e.target.value)} title="에이스 후보·에이스·전체는 이 기간에 만든 소재만" className="rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1 text-xs font-semibold text-rose-800">
                {SPANS.map(([k, l]) => (
                  <option key={k} value={k}>
                    만든 날: {l}
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700">
                {SORTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <input type="search" value={q} onChange={(e) => (setQ(e.target.value), setN(50))} placeholder="소재·상품 찾기" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1 text-sm outline-none focus:border-rose-600 sm:max-w-[14rem]" />
              <a href="https://adsmanager.facebook.com/" target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-stone-500 hover:text-rose-700">
                광고 관리자 <ExternalLink size={11} />
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-left text-[11px] font-semibold text-stone-500">
                    <th className="px-3 py-2">상태</th>
                    <th className="px-2 py-2">소재</th>
                    <th className="px-2 py-2 text-right">누적 광고비</th>
                    <th className="px-2 py-2 text-right">ROAS</th>
                    <th className="px-2 py-2 text-right">구매 (1일)</th>
                    <th className="px-2 py-2 text-right">CTR</th>
                    <th className="px-2 py-2 text-right">CPC</th>
                    <th className="px-2 py-2 text-right">3초 시청</th>
                    <th className="px-2 py-2 text-right">7일 광고비 · ROAS</th>
                    <th className="px-3 py-2 text-right">오늘</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {list.slice(0, n).map((o) => (
                    <Row key={o.id} o={o} img={info[o.code]} />
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-xs text-stone-400">
                        해당하는 소재가 없어요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {list.length > n && (
              <button type="button" onClick={() => setN(n + 50)} className="w-full border-t border-stone-100 py-2 text-xs text-stone-500 hover:text-rose-700">
                {list.length - n}개 더 보기
              </button>
            )}
          </section>
        </>
      )}

      <OrganicPosts online={online} fileUrls={fileUrls} />
    </div>
  );
}
