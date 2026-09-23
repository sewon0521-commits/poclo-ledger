import { useMemo, useState } from "react";
import { Search, Link2, Flame, Sprout, X, Plus, Shirt } from "lucide-react";
import { shortName, emptyLook } from "../lib/looks";

/**
 * 룩 단위로 우리 상품 담기 (세원 2026-09-23: "룩 3개를 소개해주는 릴스라면 상품 주소를 다양하게 넣어야 할 텐데").
 *
 * 링크 칸만 늘리면 **어느 상품끼리 한 룩인지**를 알 수 없다(상의+하의가 한 룩이다).
 * 그래서 룩 카드 안에 상품을 담는다. 룩 순서가 곧 대본 순서다.
 *
 *   looks = [{ id, products: [{ no, name, url, image }] }]
 *
 * 담는 방법 셋: 이름으로 찾기(판매 중 전체, product_stats.all) · 링크 붙여넣기 · 잘 팔리는/뜰 상품 칩.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-rose-600";

/** 상품 하나 고르기 — 검색 · 링크 · 빠른 칩 */
export function ProductSearch({ stats, onPick, placeholder, compact }) {
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const all = useMemo(() => stats?.all || [], [stats]);
  const hits = useMemo(() => {
    const n = q.trim().replace(/\s+/g, "").toLowerCase();
    if (!n) return [];
    return all.filter((p) => p.name.replace(/\s+/g, "").toLowerCase().includes(n)).slice(0, 8);
  }, [q, all]);
  const quick = [
    ...(stats?.best || []).slice(0, 6).map((p) => ({ ...p, group: "best" })),
    ...(stats?.rising || []).slice(0, 4).map((p) => ({ ...p, group: "rising" })),
  ];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute top-3 left-3 text-stone-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder || (all.length ? `상품 이름으로 찾기 (판매 중 ${all.length}개)` : "상품 목록은 새벽 갱신 뒤에 생겨요 — 지금은 링크로")}
          className={FIELD + " pl-8 text-sm"}
        />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
            {hits.map((p) => (
              <button
                key={p.no}
                type="button"
                onClick={() => {
                  setQ("");
                  onPick({ ...p, reason: p.q30 ? `최근 30일 ${p.q30}장` : "" });
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50"
              >
                {p.image && <img src={p.image} alt="" className="h-9 w-7 rounded object-cover" loading="lazy" />}
                <span className="min-w-0 flex-1 truncate">{shortName(p.name)}</span>
                {p.q30 > 0 && <span className="text-xs text-stone-400">30일 {p.q30}장</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <span className="relative min-w-0 flex-1">
          <Link2 size={14} className="absolute top-3 left-3 text-stone-400" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="또는 상품 링크" className={FIELD + " pl-8 text-sm"} />
        </span>
        <button
          type="button"
          disabled={!/^https?:\/\//.test(url.trim())}
          onClick={() => {
            onPick({ url: url.trim(), name: "링크로 고른 상품", reason: "" });
            setUrl("");
          }}
          className="rounded-lg bg-stone-800 px-3 text-sm font-medium text-white disabled:bg-stone-300"
        >
          담기
        </button>
      </div>
      {!compact && quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((p) => (
            <button
              key={p.group + p.no}
              type="button"
              onClick={() => onPick(p)}
              title={p.reason}
              className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pr-2.5 pl-1 text-xs hover:border-rose-300"
            >
              {p.image && <img src={p.image} alt="" className="h-5 w-5 rounded-full object-cover" />}
              {p.group === "best" ? <Flame size={10} className="text-rose-600" /> : <Sprout size={10} className="text-emerald-600" />}
              <span className="max-w-[9rem] truncate text-stone-700">{shortName(p.name)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LookPicker({ stats, looks, onChange, label = "이 릴스에 나올 상품" }) {
  const [openLook, setOpenLook] = useState(looks[0]?.id || null);

  const setLook = (id, fn) => onChange(looks.map((l) => (l.id === id ? fn(l) : l)));
  const addLook = () => {
    const l = emptyLook();
    onChange([...looks, l]);
    setOpenLook(l.id);
  };
  const removeLook = (id) => onChange(looks.filter((l) => l.id !== id));
  const addProduct = (id, p) =>
    setLook(id, (l) => (l.products.some((x) => x.url === p.url) ? l : { ...l, products: [...l.products, p] }));
  const removeProduct = (id, url) => setLook(id, (l) => ({ ...l, products: l.products.filter((x) => x.url !== url) }));

  const many = looks.length > 1;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-500">
          {label} {many && <span className="font-normal text-stone-400">· 룩 순서가 대본 순서예요</span>}
        </span>
        <button type="button" onClick={addLook} className="flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50">
          <Plus size={12} /> 룩 추가
        </button>
      </div>

      {looks.map((look, i) => (
        <div key={look.id} className="rounded-xl border border-stone-200 bg-white p-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-rose-800">
              <Shirt size={12} /> 룩 {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-stone-400">
              {look.products.length ? look.products.map((p) => shortName(p.name)).join(" + ") : "상품을 담아주세요"}
            </span>
            {looks.length > 1 && (
              <button type="button" onClick={() => removeLook(look.id)} aria-label="룩 지우기" className="p-0.5 text-stone-300 hover:text-rose-600">
                <X size={14} />
              </button>
            )}
          </div>

          {look.products.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {look.products.map((p) => (
                <span key={p.url} className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 py-1 pr-1 pl-1.5 text-xs">
                  {p.image && <img src={p.image} alt="" className="h-7 w-6 rounded object-cover" />}
                  <span className="max-w-[10rem] truncate text-stone-700">{shortName(p.name)}</span>
                  <button type="button" onClick={() => removeProduct(look.id, p.url)} aria-label="빼기" className="p-0.5 text-stone-400 hover:text-rose-600">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {openLook === look.id ? (
            <ProductSearch stats={stats} onPick={(p) => addProduct(look.id, p)} compact={many} />
          ) : (
            <button type="button" onClick={() => setOpenLook(look.id)} className="text-xs font-medium text-rose-700">
              + 상품 담기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
