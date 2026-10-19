import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";
import { loadKey, onSettingsChange } from "../lib/shoot";
import { won } from "../lib/sales";
import { dayTitle } from "../lib/journal";

/**
 * 보고 › 사입 트래커 (2026-10-19, 위키 topics/보고-체계-설계.md).
 * 쇼만마 사입 트래커 구성(스타일 6갈래 · 몰별 베스트 순위 · NEW/▲/▼/이탈)을 우리가 직접 모은 숫자로.
 * 사무실 PC poclo-cafe24/tracker.py 가 매일 아침(아침 보고 전) 경쟁몰 베스트 상위 30개를 읽어 settings 'tracker_<날짜>' 에 둔다.
 */

const STYLES = ["러블리·데일리", "캐주얼·데일리", "로맨틱·페미닌", "미니멀·오피스", "유니크"];

function badgeOf(it, first) {
  if (it.gone) return ["이탈", "bg-stone-700 text-white"];
  if (it.prev == null) return first ? null : ["NEW", "bg-rose-700 text-white"];
  if (it.prev > it.rank) return [`▲${it.prev - it.rank}`, "bg-emerald-600 text-white"];
  if (it.prev < it.rank) return [`▼${it.rank - it.prev}`, "bg-stone-500 text-white"];
  return null;
}

