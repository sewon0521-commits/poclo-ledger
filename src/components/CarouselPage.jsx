import { useEffect, useMemo, useState } from "react";
import {
  GalleryHorizontal,
  Flame,
  Sprout,
  Link2,
  ImagePlus,
  Loader2,
  Wand2,
  X,
  Trash2,
  Info,
  TrendingUp,
  RotateCw,
  Camera,
  ExternalLink,
  Check,
} from "lucide-react";
import { newId } from "../lib/id";
import { analyzeCarousel, planCarousel, shrinkImage, refSummary } from "../lib/carousel";
import { workerAlive } from "../lib/reels";
import { CopyButton, WorkerStatus, EditableTitle } from "./ContentBits";
import { Empty } from "./ui";

/**
 * 캐러셀 기획 (2026-09-22 세원):
 *   "가장 잘 판매되는 상품들, 뜰 수 있을 것 같은 상품들을 분석해서 캐러셀 콘텐츠를 만들 수 있게.
 *    잘 팔릴 상품들은 우리의 캐러셀 레퍼런스, 릴스 레퍼런스에서 보면서 학습 후 진행."
 *
 *  1. 상품에서 시작 — 새벽 갱신(poclo-cafe24/product_stats.py)이 올린 '잘 팔리는 / 뜰 것 같은' 상품.
 *  2. 캐러셀 레퍼런스 — 인스타 링크(사무실 PC 분석기가 장 사진을 받음) 또는 사진 여러 장 올리기.
 *  3. 기획안 — 상품 + 레퍼런스(캐러셀·릴스) 요약을 보내 장별 기획. 상품 상세 사진 중 몇 번을 쓸지까지.
 *
 * 저장: settings 'carousels' · 'carousel_plans' · 'product_stats'. 장 사진은 Storage 'reels' 버킷 c-<id>-<n>.jpg.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const won = (n) => (n ? new Intl.NumberFormat("ko-KR").format(n) + "원" : "");
const isInsta = (s) => /instagram\.com\/(?:[^/]+\/)?(p|reels?|tv)\//i.test(s.trim());

function Overlay({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={"relative z-10 w-full overflow-hidden rounded-2xl bg-white shadow-xl " + (wide ? "max-w-4xl" : "max-w-2xl")}>
        {children}
      </div>
    </div>
  );
}

function Head({ title, sub, onClose, onTitle }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
      <div className="min-w-0">
        {onTitle ? (
          <EditableTitle value={title} onChange={onTitle} />
        ) : (
          <h2 className="truncate font-semibold text-stone-900">{title}</h2>
        )}
        {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 shrink-0 p-1 text-stone-400 hover:text-stone-700">
        <X size={20} />
      </button>
    </header>
  );
}

// ------------------------------------------------------------------ 1) 상품에서 시작

function ProductCard({ p, group, onPick, checked, onCheck }) {
  return (
    <div
      className={
        "relative rounded-xl border bg-white transition hover:shadow-sm " +
        (checked ? "border-rose-500 ring-2 ring-rose-200" : "border-stone-200 hover:border-rose-300")
      }
    >
    <button
      type="button"
      onClick={() => onPick([{ ...p, group }])}
      className="flex w-full gap-3 p-2.5 pr-10 text-left"
    >
      {p.image ? (
        <img src={p.image} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <span className="h-20 w-16 shrink-0 rounded-lg bg-stone-100" />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium text-stone-900">{p.name}</span>
        <span className={"mt-1 block text-xs " + (group === "best" ? "text-rose-700" : "text-emerald-700")}>{p.reason}</span>
        <span className="mt-0.5 block text-[11px] text-stone-400">{won(p.price)}</span>
      </span>
    </button>
    <button
      type="button"
      onClick={() => onCheck({ ...p, group })}
      aria-pressed={checked}
      title="묶음 캐러셀에 넣기"
      className={
        "absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border " +
        (checked ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white text-transparent hover:text-stone-300")
      }
    >
      <Check size={15} />
    </button>
    </div>
  );
}

function ProductsTab({ stats, onPick }) {
  const [url, setUrl] = useState("");
  // 묶음 캐러셀 (세원 9/22: "잘 나가는 상품 몇 개를 묶어서 만드는 캐러셀도") — 고른 순서대로
  const [sel, setSel] = useState([]);
  const check = (p) =>
    setSel((s) => (s.some((x) => x.no === p.no) ? s.filter((x) => x.no !== p.no) : s.length >= 6 ? s : [...s, p]));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="상품 주소로 바로 — https://ppoclo.cafe24.com/product/…"
          className={FIELD + " min-w-0 flex-1 text-sm"}
        />
        <button
          type="button"
          disabled={!/^https?:\/\//.test(url.trim())}
          onClick={() => onPick([{ url: url.trim(), name: "직접 고른 상품", reason: "" }])}
          className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          이 상품으로 기획
        </button>
      </div>

      {!stats ? (
        <Empty
          title="상품 순위가 아직 없어요."
          hint="새벽 1시 자동 갱신이 채워요. 지금 바로 보려면 poclo-cafe24 폴더의 6_하루갱신.bat 을 실행하세요."
        />
      ) : (
        <>
          {[
            ["rising", "뜰 것 같은 상품", Sprout, "text-emerald-700", "최근 7일에 확 늘었거나, 등록 3주 안에 빨리 팔리는 신상"],
            ["best", "잘 팔리는 상품", Flame, "text-rose-700", "최근 30일 판매 수량 순"],
          ].map(([key, label, Icon, tone, hint]) => (
            <section key={key}>
              <h3 className={"flex items-center gap-1.5 font-semibold " + tone}>
                <Icon size={16} /> {label} <span className="text-sm font-normal text-stone-400">{(stats[key] || []).length}</span>
              </h3>
              <p className="mb-2 text-xs text-stone-400">{hint} · 누르면 그 상품 하나로, 오른쪽 위 체크로 여러 개를 묶어서</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(stats[key] || []).slice(0, key === "best" ? 12 : 12).map((p) => (
                  <ProductCard
                    key={p.no}
                    p={p}
                    group={key}
                    onPick={onPick}
                    checked={sel.some((x) => x.no === p.no)}
                    onCheck={check}
                  />
                ))}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-stone-400">
            {stats.updated?.replace("T", " ")} 기준 · 취소·반품 뺀 수량 · 새벽 자동 갱신 때마다 바뀌어요
          </p>
        </>
      )}

      {sel.length > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex -space-x-2">
            {sel.map((p) =>
              p.image ? (
                <img key={p.no} src={p.image} alt="" className="h-10 w-8 rounded-md border-2 border-white object-cover" />
              ) : null,
            )}
          </div>
          <span className="min-w-0 flex-1 text-sm text-stone-700">
            <b className="font-semibold text-rose-800">{sel.length}개</b> 묶음 캐러셀
            <span className="block truncate text-xs text-stone-400">{sel.map((p) => p.name.replace(/^\[[^\]]*\]\s*/, "")).join(" · ")}</span>
          </span>
          <button type="button" onClick={() => setSel([])} className="text-xs text-stone-400 hover:text-stone-700">
            비우기
          </button>
          <button
            type="button"
            disabled={sel.length < 2}
            onClick={() => onPick(sel)}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {sel.length < 2 ? "2개 이상 고르세요" : "묶어서 기획하기"}
          </button>
        </div>
      )}
    </div>
  );
}

