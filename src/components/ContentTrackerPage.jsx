import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Megaphone, Film, Flame } from "lucide-react";
import { loadKey, changeKey, onSettingsChange } from "../lib/shoot";
import { won } from "../lib/sales";
import { catOf, CATS } from "../lib/tracker";
import { CTYPES, autoType } from "../lib/contentTypes";

/**
 * 보고 › 콘텐츠 트래커 (2026-10-19 밤, 세원 "가나다라 다 만들어줘" 중 나·라 — 쇼만마 content_women · content_reels 를 우리 것으로).
 * (나) 경쟁몰 광고 — 사입 트래커 몰의 메타 광고를 베스트 상품과 이어 '몇 위 상품을 며칠째 광고 중'인지. settings comp_ads(poclo-cafe24/comp_ads.py, 아침)
 * (라) 유형별 레퍼런스 — 우리 릴스 라이브러리를 7가지 유형으로(lib/contentTypes.js). 고친 유형은 settings reel_types.
 */

const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const man = (v) => (v >= 10000 ? `${(v / 10000).toFixed(1).replace(/\.0$/, "")}만` : won(v || 0));
const TAB_KEY = "poclo_ct_tab";
const libUrl = (id) => `https://www.facebook.com/ads/library/?id=${id}`;
const pageUrl = (pid) => `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=KR&search_type=page&view_all_page_id=${pid}`;
const SEL = "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800";