function Item({ it, first }) {
  const b = badgeOf(it, first);
  return (
    <a href={it.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[3/4] bg-stone-100">
        {it.img && <img src={it.img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
        {b && <span className={"absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold shadow-sm " + b[1]}>{b[0]}</span>}
        {it.streak >= 3 && <span className="absolute top-1.5 right-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm">{it.streak}일 연속</span>}
      </div>
      <div className="space-y-0.5 p-2">
        <div className="truncate text-[11px] text-stone-500">
          {it.style} · <b className="text-stone-700">{it.mall}</b> {it.gone ? `어제 ${it.prev}위` : `${it.rank}위`}
        </div>
        <div className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-snug text-stone-900">{it.name || "이름 없음"}</div>
        {it.price > 0 && <div className="text-[13px] font-bold text-stone-900 tabular-nums">{won(it.price)}원</div>}
      </div>
    </a>
  );
}

function Section({ title, sub, list, first, limit = 20, open: startOpen = true }) {
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((it) => (
              <Item key={it.mallHost + it.id + (it.gone ? "g" : "")} it={it} first={first} />
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

export default function TrackerPage({ online }) {
  const [days, setDays] = useState([]);
  const [day, setDay] = useState("");
  const [snap, setSnap] = useState(null);
  const [state, setState] = useState("loading");
  const [style, setStyle] = useState("");
  const [mall, setMall] = useState("");

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
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    loadDays();
    return onSettingsChange((k) => k === "tracker_days" && loadDays());
  }, [loadDays]);
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

  const first = !!snap?.summary?.first;
  const malls = useMemo(() => Object.entries(snap?.malls || {}).map(([host, m]) => ({ host, ...m })), [snap]);
  const flat = useMemo(() => {
    const out = [];
    for (const m of malls) {
      if (style && m.style !== style) continue;
      if (mall && m.host !== mall) continue;
      for (const it of m.items || []) out.push({ ...it, mall: m.name, style: m.style, mallHost: m.host });
      for (const it of m.dropped || []) out.push({ ...it, mall: m.name, style: m.style, mallHost: m.host, gone: true });
    }
    return out;
  }, [malls, style, mall]);
  const live = flat.filter((x) => !x.gone);
  const isNew = live.filter((x) => x.prev == null && !first).sort((a, b) => a.rank - b.rank);
  const up = live.filter((x) => x.prev && x.prev > x.rank).sort((a, b) => b.prev - b.rank - (a.prev - a.rank) || a.rank - b.rank);
  const down = live.filter((x) => x.prev && x.prev < x.rank).sort((a, b) => b.rank - b.prev - (a.rank - a.prev));
  const gone = flat.filter((x) => x.gone).sort((a, b) => a.prev - b.prev);
  const steady = live.filter((x) => x.streak >= 3 && x.rank <= 10).sort((a, b) => b.streak - a.streak || a.rank - b.rank);
  const top = live.filter((x) => x.rank <= 5).sort((a, b) => a.rank - b.rank || a.mall.localeCompare(b.mall));
  const failed = malls.filter((m) => m.error);
  const styleCount = (s) => malls.filter((m) => m.style === s && !m.error).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">사입 트래커</h2>
          <p className="mt-0.5 text-sm text-stone-500">경쟁몰 베스트 순위를 매일 아침 모아요. 새로 들어온 것·오른 것·오래 버티는 것을 보고 사입을 정해요.</p>
        </div>
        {days.length > 0 && (
          <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-semibold text-stone-800">
            {days.map((d) => (
              <option key={d} value={d}>
                {dayTitle(d)}
              </option>
            ))}
          </select>
        )}
      </div>

      {state === "loading" && <p className="py-10 text-center text-sm text-stone-400">불러오는 중…</p>}
      {state === "error" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">트래커를 불러오지 못했어요.</p>}
      {state === "empty" && <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-500">아직 모은 기록이 없어요. 사무실 PC 가 매일 아침 모아요{online ? "." : " (공유 장부로 로그인해야 보여요)."}</div>}

      {state === "ready" && snap && (
        <>
          <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              <button type="button" onClick={() => setStyle("")} className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (!style ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}>
                여성 쇼핑몰 종합 <span className="opacity-60">{malls.filter((m) => !m.error).length}</span>
              </button>
              {STYLES.map((s) => (
                <button key={s} type="button" onClick={() => setStyle(style === s ? "" : s)} className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (style === s ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}>
                  {s} <span className="opacity-60">{styleCount(s)}</span>
                </button>
              ))}
              <select value={mall} onChange={(e) => setMall(e.target.value)} className="ml-auto shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600">
                <option value="">전체 몰</option>
                {malls
                  .filter((m) => !style || m.style === style)
                  .map((m) => (
                    <option key={m.host} value={m.host}>
                      {m.name}
                      {m.error ? " (못 읽음)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-stone-500 tabular-nums">
              <span>
                {snap.summary?.ok}/{snap.summary?.malls}곳 · 갱신 {snap.date}
              </span>
              {first ? (
                <span className="text-amber-700">첫 수집이에요 — 내일부터 NEW·순위 변화가 보여요</span>
              ) : (
                <>
                  <span>
                    <b className="text-rose-700">NEW {isNew.length}</b>
                  </span>
                  <span className="text-emerald-700">▲ {up.length}</span>
                  <span>▼ {down.length}</span>
                  <span>이탈 {gone.length}</span>
                </>
              )}
            </div>
          </div>

          <Section title="NEW — 새로 베스트에 들어온 상품" sub="어제 없던 것" list={isNew} first={first} />
          <Section title="▲ 순위가 오른 상품" sub="어제보다 위로" list={up} first={first} />
          <Section title="오래 버티는 상품" sub="3일 넘게 10위 안" list={steady} first={first} />
          <Section title="몰별 베스트 TOP 5" sub="오늘 순위" list={top} first={first} limit={25} open={first || !isNew.length} />
          <Section title="▼ 순위가 내린 상품" sub="어제보다 아래로" list={down} first={first} open={false} />
          <Section title="이탈 — 베스트에서 빠진 상품" sub="어제 있었는데 오늘 없음" list={gone} first={first} open={false} />

          {failed.length > 0 && (
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
              못 읽은 곳 {failed.length}: {failed.map((m) => `${m.name}(${m.error})`).join(" · ")}
            </p>
          )}
        </>
      )}
      <p className="px-1 text-[11px] text-stone-400">
        <ExternalLink size={11} className="mr-0.5 inline align-[-1px]" /> 상품을 누르면 그 몰 상품 페이지가 열려요. 몰 목록·스타일은 쇼만마 트래커 기준으로 시작했어요(바꾸고 싶으면 말해 주세요).
      </p>
    </div>
  );
}
