import { useMemo, useState } from "react";
import { Search, Link2, Flame, Sprout, Loader2, Sparkles, X, Trash2, ExternalLink, Camera, Clapperboard } from "lucide-react";
import { productReel, candidateOf, fillTemplate } from "../lib/reels";
import { newId } from "../lib/id";
import { CopyButton } from "./ContentBits";
import { Empty } from "./ui";

/**
 * 우리 상품에서 시작하는 릴스 기획 (세원 2026-09-22):
 *   "우리 상품을 내가 말해주거나 링크를 삽입하거나 클릭을 하면 그 상품에 맞는 릴스로 기획하는 게 가능할까?"
 *
 * 상품 고르기 — 이름으로 찾기(판매 중 전체, 새벽 갱신의 product_stats.all) · 링크 붙여넣기 · 잘 팔리는/뜰 것 같은 상품 누르기
 * → 레퍼런스는 '알아서'(라이브러리에서 이 상품에 가장 맞는 구조를 Claude 가 고름) 또는 직접 하나
 * → 빈칸 틀 채운 대본 · 새 대본 · 촬영 순서 · 참고할 상품 사진 · 본문. settings 'reel_plans' 에 쌓인다.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const short = (name) => String(name || "").replace(/^\[[^\]]*\]\s*/, "");
const won = (n) => (n ? new Intl.NumberFormat("ko-KR").format(n) + "원" : "");

