import { useMemo, useState } from "react";
import { Check, Plus, Search, X, ZoomIn } from "lucide-react";
import { normalize, photosOf } from "../lib/sinsang";
import { GOODS, goodsKey, goodsAway, goodsOf } from "../lib/styling";

/**
 * 신발·잡화 고르기 — 스타일링 창 안에서 바로 (11/20 밤).
 * 세원: "신발, 잡화 지원이가 보통 고르는데 전보다 헷갈리다고 하네 어떻게 하는게 나으려나?" → 방향성 추천안 OK("일단 진행해봐바").
 * 예전(11/18 b3f1241~)은 한 줄 칩 + 큰 창(GoodsPick — 탭 9개 · 찾기 · 큰 격자)이었다. 헷갈린 까닭: 창을 하나 더 열어야 하고, 고른 건 작은 칩이라 안 보이고,
 * 사무실에 없는 상품(반납함 · 드랍 · 요청)이 섞였고, 탭·숫자·✓ 배지가 많았다. 지금은:
 *   종류마다 한 줄(lib/styling GOODS 순서) · 큰 사진 카드(폰은 옆으로 밀기, PC 는 줄바꿈) · 누르면 바로 체크(분홍 테두리 · ✓).
 *   기본은 지금 사무실에 있는 것만(goodsAway) — 위 '사무실에 없는 것도 보기'로 나머지도(카드에 까닭).
 *   고른 건 창을 열 때 그 줄 맨 앞 — 누르는 동안엔 자리를 안 옮긴다(폰에서 카드가 손가락 밑에서 달아나지 않게).
 *   상품도 직접 적은 것도 없는 줄은 숨김. 찾기는 사무실에 없는 것까지 찾는다(까닭 표시).
 * 저장 모양은 예전 그대로 styling.<key> [{itemId}|{text}] — 모델 시트·촬영 날 화면(stylingLine)이 그대로 읽는다. 저장은 스타일링 창이 알아서.
 */
const cardW = "w-[7.25rem] shrink-0 snap-start sm:w-[7.5rem]";