function Pills({ list, value, onChange }) {
  return (
    <div className="flex gap-0.5 overflow-x-auto rounded-full bg-stone-100 p-0.5 [scrollbar-width:none]">
      {list.map(([k, l, c]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={"shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold " + (value === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
          {l} {c != null && <span className="font-normal opacity-60">{c}</span>}
        </button>
      ))}
    </div>
  );
}

const AdThumb = ({ a }) => (
  <a href={libUrl(a.id)} target="_blank" rel="noreferrer" title={a.text} className="w-16 shrink-0">
    <span className="relative block aspect-square overflow-hidden rounded-md bg-stone-100">
      {a.img && <img src={a.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
    </span>
    <span className="block text-center text-[10px] text-stone-500 tabular-nums">
      {a.video ? "🎬" : a.cards > 1 ? "🗂️" : "🖼️"} {md(a.startAt)}
    </span>
  </a>
);

/** (나) 베스트 상품 × 광고 카드 */
function ProductAds({ g }) {
  const v = g.ads.filter((a) => a.video).length;
  const img = g.item?.img || g.ads[0]?.img;
  return (
    <div className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3">
      <a href={g.item?.url || g.ads[0]?.link} target="_blank" rel="noreferrer" className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100">
        {img && <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
      </a>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <div className="line-clamp-2 text-sm font-semibold text-stone-900">{g.item?.name || g.ads[0]?.text?.split("\n")[0] || "상품"}</div>
          <div className="text-[11px] text-stone-500">
            <b className="text-stone-700">{g.mall}</b> · {g.style}
            {g.item && ` · 베스트 ${g.item.rank}위`} {g.item && <span title="베스트 상품을 광고 중">📣</span>}
            {g.item?.price > 0 && ` · ${won(g.item.price)}원`}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">광고 {g.ads.length}건</span>
          {g.item?.streak >= 2 && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">{g.item.streak}일 연속 베스트</span>}
          {g.maxDays >= 30 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">🔥 최장 {g.maxDays}일 롱런</span>}
        </div>
        <div className="text-[11px] text-stone-500">
          🎬 영상 {v} · 🖼️ 이미지 {g.ads.length - v} · 최장 게재 {g.maxDays}일
        </div>
        {g.ads[0]?.text && <p className="line-clamp-2 text-[11px] text-stone-600">{g.ads[0].text}</p>}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          {g.ads.slice(0, 8).map((a) => (
            <AdThumb key={a.id} a={a} />
          ))}
        </div>
        <div className="flex gap-3 text-[11px]">
          {g.pageId && (
            <a href={pageUrl(g.pageId)} target="_blank" rel="noreferrer" className="text-stone-500 hover:text-rose-700">
              전체 광고 ↗
            </a>
          )}
          {g.item?.url && (
            <a href={g.item.url} target="_blank" rel="noreferrer" className="text-stone-500 hover:text-rose-700">
              상품 ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CompAds({ comp, snap, conf }) {
  const [sort, setSort] = useState("many");
  const [kind, setKind] = useState("");
  const [cat, setCat] = useState("");
  const [mall, setMall] = useState("");
  const [style, setStyle] = useState("");
  const [n, setN] = useState(24);
  const groups = useMemo(() => {
    const out = [];
    const other = [];
    for (const [host, m] of Object.entries(comp?.malls || {})) {
      if (conf[host]?.off) continue;
      const style = conf[host]?.style || m.style;
      const best = new Map((snap?.malls?.[host]?.items || []).map((x) => [String(x.id), x]));
      const by = new Map();
      for (const a of m.ads || []) {
        const it = a.pid && best.get(a.pid);
        if (it) by.set(a.pid, [...(by.get(a.pid) || []), a]);
        else other.push({ ...a, host, mall: m.name, style });
      }
      for (const [pid, ads] of by) {
        const item = best.get(pid);
        ads.sort((a, b) => b.days - a.days);
        out.push({ key: host + pid, host, pid, mall: m.name, style, pageId: m.pageId, item, ads, maxDays: ads[0]?.days || 0, minDays: Math.min(...ads.map((a) => a.days)), cat: catOf(item.name) });
      }
    }
    return { out, other };
  }, [comp, snap, conf]);
  const pick = (g) => (!mall || g.host === mall) && (!style || g.style === style) && (!cat || g.cat === cat);
  const list = groups.out
    .filter(pick)
    .map((g) => (kind ? { ...g, ads: g.ads.filter((a) => (kind === "video" ? a.video : !a.video)) } : g))
    .filter((g) => g.ads.length)
    .sort({ many: (a, b) => b.ads.length - a.ads.length || b.maxDays - a.maxDays, long: (a, b) => b.maxDays - a.maxDays, new: (a, b) => a.minDays - b.minDays || a.item.rank - b.item.rank }[sort]);
  const longOther = groups.other
    .filter((a) => a.days >= 21 && (!mall || a.host === mall) && (!style || a.style === style) && (!kind || (kind === "video" ? a.video : !a.video)))
    .sort((a, b) => b.days - a.days);
  const malls = Object.entries(comp?.malls || {}).filter(([h]) => !conf[h]?.off);
  const failed = malls.filter(([, m]) => m.error);
  const styles = [...new Set(malls.map(([h, m]) => conf[h]?.style || m.style).filter(Boolean))];
  const total = malls.reduce((a, [, m]) => a + (m.ads?.length || 0), 0);

  if (!comp) return <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">아직 모은 광고가 없어요. 사무실 PC 가 매일 아침 사입 트래커 다음에 모아요.</div>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        {comp.date} 아침 기준 · 경쟁몰 {malls.length - failed.length}곳 · 게재 중 광고 {total}개 · <b className="text-rose-700">베스트 상품을 광고 중 {groups.out.length}개</b> — 오래 켜 둔 광고일수록 돈을 버는 소재예요(광고주는 안 팔리는 광고를 오래 두지 않아요).
      </p>
      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
        <Pills list={[["", "전체"], ...styles.map((s) => [s, s])]} value={style} onChange={(v) => (setStyle(v), setN(24))} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            정렬
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={SEL}>
              <option value="many">광고 많은 순</option>
              <option value="long">롱런 순</option>
              <option value="new">최근 시작 순</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            소재
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={SEL}>
              <option value="">전체</option>
              <option value="video">🎬 영상</option>
              <option value="image">🖼️ 이미지</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            품목
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={SEL}>
              <option value="">전체</option>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <select value={mall} onChange={(e) => setMall(e.target.value)} className={SEL}>
            <option value="">전체 몰</option>
            {malls.map(([h, m]) => (
              <option key={h} value={h}>
                {m.name} {m.ads?.length ? `· ${m.ads.length}` : m.error ? "· 못 읽음" : ""}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-stone-400">{list.length}개 상품</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {list.slice(0, n).map((g) => (
          <ProductAds key={g.key} g={g} />
        ))}
      </div>
      {list.length > n && (
        <button type="button" onClick={() => setN(n + 24)} className="w-full rounded-lg border border-stone-200 bg-white py-2 text-xs text-stone-600 hover:border-rose-300">
          {list.length - n}개 더 보기
        </button>
      )}
      {!list.length && <p className="rounded-xl border border-dashed border-stone-300 bg-white py-8 text-center text-sm text-stone-400">조건에 맞는 베스트 상품 광고가 없어요.</p>}

      {longOther.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5">
            <span className="text-sm font-bold text-stone-900">
              베스트 밖에서 오래 켜 둔 광고 <span className="font-normal text-stone-400">{longOther.length}</span>
            </span>
            <span className="text-[11px] text-stone-400">21일 넘게 게재 중 · 상품 페이지가 아닌 링크(기획전·메인)도 들어 있어요</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {longOther.slice(0, 32).map((a) => (
              <a key={a.host + a.id} href={libUrl(a.id)} target="_blank" rel="noreferrer" title={a.text} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <span className="relative block aspect-square bg-stone-100">
                  {a.img && <img src={a.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  <span className="absolute top-1 left-1 rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">{a.days}일</span>
                </span>
                <span className="block truncate px-1.5 py-1 text-[10px] text-stone-500">
                  {a.video ? "🎬" : "🖼️"} {a.mall}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {failed.length > 0 && <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500">광고를 못 읽은 곳 {failed.length}: {failed.map(([, m]) => `${m.name}(${m.error})`).join(" · ")}</p>}
    </div>
  );
}

function RefCard({ x, url, onType }) {
  const r = x.r;
  const m = r.meta || {};
  const link = m.url || (typeof r.source === "object" ? r.source?.url : r.source) || "";
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <a href={link || undefined} target="_blank" rel="noreferrer" className="relative block aspect-[9/14] bg-stone-100">
        {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute top-1 left-1 flex gap-1">
          {r.best && <span className="rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">BEST</span>}
          {r.shomanma && <span className="rounded bg-violet-600 px-1 text-[10px] font-bold text-white">쇼만마</span>}
        </span>
        {m.views > 0 && <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] text-white">▶ {man(m.views)}</span>}
      </a>
      <div className="space-y-1 p-2">
        <div className="line-clamp-2 min-h-[2.4em] text-[12px] leading-snug font-medium text-stone-900">{r.title || r.reference?.title || "제목 없음"}</div>
        <div className="truncate text-[10px] text-stone-500">
          {m.name || m.uploader || ""} {m.postedAt && `· ${md(m.postedAt)}`}
        </div>
        <div className="text-[10px] text-stone-500 tabular-nums">
          ♥ {m.likes ?? "—"} · 💬 {m.comments ?? "—"}
        </div>
        <select value={x.t} onChange={(e) => onType(r.id, e.target.value)} className={"w-full rounded-md border px-1 py-0.5 text-[11px] " + (x.manual ? "border-rose-300 text-stone-800" : "border-stone-200 text-stone-500")} title={x.manual ? "직접 고른 유형" : "글로 짐작한 유형 — 틀리면 고르세요"}>
          <option value="">미분류</option>
          {CTYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.icon} {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** (라) 유형별 레퍼런스 — 우리 릴스 라이브러리 */
function TypeRefs({ reels, online, fileUrls, comp, snap }) {
  const [map, setMap] = useState({});
  const [type, setType] = useState("");
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => loadKey("reel_types", online, { map: {} }).then((v) => alive && setMap(v.map || {}));
    load().catch(() => {});
    const off = onSettingsChange((k) => k === "reel_types" && load());
    return () => {
      alive = false;
      off();
    };
  }, [online]);
  const items = useMemo(
    () =>
      (reels || [])
        .filter((r) => r.reference || r.meta)
        .map((r) => ({ r, t: map[r.id] || autoType(r), manual: !!map[r.id] }))
        .sort((a, b) => (b.r.meta?.views || 0) - (a.r.meta?.views || 0) || (b.r.meta?.likes || 0) - (a.r.meta?.likes || 0)),
    [reels, map],
  );
  const count = (k) => items.filter((x) => x.t === k).length;
  const shown = items.filter((x) => (type === "__none" ? !x.t : !type || x.t === type));
  useEffect(() => {
    const keys = shown
      .slice(0, 120)
      .map((x) => `${x.r.id}-thumb.jpg`)
      .filter((k) => !(k in urls));
    if (!keys.length || !fileUrls) return;
    let alive = true;
    fileUrls(keys).then((m) => alive && setUrls((u) => ({ ...u, ...Object.fromEntries(keys.map((k) => [k, m[k] || null])) })));
    return () => {
      alive = false;
    };
  }, [shown, fileUrls, urls]);
  const setT = async (id, t) => {
    setMap((m) => ({ ...m, [id]: t }));
    try {
      await changeKey("reel_types", online, (v) => ({ ...v, map: { ...(v.map || {}), [id]: t } }), { map: {} });
    } catch {
      /* 다음에 다시 */
    }
  };
  // 📈 경쟁몰 베스트 상품 영상 광고 — 쇼만마 '베스트 상품 광고'처럼
  const bestAds = useMemo(() => {
    const out = [];
    for (const [host, m] of Object.entries(comp?.malls || {})) {
      const best = new Map((snap?.malls?.[host]?.items || []).map((x) => [String(x.id), x]));
      for (const a of m.ads || []) if (a.video && a.pid && best.get(a.pid)) out.push({ ...a, mall: m.name, item: best.get(a.pid) });
    }
    return out.sort((a, b) => b.days - a.days).slice(0, 12);
  }, [comp, snap]);
  const groupsToShow = type ? CTYPES.filter((t) => t.key === type) : CTYPES;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        릴스 라이브러리 {items.length}개를 분석 글(훅·구조·장면·캡션)로 나눴어요. 틀린 건 카드 아래에서 고르면 그걸 기억해요. 조회수 → 좋아요 순.
      </p>
      <Pills list={[["", "전체", items.length], ...CTYPES.map((t) => [t.key, `${t.icon} ${t.name}`, count(t.key)]), ["__none", "미분류", count("")]]} value={type} onChange={setType} />
      {type === "__none" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {shown.map((x) => (
            <RefCard key={x.r.id} x={x} url={urls[`${x.r.id}-thumb.jpg`]} onType={setT} />
          ))}
        </div>
      ) : (
        groupsToShow.map((t) => {
          const xs = items.filter((x) => x.t === t.key);
          return (
            <section key={t.key} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5">
                <span className="text-sm font-bold text-stone-900">
                  {t.icon} {t.n} {t.name} <span className="font-normal text-stone-400">{xs.length}</span>
                </span>
                <span className="text-[11px] text-stone-400">
                  {t.desc} · <b className={t.use === "소재 틀" ? "text-rose-700" : "text-stone-500"}>{t.use}</b>
                </span>
              </div>
              {xs.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                  {xs.slice(0, type ? 200 : 8).map((x) => (
                    <RefCard key={x.r.id} x={x} url={urls[`${x.r.id}-thumb.jpg`]} onType={setT} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-400">아직 없어요 — 릴스 기획 라이브러리에 담으면 여기 나와요.</p>
              )}
              {!type && xs.length > 8 && (
                <button type="button" onClick={() => setType(t.key)} className="text-xs text-stone-500 hover:text-rose-700">
                  {t.name} {xs.length - 8}개 더 보기 →
                </button>
              )}
            </section>
          );
        })
      )}
      {!type && bestAds.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stone-900 pb-1.5">
            <span className="text-sm font-bold text-stone-900">📈 경쟁몰 베스트 상품 영상 광고</span>
            <span className="text-[11px] text-stone-400">베스트 상품을 영상으로 오래 광고 중인 것 — 누르면 광고 라이브러리</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {bestAds.map((a) => (
              <a key={a.id} href={libUrl(a.id)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <span className="relative block aspect-square bg-stone-100">
                  {a.img && <img src={a.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  <span className="absolute top-1 left-1 rounded bg-amber-400 px-1 text-[10px] font-bold text-amber-950">{a.days}일째</span>
                </span>
                <span className="block p-2 text-[11px]">
                  <b className="line-clamp-1 text-stone-800">{a.item.name}</b>
                  <span className="text-stone-500">
                    {a.mall} 베스트 {a.item.rank}위
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ContentTrackerPage({ online, reels, fileUrls }) {
  const [tab, setTabState] = useState(() => {
    try {
      return localStorage.getItem(TAB_KEY) || "ads";
    } catch {
      return "ads";
    }
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 무시 */
    }
  };
  const [comp, setComp] = useState(null);
  const [snap, setSnap] = useState(null);
  const [conf, setConf] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, days, malls] = await Promise.all([
        loadKey("comp_ads", online, null).catch(() => null),
        loadKey("tracker_days", online, { items: [] }).catch(() => ({ items: [] })),
        loadKey("tracker_malls", online, { items: [] }).catch(() => ({ items: [] })),
      ]);
      if (!alive) return;
      setComp(c);
      setConf(Object.fromEntries((malls.items || []).map((m) => [m.host, m])));
      const day = c?.date && (days.items || []).includes(c.date) ? c.date : (days.items || [])[0];
      if (day) {
        const s = await loadKey(`tracker_${day}`, online, null).catch(() => null);
        if (alive) setSnap(s);
      }
    })();
    return () => {
      alive = false;
    };
  }, [online]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">콘텐츠 트래커</h2>
          <p className="mt-0.5 text-sm text-stone-500">돈 버는 소재를 찾는 곳 — 경쟁몰이 오래 켜 둔 광고와, 우리 라이브러리의 유형별 레퍼런스.</p>
        </div>
        <Pills
          list={[
            ["ads", "📣 경쟁몰 광고"],
            ["types", "🎞️ 유형별 레퍼런스"],
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "ads" ? <CompAds comp={comp} snap={snap} conf={conf} /> : <TypeRefs reels={reels} online={online} fileUrls={fileUrls} comp={comp} snap={snap} />}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-stone-400">
        <span className="flex items-center gap-1">
          <Megaphone size={11} /> 광고는 메타 광고 라이브러리(로그인 없이 노출 많은 순 30~45개)
        </span>
        <span className="flex items-center gap-1">
          <Flame size={11} /> 30일 넘게 켜 둔 광고 = 롱런
        </span>
        <span className="flex items-center gap-1">
          <Film size={11} /> 우리 소재로 쓸 땐 구조만 빌리고 그대로 베끼지 않기
        </span>
        <ExternalLink size={11} className="hidden" />
      </p>
    </div>
  );
}