/** 상품을 고르면 — 참고할 레퍼런스를 고르고 기획을 만든다 */
function Planner({ products, carousels, reels, onDone, onClose }) {
  const many = products.length > 1;
  const doneC = carousels.filter((c) => c.analysis);
  const doneR = reels.filter((r) => r.reference?.structure);
  // 기본으로 켜 둘 것: 캐러셀은 최근 6개, 릴스는 성과 분석이 있는 것 먼저 4개
  const [pick, setPick] = useState(() => {
    const r = [...doneR].sort((a, b) => (b.reference?.performance?.summary ? 1 : 0) - (a.reference?.performance?.summary ? 1 : 0));
    return new Set([...doneC.slice(0, 6).map((c) => c.id), ...r.slice(0, 4).map((x) => x.id)]);
  });
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggle = (id) =>
    setPick((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = async () => {
    setMsg("");
    setBusy(true);
    try {
      const refs = [
        ...doneC.filter((c) => pick.has(c.id)).map((c) => refSummary(c, "carousel")),
        ...doneR.filter((r) => pick.has(r.id)).map((r) => refSummary(r, "reel")),
      ];
      const list = products.map((p) => ({
        url: p.url,
        stats: p.reason ? { reason: p.reason, group: p.group, q7: p.q7, p7: p.p7, q30: p.q30 } : {},
      }));
      const r = await planCarousel({ products: list, refs, memo });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      await onDone({
        id: newId("cp"),
        // 목록 카드는 첫 상품을 대표로 쓴다 (예전 기획안과 같은 모양)
        product: {
          no: products[0].no || null,
          name: many ? `${products.length}개 묶음 · ${r.data.productTitles?.[0] || products[0].name}` : r.data.productTitle || products[0].name,
          url: products[0].url,
          image: products[0].image || r.data.images?.[0] || "",
          reason: many ? products.map((p) => p.reason).filter(Boolean).join(" / ") : products[0].reason,
          group: products[0].group || "",
        },
        products: products.map((p, i) => ({
          no: p.no || null,
          name: r.data.productTitles?.[i] || p.name,
          url: p.url,
          image: p.image || r.data.productImages?.[i]?.[0] || "",
          reason: p.reason || "",
        })),
        refs: refs.map((x) => ({ title: x.title, kind: x.kind })),
        memo,
        plan: r.data,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  const Pick = ({ id, title, sub }) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50">
      <input type="checkbox" checked={pick.has(id)} onChange={() => toggle(id)} className="mt-1 accent-rose-700" />
      <span className="min-w-0">
        <span className="block truncate text-stone-800">{title}</span>
        {sub && <span className="block truncate text-[11px] text-stone-400">{sub}</span>}
      </span>
    </label>
  );

  return (
    <div className="flex max-h-[90vh] flex-col">
      <Head
        title={many ? `묶음 캐러셀 만들기 · 상품 ${products.length}개` : "캐러셀 기획 만들기"}
        sub={many ? "고른 상품을 하나의 주제로 엮어요" : products[0].name}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className={"grid gap-2 " + (many ? "sm:grid-cols-2" : "")}>
          {products.map((product, i) => (
            <div key={product.no || product.url} className="flex gap-3 rounded-xl bg-stone-50 p-3">
              {product.image && <img src={product.image} alt="" className={(many ? "h-16 w-12" : "h-24 w-20") + " shrink-0 rounded-lg object-cover"} />}
              <div className="min-w-0 text-sm">
                <div className="font-medium text-stone-900">
                  {many && <span className="mr-1 rounded bg-rose-700 px-1 text-[10px] text-white">상품 {i + 1}</span>}
                  {product.name}
                </div>
                {product.reason && <div className="mt-1 text-xs text-rose-700">{product.reason}</div>}
                <a href={product.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-sky-700 hover:underline">
                  <ExternalLink size={11} /> 상품 페이지
                </a>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">
            보고 배울 레퍼런스 — 체크한 것의 표지 훅·구조·성과를 보고 틀을 빌려요
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <div className="px-2 pt-1 text-[11px] font-semibold text-stone-400">캐러셀 {doneC.length}</div>
              {doneC.length === 0 && <p className="px-2 py-1 text-xs text-stone-400">아직 없어요 — '캐러셀 레퍼런스' 탭에서 모으세요</p>}
              {doneC.map((c) => (
                <Pick key={c.id} id={c.id} title={c.analysis?.title || c.title} sub={c.analysis?.format} />
              ))}
            </div>
            <div>
              <div className="px-2 pt-1 text-[11px] font-semibold text-stone-400">릴스 {doneR.length}</div>
              {doneR.map((r) => (
                <Pick key={r.id} id={r.id} title={r.reference?.title || r.title} sub={r.reference?.structure?.hookType} />
              ))}
            </div>
          </div>
        </div>

        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={many ? "메모 (선택) — 예: 가을 니트 3종 비교, 같이 입는 코디로 엮기" : "메모 (선택) — 예: 출근룩으로, 7장 이내, 가격 강조"}
          className={FIELD + " h-20 resize-y text-sm"}
        />
        {msg && <p className="text-sm text-rose-700">{msg}</p>}
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {busy
            ? `상품 사진 보고 기획하는 중… (${many ? "1~2분" : "1분쯤"})`
            : `${many ? "묶음 " : ""}기획 만들기 · 레퍼런스 ${pick.size}개 참고`}
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ 기획안 보기

function SlidePreview({ s, img, tag }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="relative aspect-[4/5] bg-stone-100">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-stone-500">
            <Camera size={20} className="text-stone-400" />
            새로 촬영
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {s.n} · {s.role}
        </span>
        {tag && (
          <span className="absolute top-1.5 right-1.5 rounded bg-rose-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{tag}</span>
        )}
        {s.text && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white/90 px-2 py-1.5 text-center text-[13px] leading-snug font-bold whitespace-pre-line text-stone-900 shadow">
            {s.text}
          </div>
        )}
      </div>
      <div className="space-y-0.5 px-2.5 py-2 text-[11px] leading-relaxed">
        <div className="text-stone-700">
          {s.photo ? <b className="font-semibold">{tag ? `${tag} · ` : ""}사진 {s.photo}</b> : <b className="font-semibold text-amber-700">{s.product === 0 && tag == null ? "조합·촬영" : "촬영"}</b>} · {s.shot}
        </div>
        <div className="text-stone-400">{s.design}</div>
      </div>
    </div>
  );
}

function PlanView({ item, onRemove, onSave, onClose }) {
  const p = item.plan || {};
  // 묶음이면 상품마다 사진 목록이 따로 (productImages[k][n]). 예전 기획안은 images 하나.
  const sets = p.productImages || (p.images ? [p.images] : []);
  const titles = p.productTitles || [item.product?.name];
  const many = sets.length > 1;
  const imgOf = (s) => {
    const k = many ? (s.product || 0) - 1 : 0;
    return k >= 0 && s.photo > 0 ? sets[k]?.[s.photo - 1] || null : null;
  };
  return (
    <div className="flex max-h-[92vh] flex-col">
      <Head
        title={item.title || `캐러셀 · ${item.products?.length > 1 ? item.products.map((x) => x.name.replace(/^\[[^\]]*\]\s*/, "")).join(" + ") : item.product?.name || ""}`}
        onTitle={(t) => onSave({ ...item, title: t })}
        sub={[item.product?.reason, new Date(item.createdAt).toLocaleString("ko-KR")].filter(Boolean).join(" · ")}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950">
          <div className="text-xs font-semibold text-rose-800">이렇게 밀어요</div>
          <p className="mt-0.5 leading-relaxed">{p.angle}</p>
        </div>

        {p.hooks?.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold text-stone-500">표지 문구 후보</div>
            <div className="flex flex-wrap gap-2">
              {p.hooks.map((h, i) => (
                <span key={i} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                  <b className="font-semibold text-stone-900">{h.text}</b>
                  <span className="ml-1.5 text-[11px] text-stone-400">{h.type}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-xs font-semibold text-stone-500">장별 기획 ({(p.slides || []).length}장) — 사진 번호는 상품 상세 사진 순서</div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {(p.slides || []).map((s) => (
              <SlidePreview key={s.n} s={s} img={imgOf(s)} tag={many && s.product > 0 ? `상품 ${s.product}` : null} />
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">본문 · CTA: {p.cta}</span>
            <CopyButton text={`${p.caption}\n\n${(p.hashtags || []).join(" ")}`} label="본문 복사" />
          </div>
          <p className="mt-1 leading-relaxed whitespace-pre-wrap text-stone-700">{p.caption}</p>
          <p className="mt-1.5 text-xs text-stone-500">{(p.hashtags || []).join(" ")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {p.todo?.length > 0 && (
            <div className="rounded-xl border border-stone-200 px-3 py-2.5">
              <div className="text-xs font-semibold text-stone-500">촬영·편집 할 일</div>
              <ul className="mt-1 space-y-1 text-sm text-stone-700">
                {p.todo.map((t, i) => (
                  <li key={i} className="flex gap-1.5">
                    <Check size={14} className="mt-0.5 shrink-0 text-stone-300" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.learnedFrom?.length > 0 && (
            <div className="rounded-xl border border-stone-200 px-3 py-2.5">
              <div className="text-xs font-semibold text-stone-500">레퍼런스에서 빌린 것</div>
              <ul className="mt-1 space-y-1 text-xs leading-relaxed text-stone-600">
                {p.learnedFrom.map((l, i) => (
                  <li key={i}>
                    <b className="font-semibold text-stone-800">{l.ref}</b> — {l.borrowed}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {sets.some((x) => x?.length) && (
          <details className="rounded-xl border border-stone-200 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-stone-500">상품 사진 번호 보기</summary>
            {sets.map((imgs, k) => (
              <div key={k} className="mt-2">
                {many && <div className="mb-1 text-[11px] font-semibold text-stone-500">상품 {k + 1} · {titles[k]}</div>}
                <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
                  {(imgs || []).map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" className="relative block">
                      <img src={u} alt="" className="aspect-[3/4] w-full rounded object-cover" loading="lazy" />
                      <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </details>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 기획안을 지울까요?")) {
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

// ------------------------------------------------------------------ 2) 캐러셀 레퍼런스

function statusOf(item, queue) {
  const q = queue.find((j) => j.id === item.id && j.target === "carousel");
  if (q?.status === "working") return { kind: "working", text: q.step || "분석 중" };
  if (q || item.job?.status === "queued") return { kind: "queued", text: "분석 대기 중" };
  if (item.job?.status === "error") return { kind: "error", text: item.job.message || "분석 실패" };
  if (item.job?.status === "working") return { kind: "working", text: "분석 중" };
  return { kind: "done" };
}

function AddRef({ worker, onLink, onImages }) {
  const [tab, setTab] = useState("link");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [memo, setMemo] = useState("");
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState("");

  const go = async (fn) => {
    setMsg("");
    try {
      const r = await fn();
      if (r === false) return;
      setUrl("");
      setFiles([]);
      setMemo("");
    } catch (e) {
      setMsg(e?.message || "실패했어요.");
    } finally {
      setStep("");
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["link", "인스타 링크", Link2],
          ["images", "사진 올리기", ImagePlus],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={"flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {tab === "link" ? (
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" className={FIELD + " min-w-0 flex-1 text-sm"} />
          <button
            type="button"
            disabled={!!step || !isInsta(url)}
            onClick={() => {
              setStep("맡기는 중…");
              go(() => onLink(url.trim(), memo));
            }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {step ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {step || "분석 맡기기"}
          </button>
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 p-3">
            <ImagePlus size={20} className="text-rose-700" />
            <span className="min-w-0 flex-1 text-sm text-stone-700">
              {files.length ? `${files.length}장 골랐어요 (파일 이름 순서가 장 순서)` : "캐러셀 장 사진을 한 번에 여러 장 고르기 (최대 20장)"}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const f = [...(e.target.files || [])].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
                e.target.value = "";
                setFiles(f.slice(0, 20));
              }}
            />
          </label>
          {files.length > 0 && (
            <button
              type="button"
              disabled={!!step}
              onClick={() => go(() => onImages(files, memo, setStep))}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 font-semibold text-white disabled:bg-stone-300"
            >
              {step ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {step || `${files.length}장 분석하기 (바로, 30초~1분)`}
            </button>
          )}
        </>
      )}
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 저장 많이 된 코디 모음" className={FIELD + " mt-2 text-sm"} />
      {tab === "link" && <WorkerStatus worker={worker} />}
      {msg && <p className="mt-2 text-sm text-rose-700">{msg}</p>}
    </div>
  );
}

function RefCard({ item, thumb, status, onOpen }) {
  const a = item.analysis || {};
  const pending = status.kind !== "done";
  return (
    <button type="button" onClick={() => onOpen(item)} className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-stone-300 hover:shadow-sm">
      <span className="relative block aspect-[4/5] bg-stone-100">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-stone-300">
            {pending && status.kind !== "error" ? <Loader2 size={22} className="animate-spin" /> : <GalleryHorizontal size={26} />}
          </span>
        )}
        <span
          className={
            "absolute top-2 left-2 max-w-[85%] truncate rounded px-1.5 py-0.5 text-[10px] font-medium " +
            (status.kind === "error" ? "bg-rose-600 text-white" : pending ? "bg-amber-400 text-amber-950" : "bg-white/90 text-stone-600")
          }
        >
          {pending ? status.text : `${item.slides || "?"}장 · ${a.format || "분석 완료"}`}
        </span>
      </span>
      <span className="block px-3 py-2">
        <span className="block truncate text-sm font-medium text-stone-900">{item.title || a.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-stone-400">
          {item.meta?.uploader ? `@${item.meta.uploader}` : "직접 올림"}
          {item.meta?.likes != null && ` · 좋아요 ${item.meta.likes}`}
          {item.meta?.comments != null && ` · 댓글 ${item.meta.comments}`}
        </span>
      </span>
    </button>
  );
}

function RefDetail({ item, status, fileUrl, onRetry, onRemove, onSaveRef, onClose }) {
  const a = item.analysis || {};
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const got = [];
      for (let i = 1; i <= (item.slides || 0); i++) got.push(await fileUrl(`c-${item.id}-${i}.jpg`));
      if (alive) setUrls(got);
    })();
    return () => {
      alive = false;
    };
  }, [item.id, item.slides, fileUrl]);

  return (
    <div className="flex max-h-[92vh] flex-col">
      <Head
        title={item.title || a.title}
        onTitle={(t) => onSaveRef({ ...item, title: t })}
        sub={[a.format, item.meta?.uploader && `@${item.meta.uploader}`, item.meta?.postedAt].filter(Boolean).join(" · ")}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {urls.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {urls.map((u, i) => (
              <div key={i} className="relative w-40 shrink-0">
                {u ? <img src={u} alt="" className="aspect-[4/5] w-full rounded-lg object-cover" /> : <div className="aspect-[4/5] rounded-lg bg-stone-100" />}
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{i + 1}</span>
              </div>
            ))}
          </div>
        )}

        {status.kind !== "done" ? (
          <div className={"rounded-xl border px-4 py-4 text-sm " + (status.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
            <div className="flex items-center gap-2 font-semibold">
              {status.kind === "error" ? <Info size={15} /> : <Loader2 size={15} className="animate-spin" />}
              {status.text}
            </div>
            {status.kind === "error" && (
              <button type="button" onClick={() => onRetry(item)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white">
                <RotateCw size={13} /> 다시 맡기기
              </button>
            )}
          </div>
        ) : (
          <>
            {(a.performance?.summary || item.meta) && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                  <TrendingUp size={13} /> 성과
                  {item.meta?.likes != null && <span className="font-normal">· 좋아요 {item.meta.likes} · 댓글 {item.meta.comments}</span>}
                </div>
                {a.performance?.summary && <p className="mt-1 text-sm leading-relaxed text-sky-950">{a.performance.summary}</p>}
                {a.performance?.signals?.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-sky-900">
                    {a.performance.signals.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <div className="text-xs font-semibold text-rose-900">표지</div>
              <p className="mt-0.5 text-sm font-semibold whitespace-pre-line text-rose-950">{a.cover?.text}</p>
              <p className="mt-1 text-xs text-rose-800">{a.cover?.why}</p>
            </div>
            <p className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-relaxed text-stone-700">
              {a.structure?.flow}
              <span className="mt-1 block text-xs text-stone-500">CTA: {a.structure?.cta} · {a.structure?.whyItWorks}</span>
            </p>
            {a.slides?.length > 0 && (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 text-sm">
                {a.slides.map((s) => (
                  <li key={s.n} className="flex gap-3 px-3 py-2">
                    <span className="w-10 shrink-0 text-xs text-stone-400">{s.n}장</span>
                    <span className="min-w-0 flex-1">
                      <span className="mr-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{s.role}</span>
                      {s.text && <span className="font-medium whitespace-pre-line text-stone-900">{s.text}</span>}
                      <span className="block text-xs text-stone-500">{s.visual}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {a.design && (
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                {[["레이아웃", a.design.layout], ["글씨", a.design.typography], ["색", a.design.color], ["사진", a.design.photoStyle]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-stone-50 px-2.5 py-2">
                    <b className="text-stone-500">{k}</b> <span className="text-stone-700">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {a.template && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-500">빈칸 틀</span>
                  <CopyButton text={a.template} />
                </div>
                <pre className="rounded-xl border border-stone-200 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-stone-700">{a.template}</pre>
              </div>
            )}
            {a.note && <p className="text-xs text-amber-800">{a.note}</p>}
          </>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 레퍼런스를 지울까요?")) {
              onRemove(item);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
        >
          <Trash2 size={13} /> 지우기
        </button>
        {item.meta?.url && (
          <a href={item.meta.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-sky-700 hover:underline">
            <ExternalLink size={11} /> 원본 게시물
          </a>
        )}
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------- 화면

export default function CarouselPage({
  stats,
  carousels,
  plans,
  reels,
  onSaveRef,
  onRemoveRef,
  onSavePlan,
  onRemovePlan,
  putFile,
  fileUrl,
  worker,
  queue,
  onQueue,
  onPoll,
}) {
  const [tab, setTab] = useState("products");
  const [planning, setPlanning] = useState(null); // 고른 상품들 (1개면 단독, 여러 개면 묶음)
  const [viewPlan, setViewPlan] = useState(null);
  const [openRef, setOpenRef] = useState(null);
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    onPoll();
    const t = setInterval(onPoll, 4000);
    return () => clearInterval(t);
  }, [onPoll]);

  const key = (c) => `${c.id}:${c.thumbAt || ""}`;
  useEffect(() => {
    if (tab !== "refs") return;
    let alive = true;
    (async () => {
      for (const c of carousels.slice(0, 40)) {
        if (thumbs[key(c)] !== undefined || !c.slides) continue;
        const u = await fileUrl(`c-${c.id}-1.jpg`);
        if (!alive) return;
        setThumbs((p) => ({ ...p, [key(c)]: u }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab, carousels, fileUrl, thumbs]);

  const addLink = async (url, memo) => {
    const id = newId("c");
    await onSaveRef({
      id,
      title: "분석 대기 — " + url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40),
      source: { type: "link", url },
      meta: { url },
      memo,
      job: { status: "queued", at: new Date().toISOString() },
    });
    await onQueue(id, "carousel");
  };

  const addImages = async (files, memo, setStep) => {
    const id = newId("c");
    const slides = [];
    for (let i = 0; i < files.length; i++) {
      setStep(`사진 줄이는 중… ${i + 1}/${files.length}`);
      const { data, blob } = await shrinkImage(files[i]);
      slides.push({ data });
      await putFile(`c-${id}-${i + 1}.jpg`, blob, "image/jpeg");
    }
    setStep("분석 중… (30초~1분)");
    const r = await analyzeCarousel({ slides, meta: null, memo });
    if (!r.ok) throw new Error(r.message);
    const item = {
      id,
      title: r.data.title,
      source: { type: "images" },
      memo,
      slides: files.length,
      analysis: r.data,
      thumbAt: new Date().toISOString(),
      job: { status: "done", at: new Date().toISOString() },
    };
    await onSaveRef(item);
    setOpenRef(item);
  };

  const retry = async (item) => {
    await onSaveRef({ ...item, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(item.id, "carousel");
  };

  const donePlan = async (item) => {
    await onSavePlan(item);
    setPlanning(null);
    setViewPlan(item);
    setTab("plans");
  };

  const counts = useMemo(() => ({ refs: carousels.length, plans: plans.length }), [carousels, plans]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <GalleryHorizontal size={20} /> 캐러셀 기획
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          잘 팔리는·뜰 것 같은 상품을 골라, 모아 둔 캐러셀·릴스 레퍼런스에서 배운 틀로 장별 캐러셀을 기획해요.
        </p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["products", "상품에서 시작"],
          ["refs", `캐러셀 레퍼런스 ${counts.refs}`],
          ["plans", `기획안 ${counts.plans}`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={"flex-1 rounded-lg py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "products" && <ProductsTab stats={stats} onPick={setPlanning} />}

      {tab === "refs" && (
        <>
          <AddRef worker={worker} onLink={addLink} onImages={addImages} />
          {carousels.length === 0 ? (
            <Empty title="아직 모아 둔 캐러셀이 없어요." hint="잘 된 캐러셀 게시물 링크를 넣거나 장 사진을 올리세요. 기획할 때 여기서 배워요." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {carousels.map((c) => (
                <RefCard key={c.id} item={c} thumb={thumbs[key(c)]} status={statusOf(c, queue)} onOpen={setOpenRef} />
              ))}
            </div>
          )}
          {!workerAlive(worker) && carousels.some((c) => statusOf(c, queue).kind === "queued") && (
            <p className="mt-3 text-xs text-stone-500">링크로 넣은 것은 사무실 PC 분석기가 켜지면 분석돼요.</p>
          )}
        </>
      )}

      {tab === "plans" &&
        (plans.length === 0 ? (
          <Empty title="아직 만든 기획안이 없어요." hint="'상품에서 시작' 탭에서 상품을 누르면 기획이 시작돼요." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <button key={p.id} type="button" onClick={() => setViewPlan(p)} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-rose-300 hover:shadow-sm">
                {p.product?.image ? <img src={p.product.image} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" /> : <span className="h-24 w-20 shrink-0 rounded-lg bg-stone-100" />}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-medium text-stone-900">{p.product?.name}</span>
                  <span className="mt-1 line-clamp-2 block text-xs font-semibold text-rose-700">{p.plan?.hooks?.[0]?.text}</span>
                  <span className="mt-1 block text-[11px] text-stone-400">
                    {(p.plan?.slides || []).length}장 · {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}

      {planning && (
        <Overlay onClose={() => setPlanning(null)}>
          <Planner products={planning} carousels={carousels} reels={reels} onDone={donePlan} onClose={() => setPlanning(null)} />
        </Overlay>
      )}
      {viewPlan && (
        <Overlay wide onClose={() => setViewPlan(null)}>
          <PlanView item={plans.find((p) => p.id === viewPlan.id) || viewPlan} onRemove={onRemovePlan} onSave={onSavePlan} onClose={() => setViewPlan(null)} />
        </Overlay>
      )}
      {openRef && (
        <Overlay onClose={() => setOpenRef(null)}>
          {(() => {
            const it = carousels.find((c) => c.id === openRef.id) || openRef;
            return <RefDetail item={it} status={statusOf(it, queue)} fileUrl={fileUrl} onRetry={retry} onRemove={onRemoveRef} onSaveRef={onSaveRef} onClose={() => setOpenRef(null)} />;
          })()}
        </Overlay>
      )}
    </div>
  );
}