function ProductPicker({ stats, onPick }) {
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
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-sm font-semibold text-stone-800">어떤 상품으로 릴스를 만들까요?</div>
      <div className="relative">
        <Search size={14} className="absolute top-3.5 left-3 text-stone-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={all.length ? `상품 이름으로 찾기 — 판매 중 ${all.length}개 (예: 클레어, 벌룬팬츠)` : "상품 목록은 새벽 자동 갱신 뒤에 생겨요 — 지금은 링크로"}
          className={FIELD + " pl-8 text-sm"}
        />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
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
                {p.image && <img src={p.image} alt="" className="h-10 w-8 rounded object-cover" loading="lazy" />}
                <span className="min-w-0 flex-1 truncate">{short(p.name)}</span>
                <span className="text-xs text-stone-400">{p.q30 ? `30일 ${p.q30}장` : won(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <span className="relative min-w-0 flex-1">
          <Link2 size={14} className="absolute top-3.5 left-3 text-stone-400" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="또는 상품 링크 붙여넣기" className={FIELD + " pl-8 text-sm"} />
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
          고르기
        </button>
      </div>
      {quick.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-stone-400">또는 바로 누르기</div>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((p) => (
              <button
                key={p.group + p.no}
                type="button"
                onClick={() => onPick(p)}
                className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pr-3 pl-1 text-xs hover:border-rose-300"
                title={p.reason}
              >
                {p.image && <img src={p.image} alt="" className="h-6 w-6 rounded-full object-cover" />}
                {p.group === "best" ? <Flame size={11} className="text-rose-600" /> : <Sprout size={11} className="text-emerald-600" />}
                <span className="max-w-[10rem] truncate text-stone-700">{short(p.name)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Make({ product, library, onDone, onCancel }) {
  const done = library.filter((i) => i.reference?.structure);
  const [refId, setRefId] = useState("auto");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setMsg("");
    setBusy(true);
    try {
      const pool = refId === "auto" ? done : done.filter((i) => i.id === refId);
      const r = await productReel({
        url: product.url,
        stats: product.reason ? { reason: product.reason } : {},
        candidates: pool.slice(0, 12).map(candidateOf),
        memo,
      });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      const ref = done.find((i) => i.id === r.data.chosen) || null;
      await onDone({
        id: newId("rp"),
        product: { no: product.no || null, name: r.data.productTitle || product.name, url: product.url, image: product.image || r.data.images?.[0] || "", reason: product.reason || "" },
        refId: ref?.id || "",
        refTitle: ref ? ref.reference?.title || ref.title : "",
        auto: refId === "auto",
        memo,
        plan: r.data,
        filled: r.data.filled || [],
        createdAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start gap-3">
        {product.image && <img src={product.image} alt="" className="h-20 w-16 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-stone-900">{short(product.name)}</div>
          {product.reason && <div className="mt-0.5 text-xs text-rose-700">{product.reason}</div>}
          <a href={product.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
            <ExternalLink size={11} /> 상품 페이지
          </a>
        </div>
        <button type="button" onClick={onCancel} aria-label="다른 상품" className="p-1 text-stone-400 hover:text-stone-700">
          <X size={18} />
        </button>
      </div>
      <label className="block text-xs font-semibold text-stone-500">
        어떤 레퍼런스 구조로?
        <select value={refId} onChange={(e) => setRefId(e.target.value)} className={FIELD + " mt-1 text-sm font-normal"}>
          <option value="auto">알아서 골라줘 — 라이브러리 {done.length}개 중 이 상품에 가장 맞는 것</option>
          {done.map((i) => (
            <option key={i.id} value={i.id}>
              {i.reference?.title || i.title} · {i.reference?.structure?.hookType || ""}
            </option>
          ))}
        </select>
      </label>
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 출근룩으로, 셀카 정적 움직임으로 찍을 것" className={FIELD + " text-sm"} />
      {msg && <p className="text-sm text-rose-700">{msg}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {busy ? "상품 사진·레퍼런스 보고 기획하는 중… (1분쯤)" : "이 상품으로 릴스 기획"}
      </button>
    </div>
  );
}

function PlanView({ item, library, onRemove, onOpenRef, onClose }) {
  const p = item.plan || {};
  const ref = library.find((i) => i.id === item.refId);
  const tpl = ref?.reference?.template;
  const filledScript = tpl ? fillTemplate(tpl, item.filled) : "";
  return (
    <div className="flex max-h-[92vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-stone-900">릴스 · {short(item.product?.name)}</h2>
          <div className="mt-0.5 text-xs text-stone-500">
            {item.refTitle ? `레퍼런스: ${item.refTitle}${item.auto ? " (알아서 고름)" : ""}` : "레퍼런스 없이 기본 판매형 구조"}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
          <X size={20} />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {p.chosenWhy && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950">
            <div className="text-xs font-semibold text-rose-800">왜 이 구조</div>
            <p className="mt-0.5 leading-relaxed">{p.chosenWhy}</p>
            {ref && (
              <button type="button" onClick={() => onOpenRef(ref)} className="mt-1 text-xs font-medium text-rose-700 underline">
                레퍼런스 열어 보기
              </button>
            )}
          </div>
        )}
        <div className="rounded-xl bg-stone-50 px-3 py-2.5">
          <div className="text-xs font-semibold text-stone-500">첫 1~3초 훅</div>
          <p className="mt-0.5 font-semibold text-stone-900">{p.hook}</p>
        </div>
        {filledScript && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500">레퍼런스 틀에 채운 대본</span>
              <CopyButton text={filledScript} />
            </div>
            <p className="rounded-xl border border-stone-200 px-3 py-2.5 leading-relaxed whitespace-pre-wrap text-stone-800">{filledScript}</p>
          </div>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">AI가 새로 쓴 대본</span>
            <CopyButton text={p.script || ""} />
          </div>
          <p className="rounded-xl border border-stone-200 px-3 py-2.5 leading-relaxed whitespace-pre-wrap text-stone-800">{p.script}</p>
        </div>
        {p.scenes?.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">촬영 순서</div>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
              {p.scenes.map((s, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="w-14 shrink-0 text-xs text-stone-400">{s.at}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-stone-700">{s.shot}</span>
                    {s.text && <span className="block text-xs text-rose-700">“{s.text}”</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.shots?.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-stone-500">
              <Camera size={12} /> 이런 컷처럼 찍기 (상품 사진)
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {p.shots.map((s, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-stone-200">
                  {s.photo > 0 && p.images?.[s.photo - 1] ? (
                    <img src={p.images[s.photo - 1]} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-stone-100 text-stone-300">
                      <Camera size={18} />
                    </div>
                  )}
                  <p className="px-2 py-1.5 text-[11px] leading-snug text-stone-600">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-xl bg-stone-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">인스타 본문</span>
            <CopyButton text={`${p.caption || ""}\n\n${(p.hashtags || []).join(" ")}`} label="본문 복사" />
          </div>
          <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">{p.caption}</p>
          <p className="mt-1.5 text-xs text-stone-500">{(p.hashtags || []).join(" ")}</p>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 릴스 기획안을 지울까요?")) {
              onRemove(item.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
        >
          <Trash2 size={13} /> 지우기
        </button>
        <a href={item.product?.url} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline">
          상품 페이지 열기
        </a>
      </footer>
    </div>
  );
}

export default function ProductReelTab({ stats, library, plans, onSavePlan, onRemovePlan, onOpenRef }) {
  const [product, setProduct] = useState(null);
  const [view, setView] = useState(null);

  return (
    <div className="space-y-4">
      {product ? (
        <Make
          product={product}
          library={library}
          onCancel={() => setProduct(null)}
          onDone={async (item) => {
            await onSavePlan(item);
            setProduct(null);
            setView(item);
          }}
        />
      ) : (
        <ProductPicker stats={stats} onPick={setProduct} />
      )}

      {plans.length === 0 ? (
        <Empty title="아직 만든 상품 릴스 기획이 없어요." hint="위에서 상품을 고르면 라이브러리의 잘 된 릴스 구조로 기획해요." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <button key={p.id} type="button" onClick={() => setView(p)} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-rose-300 hover:shadow-sm">
              {p.product?.image ? (
                <img src={p.product.image} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
                  <Clapperboard size={20} />
                </span>
              )}
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium text-stone-900">{short(p.product?.name)}</span>
                <span className="mt-1 line-clamp-2 block text-xs font-semibold text-rose-700">{p.plan?.hook}</span>
                <span className="mt-1 block truncate text-[11px] text-stone-400">
                  {p.refTitle || "기본 구조"} · {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {view && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setView(null)} className="absolute inset-0 cursor-default" />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <PlanView
              item={plans.find((x) => x.id === view.id) || view}
              library={library}
              onRemove={onRemovePlan}
              onOpenRef={(ref) => {
                setView(null);
                onOpenRef(ref);
              }}
              onClose={() => setView(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
