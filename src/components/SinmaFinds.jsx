import { useEffect, useMemo, useState } from "react";
import { Star, ExternalLink, Search } from "lucide-react";
import { loadKey, onSettingsChange, watchKeys, photoUrls } from "../lib/shoot";

/**
 * 신마 후보 (11/11 세원 "erp에만 올리면 돼, 짜피 신마 보고 해야 되니까" — 임세원_개인 창이 어사이드로 찾아 넣는다)
 * 저장: settings `sinma_finds_<소싱 회차 id>` = {folder(신마 찜 폴더), at, items:[{gid, url, name, store, loc, price, mix, kind,
 *   refId(회차 refIds 의 촬영 레퍼런스), refNo(세원이 부르는 사진 번호), cls(같은 옷|비슷|더 싼 대안), pick(추천), why, photo(reels 버킷 sinsang/<gid>.jpg), addedOn}]}
 * 화면: 소싱 회차 창 — 레퍼런스 사진 칸 '신마 N' 배지 · 사진 크게 보기 안 '신마 후보' · 회차 창 아래 '신마 후보' 전체(사진 번호별).
 * 신상 관리 '요청'과는 섞지 않는다(실제 픽업 요청이 아니라서). 고르기·담기는 세원이 신마에서 직접.
 */

const sinmaKey = (sessionId) => `sinma_finds_${sessionId}`;

export function useSinma(sessionId, online) {
  const [data, setData] = useState(null);
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    const key = sinmaKey(sessionId);
    const load = () =>
      loadKey(key, online, null)
        .then((v) => alive && setData(v && Array.isArray(v.items) ? v : null))
        .catch(() => {});
    load();
    const off1 = onSettingsChange((k) => k === key && load());
    const off2 = watchKeys([key], load, 30000);
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, [sessionId, online]);
  const keys = useMemo(() => [...new Set((data?.items || []).map((x) => x.photo).filter(Boolean))].sort().join("|"), [data]);
  useEffect(() => {
    if (!keys) return undefined;
    let alive = true;
    photoUrls(keys.split("|"), online)
      .then((m) => alive && setUrls(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [keys, online]);
  return { data, urls };
}

const CLS_STYLE = {
  "같은 옷": "bg-emerald-100 text-emerald-800",
  비슷: "bg-stone-100 text-stone-600",
  "더 싼 대안": "bg-sky-100 text-sky-800",
};
const won = (n) => (Number(n) ? `${Number(n).toLocaleString()}원` : "");

export function SinmaCard({ x, url }) {
  return (
    <a
      href={x.url || (x.gid ? `https://sinsangmarket.kr/goods/${x.gid}/0` : undefined)}
      target="_blank"
      rel="noreferrer"
      title="신마에서 열기"
      className={"group block min-w-0 overflow-hidden rounded-xl border bg-white transition-colors hover:border-rose-300 " + (x.pick ? "border-amber-300" : "border-stone-200")}
    >
      <span className="relative block aspect-[3/4] w-full bg-stone-100">
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-stone-400">사진 준비 중</span>
        )}
        {x.pick && (
          <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            <Star size={10} fill="currentColor" /> 추천
          </span>
        )}
        {x.cls && <span className={"absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow-sm " + (CLS_STYLE[x.cls] || "bg-white text-stone-600")}>{x.cls}</span>}
        <ExternalLink size={13} className="absolute right-1.5 bottom-1.5 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
      </span>
      <span className="block space-y-0.5 p-2">
        <span className="flex items-baseline justify-between gap-1">
          <b className="text-sm font-bold text-stone-900 tabular-nums">{won(x.price) || "가격 —"}</b>
          {x.kind && <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-500">{x.kind}</span>}
        </span>
        <span className="block truncate text-[11px] text-stone-600" title={x.name}>
          {x.name}
        </span>
        <span className="block truncate text-[11px] text-stone-400" title={[x.store, x.loc].filter(Boolean).join(" · ")}>
          {[x.store, x.loc].filter(Boolean).join(" · ")}
        </span>
        {x.why && <span className="line-clamp-2 block text-[11px] leading-snug text-stone-700">{x.why}</span>}
      </span>
    </a>
  );
}

/** 추천 먼저, 그다음 같은 옷 → 비슷 → 더 싼 대안, 같으면 싼 것 먼저 */
const CLS_ORDER = { "같은 옷": 0, 비슷: 1, "더 싼 대안": 2 };
const sortFinds = (xs) => [...xs].sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (CLS_ORDER[a.cls] ?? 3) - (CLS_ORDER[b.cls] ?? 3) || (a.price || 0) - (b.price || 0));