export default function GoodsBoard({ st, setSt, d, codi, dayCodis = [], onZoom }) {
  const [q, setQ] = useState("");
  const [showAway, setShowAway] = useState(false);
  const [kind, setKind] = useState("shoes");
  const [typed, setTyped] = useState("");
  // 창을 열 때 고른 것 — 이 순서로 줄 맨 앞
  const [front] = useState(() => GOODS.flatMap((p) => (st?.[p.key] || []).map((s) => s.itemId)).filter(Boolean));

  // 이 코디에 어느 칸으로 저장돼 있나(예전에 고른 것은 그 칸 그대로 보여 준다)
  const stored = useMemo(() => {
    const m = new Map();
    for (const p of GOODS) for (const s of st?.[p.key] || []) if (s.itemId && !m.has(s.itemId)) m.set(s.itemId, p.key);
    return m;
  }, [st]);

  const pool = useMemo(() => {
    const rank = new Map(front.map((id, i) => [id, i]));
    const r = (id) => (rank.has(id) ? rank.get(id) : 1e9);
    return d.items
      .map(normalize)
      .map((x) => ({ x, key: stored.get(x.id) || (x.stage !== "trash" ? goodsKey(x) : null), away: goodsAway(x) }))
      .filter((o) => o.key)
      .sort((a, b) => r(a.x.id) - r(b.x.id) || String(b.x.createdAt || "").localeCompare(String(a.x.createdAt || "")));
  }, [d.items, stored, front]);

  // 이날 다른 코디에서 쓴 것 — 그 코디 스타일링에서 고른 것 + 그 코디 상품
  const usedBy = useMemo(() => {
    const m = new Map();
    dayCodis.forEach((c, i) => {
      if (c.id === codi.id) return;
      const mine = new Set([...GOODS.flatMap((p) => (c.styling?.[p.key] || []).map((s) => s.itemId)), ...(c.itemIds || [])].filter(Boolean));
      for (const id of mine) m.set(id, [...(m.get(id) || []), i + 1]);
    });
    return m;
  }, [dayCodis, codi.id]);
  const inCodi = new Set(codi.itemIds || []);

  const qn = q.replace(/\s+/g, "").toLowerCase();
  const hitText = (t) => !qn || String(t || "").replace(/\s+/g, "").toLowerCase().includes(qn);
  const hit = (x) => hitText(`${x.name}${x.fullName || ""}${x.vendor || ""}${x.colors || ""}`);
  const shows = (o) => (qn ? hit(o.x) : stored.has(o.x.id) || !o.away || showAway);
  const awayN = pool.filter((o) => o.away && !stored.has(o.x.id)).length;
  const pickedN = GOODS.reduce((n, p) => n + (st?.[p.key] || []).length, 0);

  const rows = GOODS.map((p) => ({
    p,
    cards: pool.filter((o) => o.key === p.key && shows(o)),
    texts: (st?.[p.key] || []).filter((s) => s.text && hitText(s.text)),
    picked: (st?.[p.key] || []).length,
  })).filter((r) => r.cards.length || r.texts.length);

  const flip = (o) =>
    setSt((s) => {
      const on = GOODS.some((p) => (s[p.key] || []).some((y) => y.itemId === o.x.id));
      if (on) return { ...s, ...Object.fromEntries(GOODS.map((p) => [p.key, (s[p.key] || []).filter((y) => y.itemId !== o.x.id)])) };
      return { ...s, [o.key]: [...(s[o.key] || []), { itemId: o.x.id }] };
    });
  const addTyped = () => {
    const v = typed.trim();
    if (v) setSt((s) => ((s[kind] || []).some((y) => y.text === v) ? s : { ...s, [kind]: [...(s[kind] || []), { text: v }] }));
    setTyped("");
  };
  const dropTyped = (key, text) => setSt((s) => ({ ...s, [key]: (s[key] || []).filter((y) => y.text !== text) }));
  const urlOf = (x) => d.urls[x.photo] || x.photoUrl || "";

  return (
    <div className="space-y-3" data-goods>
      {/* 찾기 · 사무실에 없는 것도 보기 */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm max-sm:basis-full sm:max-w-64">
          <Search size={14} className="shrink-0 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품명 · 거래처 찾기" aria-label="신발·잡화 찾기" className="min-w-0 flex-1 bg-transparent outline-none" />
          {q && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="찾기 지우기" className="text-stone-400 hover:text-stone-700">
              <X size={14} />
            </button>
          )}
        </label>
        {awayN > 0 && !qn && (
          <button
            type="button"
            aria-pressed={showAway}
            onClick={() => setShowAway((v) => !v)}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " +
              (showAway ? "border-stone-700 bg-stone-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")
            }
          >
            {showAway ? "사무실에 있는 것만" : `사무실에 없는 것도 보기 · ${awayN}`}
          </button>
        )}
        {pickedN > 0 && <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 tabular-nums">고른 것 {pickedN}</span>}
      </div>
      {!qn && !showAway && awayN > 0 && <p className="-mt-1.5 text-[11px] text-stone-400">지금 사무실에 있는 것만 보여요 — 요청·드랍·반납한 건 숨겼어요.</p>}

      {!rows.length && (
        <p className="rounded-xl border border-dashed border-stone-200 py-6 text-center text-xs text-stone-400">
          {qn ? "찾는 상품이 없어요 — 다른 말로 찾거나 아래에 직접 적어요." : "사무실에 있는 신발·잡화가 아직 없어요 — 아래에 직접 적어도 돼요."}
        </p>
      )}

      {rows.map(({ p, cards, texts, picked }) => (
        <div key={p.key} data-goods-row={p.key}>
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-stone-700">{p.label}</span>
            <span className="text-[11px] text-stone-400 tabular-nums">{cards.length + texts.length}</span>
            {picked > 0 && <span className="rounded-full bg-rose-700 px-1.5 text-[10px] font-semibold text-white tabular-nums">✓ {picked}</span>}
          </div>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0.5">
            {texts.map((s) => (
              <div key={"t" + s.text} className={cardW + " relative"}>
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-rose-400 bg-rose-50 p-2 text-center">
                  <span className="text-[10px] text-rose-500">직접 적음</span>
                  <span className="line-clamp-4 text-xs font-semibold break-keep text-rose-800">{s.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dropTyped(p.key, s.text)}
                  aria-label={`${s.text} 빼기`}
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-500 shadow hover:text-rose-800"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {cards.map((o) => {
              const x = o.x;
              const on = stored.has(x.id);
              const by = usedBy.get(x.id);
              const url = urlOf(x);
              const urls = [...new Set([url, ...photosOf(x)].filter(Boolean))];
              return (
                <div key={x.id} className={cardW + " group relative min-w-0"}>
                  <button type="button" onClick={() => flip(o)} aria-pressed={on} title={x.name} className="block w-full min-w-0 text-left">
                    <span className={"relative block aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "ring-1 ring-stone-200 group-hover:ring-rose-300")}>
                      {url && <img src={url} alt="" loading="lazy" className={"h-full w-full object-cover " + (o.away && !on ? "opacity-60 grayscale-[35%]" : "")} />}
                      <span
                        className={
                          "absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full shadow " +
                          (on ? "bg-rose-700 text-white" : "border-2 border-white bg-black/15 text-transparent")
                        }
                      >
                        <Check size={14} strokeWidth={3} />
                      </span>
                      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] flex-col items-start gap-0.5">
                        {o.away && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{o.away}</span>}
                        {inCodi.has(x.id) && <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">이 코디 상품</span>}
                        {by && <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">코디{by.join("·")}에서 씀</span>}
                      </span>
                    </span>
                    <span className={"mt-1 line-clamp-2 text-xs leading-snug " + (on ? "font-semibold text-rose-800" : "text-stone-700")}>{x.name}</span>
                    {x.vendor && <span className="mt-0.5 block truncate text-[10px] text-stone-400">{x.vendor}</span>}
                  </button>
                  {urls.length > 0 && onZoom && (
                    <button
                      type="button"
                      onClick={() => onZoom(urls)}
                      aria-label="사진 크게 보기"
                      className="absolute top-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <ZoomIn size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 직접 적기 — 모델 개인 신발 등. 종류를 고르고 적으면 그 줄 맨 앞에 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="직접 적을 종류" className="w-28 shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-2 text-xs max-sm:w-[5.75rem]">
          {GOODS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), addTyped())}
          placeholder={`직접 적기 (예: ${goodsOf(kind)?.place || "모델 개인 신발"})`}
          aria-label="직접 적기"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
        />
        <button type="button" onClick={addTyped} disabled={!typed.trim()} className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-800 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-30">
          <Plus size={13} /> 넣기
        </button>
      </div>
    </div>
  );
}