/** 사진 크게 보기 안 — 그 레퍼런스 사진의 후보만 */
export function SinmaStrip({ items, urls }) {
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const picks = items.filter((x) => x.pick);
  const shown = sortFinds(all || !picks.length ? items : picks);
  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Search size={14} className="text-amber-700" />
        <b className="text-sm text-stone-900">신마 후보 {items.length}</b>
        {picks.length > 0 && <span className="text-xs text-amber-800">★ 추천 {picks.length}</span>}
        {picks.length > 0 && picks.length < items.length && (
          <button type="button" onClick={() => setAll(!all)} className="ml-auto rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            {all ? "추천만 보기" : `전부 보기 (${items.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((x) => (
          <SinmaCard key={x.gid + (x.refId || "")} x={x} url={urls[x.photo]} />
        ))}
      </div>
    </section>
  );
}

/** 회차 창 아래 — 전체 후보를 사진 번호별로 */
export function SinmaBoard({ data, urls, refs, src }) {
  const [only, setOnly] = useState("pick"); // pick | all | 같은 옷 | 비슷 | 더 싼 대안
  const [open, setOpen] = useState(true);
  const items = data?.items || [];
  if (!items.length) return null;
  const picks = items.filter((x) => x.pick).length;
  const pass = (x) => (only === "all" ? true : only === "pick" ? x.pick : x.cls === only);
  const groups = new Map();
  for (const x of sortFinds(items.filter(pass))) {
    const k = x.refId || `n${x.refNo ?? ""}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const keys = [...groups.keys()].sort((a, b) => (groups.get(a)[0].refNo ?? 99) - (groups.get(b)[0].refNo ?? 99));
  const chip = (k, label) => (
    <button
      key={k}
      type="button"
      onClick={() => setOnly(k)}
      className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (only === k ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300")}
    >
      {label}
    </button>
  );
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <Search size={15} className="text-amber-700" />
        <b className="text-sm text-stone-900">신마 후보 {items.length}</b>
        <span className="text-xs text-amber-800">★ 추천 {picks}</span>
        {data.folder && <span className="text-xs text-stone-400">· 신마 찜 폴더 '{data.folder}'</span>}
        <span className="ml-auto text-xs text-stone-400">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <>
          <p className="mt-1 text-[11px] text-stone-500">어사이드가 레퍼런스 사진마다 신마에서 찾은 후보예요. 누르면 신마 상품이 열려요 — 고르기·샘플 요청은 신마에서.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chip("pick", `★ 추천 ${picks}`)}
            {chip("all", `전체 ${items.length}`)}
            {["같은 옷", "비슷", "더 싼 대안"].map((c) => {
              const n = items.filter((x) => x.cls === c).length;
              return n ? chip(c, `${c} ${n}`) : null;
            })}
          </div>
          {!keys.length && <p className="mt-3 text-xs text-stone-400">이 조건에 맞는 후보가 없어요.</p>}
          <div className="mt-3 space-y-4">
            {keys.map((k) => {
              const list = groups.get(k);
              const r = refs.find((y) => y.id === list[0].refId);
              const pic = r ? src(r) : "";
              return (
                <div key={k}>
                  <div className="mb-1.5 flex items-center gap-2">
                    {pic && <img src={pic} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />}
                    <span className="text-xs font-semibold text-stone-700">
                      {list[0].refNo != null ? `${list[0].refNo}번 사진` : "레퍼런스"} · 후보 {list.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {list.map((x) => (
                      <SinmaCard key={x.gid + k} x={x} url={urls[x.photo]} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
