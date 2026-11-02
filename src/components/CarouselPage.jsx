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
  Archive,
  PenTool,
  ChevronDown,
} from "lucide-react";
import { newId } from "../lib/id";
import {
  analyzeCarousel,
  planCarousel,
  shrinkImage,
  refSummary,
  CAROUSEL_TYPES,
  typeOf,
  withTypeFolders,
  slideSource,
  planTitle,
  planCost,
  PLAN_STATS,
  STAT_WAIT_DAYS,
  statDay,
  typeCompare,
} from "../lib/carousel";
import { workerAlive } from "../lib/reels";
import { CopyButton, WorkerStatus, EditableTitle, SlideViewer, TrendBox } from "./ContentBits";
import { Empty } from "./ui";
import { FolderBar, CategoryEditor, FolderPicker } from "./FolderBits";
import { folderIdOf, withChildren, ordered } from "../lib/reelFolders";
import { loadKey, changeKey } from "../lib/shoot";

// 캐러셀 폴더 (10/3 세원: "캐러셀도 릴스처럼 카테고리 나눌 수 있게") — settings 'carousel_folders' {items:[{id,name,parent}], typesAdded}
// 처음엔 흔한 갈래 셋 + 4유형을 깔아 둔다(카테고리 편집에서 고치고 지운다, lib/carousel withTypeFolders)

/**
 * 캐러셀 기획 (2026-09-22 세원):
 *   "가장 잘 판매되는 상품들, 뜰 수 있을 것 같은 상품들을 분석해서 캐러셀 콘텐츠를 만들 수 있게.
 *    잘 팔릴 상품들은 우리의 캐러셀 레퍼런스, 릴스 레퍼런스에서 보면서 학습 후 진행."
 * 11/2 세원: 사진만 올리는 피드는 고감도만, 나머지는 캐러셀. 유형은 타겟형·상황형·미감형·시즌형, 타겟 기준은 실루엣.
 *
 *  1. 새 기획 — 유형·주제에서 시작. 상품은 선택(새벽 갱신 poclo-cafe24/product_stats.py 가 올린 '잘 팔리는 / 뜰 것 같은' 상품).
 *  2. 캐러셀 레퍼런스 — 인스타 링크(사무실 PC 분석기가 장 사진을 받음) 또는 사진 여러 장 올리기.
 *  3. 기획안 — 유형·주제(+상품) + 레퍼런스(캐러셀·릴스) 요약을 보내 장별 기획. 유형·게시일·저장·공유·프로필 방문을 적어 유형별로 비교.
 *
 * 저장: settings 'carousels' · 'carousel_plans' · 'product_stats'. 장 사진은 Storage 'reels' 버킷 c-<id>-<n>.jpg.
 * 기획안 한 줄: {id, kind, postOn, topic, title, noProduct, saves, shares, visits, product, products, refs, memo, plan, createdAt}
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const won = (n) => (n ? new Intl.NumberFormat("ko-KR").format(n) + "원" : "");
const isInsta = (s) => /instagram\.com\/(?:[^/]+\/)?(p|reels?|tv)\//i.test(s.trim());

function Overlay({ children, onClose, wide }) {
  return (
    <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={"sheet relative z-10 w-full overflow-hidden rounded-2xl bg-white shadow-xl " + (wide === "x" ? "max-w-6xl" : wide ? "max-w-4xl" : "max-w-2xl")}>
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
          이 상품 넣기
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
            {sel.length < 2 ? "2개 이상 고르세요" : "묶어서 넣기"}
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 1) 새 기획 — 유형·주제에서 시작

const EMPTY_DRAFT = { kind: "", topic: "", postOn: "", products: [] };
const DRAFT_KEY = "poclo_carousel_draft"; // 만들던 기획 기억 (릴스 poclo_reel_draft 처럼 — 다른 화면에 다녀와도 남게)
const cleanName = (s) => String(s || "").replace(/^\[[^\]]*\]\s*/, "");

function NewPlan({ draft, setDraft, stats, onNext }) {
  const [openProducts, setOpenProducts] = useState(false);
  const type = typeOf(draft.kind);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <div className="space-y-4">
      <section aria-label="유형 고르기">
        <h3 className="mb-2 text-sm font-semibold text-stone-800">어떤 유형으로 만들까요?</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CAROUSEL_TYPES.map((t) => {
            const on = draft.kind === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ kind: t.key })}
                className={"rounded-xl border bg-white p-3 text-left transition hover:shadow-sm " + (on ? "border-rose-500 ring-2 ring-rose-200" : "border-stone-200 hover:border-rose-300")}
              >
                <span className="block font-semibold text-stone-900">{t.name}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{t.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="block text-xs font-semibold text-stone-500">
          주제
          <input
            value={draft.topic}
            onChange={(e) => set({ topic: e.target.value })}
            placeholder={type?.eg || "유형을 고르면 예시가 나와요"}
            className={FIELD + " mt-1 text-sm font-normal"}
          />
          <span className="mt-1 block font-normal text-stone-400">비우면 이 유형에 맞는 주제를 Claude가 정해요.</span>
        </label>
        <label className="block text-xs font-semibold text-stone-500">
          게시일 (선택)
          <input type="date" value={draft.postOn} onChange={(e) => set({ postOn: e.target.value })} className={FIELD + " mt-1 text-sm font-normal"} />
        </label>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white">
        <button type="button" aria-expanded={openProducts} onClick={() => setOpenProducts((v) => !v)} className="flex w-full items-center gap-2 px-3 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-stone-800">상품 넣기 (선택)</span>
            <span className="mt-0.5 block text-xs text-stone-400">
              {draft.products.length ? `${draft.products.length}개 넣었어요` : "안 넣으면 소재·색·가격 자리를 비워 두고, 나중에 상품을 고르면 채워요."}
            </span>
          </span>
          <ChevronDown size={16} className={"shrink-0 text-stone-400 transition " + (openProducts ? "rotate-180" : "")} />
        </button>
        {draft.products.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {draft.products.map((p) => (
              <span key={p.no || p.url} className="flex max-w-full items-center gap-1 rounded-lg bg-stone-100 py-1 pr-1 pl-2 text-xs text-stone-700">
                <span className="truncate">{cleanName(p.name)}</span>
                <button type="button" aria-label={`${cleanName(p.name)} 빼기`} onClick={() => set({ products: draft.products.filter((x) => x !== p) })} className="shrink-0 rounded p-0.5 text-stone-400 hover:text-stone-700">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {openProducts && (
          <div className="border-t border-stone-200 p-3">
            <ProductsTab
              stats={stats}
              onPick={(list) => {
                set({ products: list });
                setOpenProducts(false);
              }}
            />
          </div>
        )}
      </section>

      <button
        type="button"
        disabled={!type}
        onClick={onNext}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 font-semibold text-white disabled:bg-stone-300"
      >
        {type ? "다음 · 참고할 레퍼런스 고르기" : "유형을 먼저 고르세요"}
      </button>
    </div>
  );
}

/** 유형·주제(+상품)를 정하면 — 참고할 레퍼런스를 고르고 기획을 만든다. job.fill 이 있으면 상품 없이 만든 기획의 빈칸만 채운다 */
function Planner({ job, carousels, reels, folders, onDone, onClose }) {
  const { kind, topic, postOn, products, fill } = job;
  const many = products.length > 1;
  const none = products.length === 0;
  const type = typeOf(kind);
  const doneC = carousels.filter((c) => c.analysis);
  const doneR = reels.filter((r) => r.reference?.structure);
  // 기본으로 켜 둘 것: 캐러셀은 이 유형 폴더 먼저 해서 6개, 릴스는 성과 분석이 있는 것 먼저 4개
  const [pick, setPick] = useState(() => {
    const r = [...doneR].sort((a, b) => (b.reference?.performance?.summary ? 1 : 0) - (a.reference?.performance?.summary ? 1 : 0));
    const fid = folders.find((f) => f.name === type?.name)?.id;
    const inType = fid ? new Set(withChildren(fid, folders)) : new Set();
    const c = [...doneC.filter((x) => inType.has(folderIdOf(x, folders))), ...doneC.filter((x) => !inType.has(folderIdOf(x, folders)))];
    return new Set([...c.slice(0, 6).map((x) => x.id), ...r.slice(0, 4).map((x) => x.id)]);
  });
  const [memo, setMemo] = useState(fill?.memo || "");
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
      const refs = fill
        ? []
        : [
            ...doneC.filter((c) => pick.has(c.id)).map((c) => refSummary(c, "carousel")),
            ...doneR.filter((r) => pick.has(r.id)).map((r) => refSummary(r, "reel")),
          ];
      const list = products.map((p) => ({
        url: p.url,
        stats: p.reason ? { reason: p.reason, group: p.group, q7: p.q7, p7: p.p7, q30: p.q30 } : {},
      }));
      const r = await planCarousel({ kind, topic, postOn, products: list, noProduct: none, fillFrom: fill?.plan, refs, memo });
      if (!r.ok) {
        setMsg(r.message);
        return;
      }
      const name = topic.trim() || r.data.topic || "";
      await onDone({
        // 빈칸 채우기는 같은 기획안에 덮는다 — 유형·게시일·숫자는 그대로
        ...(fill || {
          id: newId("cp"),
          kind,
          postOn,
          topic: name,
          title: planTitle({ kind, postOn, topic: name }),
          refs: refs.map((x) => ({ title: x.title, kind: x.kind })),
          createdAt: new Date().toISOString(),
        }),
        noProduct: none,
        // 목록 카드는 첫 상품을 대표로 쓴다 (예전 기획안과 같은 모양)
        product: none
          ? null
          : {
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
        memo,
        plan: r.data,
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
        title={fill ? "상품 넣어 빈칸 채우기" : many ? `묶음 캐러셀 만들기 · 상품 ${products.length}개` : "캐러셀 기획 만들기"}
        sub={[type?.name, topic.trim() || (fill ? "" : "주제는 Claude가 정해요"), postOn && `${postOn.slice(5).replace("-", "/")} 게시`].filter(Boolean).join(" · ")}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {none && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            상품 없이 만들어요. 소재·색·가격은 지어내지 않고 [상품명]·[가격]처럼 비워 두고, 나중에 상품을 고르면 채워요.
          </p>
        )}
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

        {!fill && (
          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">
              보고 배울 레퍼런스 — 체크한 것의 표지 훅·구조·성과를 보고 틀을 빌려요
            </div>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <div>
                <div className="px-2 pt-1 text-[11px] font-semibold text-stone-400">캐러셀 {doneC.length}</div>
                {/* 보관만 한 건 표지 훅·구조가 없어서 못 배운다 — 저절로 분석하지 않고(돈) 어디서 하는지만 알린다 */}
                {carousels.length > doneC.length ? (
                  <p className="px-2 py-1 text-xs text-stone-400">보관만 한 {carousels.length - doneC.length}개는 '캐러셀 레퍼런스' 탭에서 분석하면 여기서 고를 수 있어요 (한 번 약 100~200원).</p>
                ) : doneC.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-stone-400">아직 없어요 — '캐러셀 레퍼런스' 탭에서 모으세요</p>
                ) : null}
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
        )}

        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={none ? "메모 (선택) — 예: 7장 이내, 저장 유도로 끝내기" : many ? "메모 (선택) — 예: 가을 니트 3종 비교, 같이 입는 코디로 엮기" : "메모 (선택) — 예: 출근룩으로, 7장 이내, 가격 강조"}
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
          {busy ? (
            none ? "유형·주제로 기획하는 중… (1분쯤)" : `상품 사진 보고 기획하는 중… (${many ? "1~2분" : "1분쯤"})`
          ) : (
            <>
              {fill ? "빈칸 채우기" : `${many ? "묶음 " : ""}기획 만들기 · 레퍼런스 ${pick.size}개 참고`}
              <span className="text-sm font-normal text-rose-200">{planCost(products.length)}</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ 기획안 보기

/** 글 중심 장은 찍을 게 없어서 '디자인'으로, 미감형 바닥 컷은 '바닥 촬영'으로 */
const NO_PHOTO = {
  design: ["디자인", PenTool],
  floor: ["바닥 촬영", Camera],
  shoot: ["새로 촬영", Camera],
  photo: ["새로 촬영", Camera],
};

function SlidePreview({ s, img, tag, noProduct }) {
  const source = slideSource(s);
  const [label, Icon] = NO_PHOTO[source];
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="relative aspect-[4/5] bg-stone-100">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-stone-500">
            <Icon size={20} className="text-stone-400" />
            {label}
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
          {s.photo ? (
            <b className="font-semibold">{tag ? `${tag} · ` : ""}사진 {s.photo}</b>
          ) : source === "design" ? (
            <b className="font-semibold text-stone-600">디자인</b>
          ) : source === "floor" ? (
            <b className="font-semibold text-amber-700">바닥 촬영</b>
          ) : (
            <b className="font-semibold text-amber-700">{s.product === 0 && tag == null && !noProduct ? "조합·촬영" : "촬영"}</b>
          )}{" "}
          · {s.shot}
        </div>
        <div className="text-stone-400">{s.design}</div>
      </div>
    </div>
  );
}

const md = (day) => (day ? `${+day.slice(5, 7)}/${+day.slice(8, 10)}` : "");
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const mdw = (day) => (day ? `${md(day)} (${WEEK[new Date(`${day}T00:00:00`).getDay()]})` : "");
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const NUM = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** 저장·공유·프로필 방문 한 칸 — 칸을 벗어날 때 저장. 비우면 안 적은 것(0 과 다르다) */
function StatInput({ label, value, onSave }) {
  const [v, setV] = useState(value ?? "");
  const commit = () => {
    const t = String(v).replace(/[^\d]/g, "");
    const n = t === "" ? null : Number(t);
    if (n !== (value ?? null)) onSave(n);
  };
  return (
    <label className="block min-w-0 text-xs text-stone-500">
      {label}
      <input
        value={v}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="—"
        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-900 tabular-nums outline-none focus:border-rose-600"
      />
    </label>
  );
}

/** 유형 · 게시일 · 게시 뒤 숫자 — 칸마다 그 칸만 저장한다(둘이 다른 칸을 적어도 서로 안 지워지게) */
function PlanMeta({ item, onPatch }) {
  const day = statDay(item.postOn);
  return (
    <section className="space-y-3 rounded-xl border border-stone-200 px-3 py-3">
      <div>
        <div className="mb-1.5 text-xs font-semibold text-stone-500">유형</div>
        <div className="flex flex-wrap gap-1.5">
          {CAROUSEL_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={item.kind === t.key}
              onClick={() => onPatch({ kind: t.key })}
              className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (item.kind === t.key ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block min-w-0 text-xs text-stone-500">
          게시일
          <input
            type="date"
            value={item.postOn || ""}
            onChange={(e) => onPatch({ postOn: e.target.value })}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 tabular-nums outline-none focus:border-rose-600"
          />
        </label>
        {PLAN_STATS.map(([k, label]) => (
          // 값이 바뀌면(상대가 적음) 칸을 새로 그린다
          <StatInput key={`${k}:${item[k] ?? ""}`} label={label} value={item[k]} onSave={(n) => onPatch({ [k]: n })} />
        ))}
      </div>
      <p className="text-[11px] text-stone-400">
        {day ? `게시 ${STAT_WAIT_DAYS}일 뒤 ${mdw(day)}에 인스타 인사이트 숫자를 적어요.` : `게시일을 적으면 ${STAT_WAIT_DAYS}일 뒤 숫자를 적을 날을 알려 드려요.`} 기획안 탭에서 유형별로 비교해요.
      </p>
    </section>
  );
}

/** 유형별 비교 — 숫자를 적은 기획안만으로 평균. 칸마다 가장 높은 값은 굵게 */
function TypeCompare({ plans }) {
  const { rows, best } = useMemo(() => typeCompare(plans), [plans]);
  const measured = rows.reduce((a, r) => a + r.measured, 0);
  return (
    <section className="mb-3 rounded-2xl border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-stone-800">유형별 비교</h3>
        <p className="text-[11px] text-stone-400">게시 {STAT_WAIT_DAYS}일 뒤 숫자 · 기획안 하나당 평균</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">유형</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">숫자 적음</th>
              {PLAN_STATS.map(([k, label]) => (
                <th key={k} scope="col" className="px-2 py-1.5 text-right font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-stone-100 last:border-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium text-stone-800">{r.name}</th>
                <td className="px-2 py-1.5 text-right text-stone-500">{r.measured} / {r.count}</td>
                {PLAN_STATS.map(([k]) => (
                  <td key={k} className={"px-2 py-1.5 text-right " + (r.avg[k] != null && r.avg[k] === best[k] ? "font-bold text-stone-900" : "text-stone-600")}>
                    {r.avg[k] == null ? "—" : NUM.format(r.avg[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {measured === 0 && <p className="mt-2 text-xs text-stone-400">아직 적은 숫자가 없어요. 기획안을 열어 게시 {STAT_WAIT_DAYS}일 뒤 저장·공유·프로필 방문을 적으면 여기서 비교돼요.</p>}
    </section>
  );
}

function PlanCard({ p, onOpen }) {
  const type = typeOf(p.kind);
  const day = statDay(p.postOn);
  const stats = PLAN_STATS.filter(([k]) => typeof p[k] === "number");
  const late = day && !stats.length && day <= localToday();
  return (
    <button type="button" onClick={() => onOpen(p)} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-rose-300 hover:shadow-sm">
      {p.product?.image ? (
        <img src={p.product.image} alt="" className="h-24 w-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
          <GalleryHorizontal size={22} />
        </span>
      )}
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-medium text-stone-900">{p.title || p.product?.name}</span>
        <span className="mt-1 line-clamp-2 block text-xs font-semibold text-rose-700">{p.plan?.hooks?.[0]?.text}</span>
        <span className="mt-1 block text-[11px] text-stone-400">
          {[type?.name, p.postOn ? `${mdw(p.postOn)} 게시` : "", `${(p.plan?.slides || []).length}장`, p.noProduct ? "상품 없이" : ""].filter(Boolean).join(" · ")}
        </span>
        {stats.length > 0 ? (
          <span className="mt-0.5 block text-[11px] text-stone-600 tabular-nums">{stats.map(([k, label]) => `${label} ${NUM.format(p[k])}`).join(" · ")}</span>
        ) : day ? (
          <span className={"mt-0.5 block text-[11px] " + (late ? "font-medium text-amber-700" : "text-stone-400")}>{mdw(day)}부터 숫자 적기</span>
        ) : null}
      </span>
    </button>
  );
}

function PlanView({ item, onRemove, onSave, onFill, onClose }) {
  const p = item.plan || {};
  // 칸마다 그 칸만 보낸다 — 받는 쪽이 서버 최신 줄에 합친다.
  // 저절로 지은 이름이면 유형·게시일을 따라가고, 손으로 고친 이름('11/5 시즌형 · …')은 그대로 둔다
  const patch = (fields) => {
    const auto = ("kind" in fields || "postOn" in fields) && item.title === planTitle(item);
    onSave({ id: item.id, ...fields, ...(auto ? { title: planTitle({ ...item, ...fields }) } : {}) });
  };
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
        onTitle={(t) => patch({ title: t })}
        sub={[item.product?.reason, new Date(item.createdAt).toLocaleString("ko-KR"), p._cost?.won > 0 && `기획 약 ${NUM.format(p._cost.won)}원`].filter(Boolean).join(" · ")}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <PlanMeta item={item} onPatch={patch} />

        {item.noProduct && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-xs leading-relaxed text-amber-900">상품 없이 만든 기획이에요. [상품명] 같은 자리는 상품을 고르면 채워져요.</p>
              <button type="button" onClick={() => onFill(item)} className="shrink-0 rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white">
                상품 고르기
              </button>
            </div>
            {p.productNeeds?.length > 0 && (
              <div className="mt-2 border-t border-amber-200/70 pt-2">
                <div className="text-xs font-semibold text-amber-900">이 캐러셀에 맞는 상품 조건</div>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-stone-700">
                  {p.productNeeds.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.suspect?.length > 0 && (
              <p className="mt-2 border-t border-amber-200/70 pt-2 text-xs leading-relaxed text-amber-900">
                <b className="font-semibold">상품 사실처럼 보이는 말이 있어요:</b> {p.suspect.join(", ")} — 주제에 없던 말이에요. 장을 만들 때 빼거나, 상품을 고른 뒤 맞는지 확인하세요.
              </p>
            )}
          </div>
        )}

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
          <div className="mb-1.5 text-xs font-semibold text-stone-500">
            장별 기획 ({(p.slides || []).length}장){item.noProduct ? "" : " — 사진 번호는 상품 상세 사진 순서"}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {(p.slides || []).map((s) => (
              <SlidePreview key={s.n} s={s} img={imgOf(s)} tag={many && s.product > 0 ? `상품 ${s.product}` : null} noProduct={item.noProduct} />
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
        {item.product?.url && (
          <a href={item.product.url} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline">
            상품 페이지 열기
          </a>
        )}
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
          {/* 10/3 세원: "캐러셀 기획도 분석하면 돈 드나? 보관만 만들어 줘야 할 것 같아" — 릴스처럼 보관만(무료) / 분석하기 */}
          <button
            type="button"
            disabled={!!step || !isInsta(url)}
            onClick={() => {
              setStep("맡기는 중…");
              go(() => onLink(url.trim(), memo, false));
            }}
            title="장 사진만 모아 둬요. Claude 를 안 불러서 돈이 안 들어요. 나중에 열어서 분석할 수 있어요."
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-400 disabled:opacity-50"
          >
            <Archive size={15} /> 보관만 <span className="font-normal text-stone-400">무료</span>
          </button>
          <button
            type="button"
            disabled={!!step || !isInsta(url)}
            onClick={() => {
              setStep("맡기는 중…");
              go(() => onLink(url.trim(), memo, true));
            }}
            className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {step ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {step || (
              <>
                분석하기 <span className="font-normal text-rose-200">약 100~200원</span>
              </>
            )}
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
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!!step}
                onClick={() => go(() => onImages(files, memo, setStep, false))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 font-semibold text-stone-700 disabled:opacity-50"
              >
                <Archive size={15} /> 보관만 <span className="text-sm font-normal text-stone-400">무료</span>
              </button>
              <button
                type="button"
                disabled={!!step}
                onClick={() => go(() => onImages(files, memo, setStep, true))}
                className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 font-semibold text-white disabled:bg-stone-300"
              >
                {step ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                {step || (
                  <>
                    {files.length}장 분석하기 <span className="text-sm font-normal text-rose-200">약 100~200원</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
      <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 저장 많이 된 코디 모음" className={FIELD + " mt-2 text-sm"} />
      {tab === "link" && <WorkerStatus worker={worker} />}
      {msg && <p className="mt-2 text-sm text-rose-700">{msg}</p>}
    </div>
  );
}

function RefCard({ item, thumb, status, onOpen, folders, folderName, onMove }) {
  const a = item.analysis || {};
  const pending = status.kind !== "done";
  return (
    <div className="relative rounded-xl border border-stone-200 bg-white transition hover:border-stone-300 hover:shadow-sm">
    <button type="button" onClick={() => onOpen(item)} className="block w-full text-left">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-t-xl bg-stone-100">
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
          {pending ? status.text : item.keepOnly ? `${item.slides || "?"}장 · 보관만` : `${item.slides || "?"}장 · ${a.format || "분석 완료"}`}
        </span>
      </span>
      <span className="block py-2 pr-9 pl-3">
        <span className="block truncate text-sm font-medium text-stone-900">{item.title || a.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-stone-400">
          {folderName ? <span className="text-stone-500">{folderName} · </span> : null}
          {item.meta?.uploader ? `@${item.meta.uploader}` : "직접 올림"}
          {item.meta?.likes != null && ` · 좋아요 ${item.meta.likes}`}
          {item.meta?.comments != null && ` · 댓글 ${item.meta.comments}`}
        </span>
      </span>
    </button>
      {onMove && (
        <span className="absolute right-1.5 bottom-2">
          <FolderPicker item={item} folders={folders} onMove={onMove} />
        </span>
      )}
    </div>
  );
}

function RefDetail({ item, status, fileUrl, onRetry, onRemove, onSaveRef, onClose, folders = [] }) {
  const a = item.analysis || {};
  const [urls, setUrls] = useState([]);
  const [jump, setJump] = useState(null); // 'N장' 줄을 누르면 그 장으로
  const [at, setAt] = useState(0);
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
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6">
        {urls.length > 0 && (
          <div className="mb-4 lg:sticky lg:top-0 lg:mb-0 lg:self-start">
            <SlideViewer
              urls={urls}
              jump={jump}
              onAt={setAt}
              expandable
              className="mx-auto aspect-[4/5] w-full max-w-lg overflow-hidden rounded-xl bg-stone-100 lg:max-h-[calc(92vh-9rem)] lg:max-w-none"
            />
            <p className="mt-1.5 text-center text-[11px] text-stone-400">사진을 누르면 전체 화면 · 전체 화면에서 한 번 더 누르면 확대</p>
          </div>
        )}
        <div className="space-y-4">
        <label className="flex items-center gap-2 text-xs text-stone-500">
          폴더
          <select
            value={folderIdOf(item, folders) || ""}
            onChange={(e) => onSaveRef({ ...item, folderId: e.target.value || null, folder: "" })}
            className="rounded-md border border-stone-300 bg-white px-1.5 py-1 text-xs text-stone-700"
          >
            <option value="">미분류</option>
            {ordered(folders).map((f) => (
              <option key={f.id} value={f.id}>
                {f.depth ? `${"　".repeat(f.depth)}└ ${f.name}` : f.name}
              </option>
            ))}
          </select>
        </label>

        {status.kind === "done" && item.keepOnly ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm">
            <div className="font-semibold text-stone-800">보관만 한 캐러셀이에요</div>
            <p className="mt-1 text-xs text-stone-500">장 사진만 모아 뒀어요. 표지 훅·구조가 필요하면 분석하세요 (한 번 약 100~200원).</p>
            <button type="button" onClick={() => onRetry(item)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white">
              <RotateCw size={13} /> 분석하기
            </button>
          </div>
        ) : status.kind !== "done" ? (
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
                  <li
                    key={s.n}
                    onClick={() => s.n <= urls.length && setJump({ i: s.n - 1, k: Date.now() })}
                    title={s.n <= urls.length ? "이 장 보기" : undefined}
                    className={"flex gap-3 px-3 py-2 " + (s.n <= urls.length ? "cursor-pointer hover:bg-stone-50 " : "") + (at === s.n - 1 ? "bg-rose-50/60" : "")}
                  >
                    <span className={"w-10 shrink-0 text-xs " + (at === s.n - 1 ? "font-semibold text-rose-700" : "text-stone-400")}>{s.n}장</span>
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
  fileUrls,
  worker,
  queue,
  onQueue,
  onPoll,
  online,
}) {
  const [tab, setTab] = useState("new");
  const [draft, setDraft] = useState(() => {
    try {
      return { ...EMPTY_DRAFT, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") };
    } catch {
      return EMPTY_DRAFT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* 저장소가 막혀도 화면은 돈다 */
    }
  }, [draft]);
  const [planType, setPlanType] = useState("all"); // 기획안 탭 유형 거르기
  const [fillPick, setFillPick] = useState(null); // 상품 없이 만든 기획안에 넣을 상품 고르는 중
  const [folders, setFolders] = useState([]);
  const [sel, setSel] = useState("all");
  const [q, setQ] = useState("");
  const [editCats, setEditCats] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      let f = await loadKey("carousel_folders", online);
      if (!f.typesAdded) f = await changeKey("carousel_folders", online, (v) => withTypeFolders(v, newId));
      if (alive) setFolders(f.items || []);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [online]);
  const saveFolders = async (op) => {
    const next = await changeKey("carousel_folders", online, (v) => ({ ...v, items: op(v.items || []) }));
    setFolders(next.items || []);
  };
  const shownRefs = useMemo(() => {
    const ids = sel === "all" || sel === "none" ? null : new Set(withChildren(sel, folders));
    const n = q.trim().toLowerCase();
    return carousels.filter((c) => {
      const f = folderIdOf(c, folders);
      if (sel === "none" && f) return false;
      if (ids && !ids.has(f)) return false;
      return (
        !n ||
        JSON.stringify([c.title, c.memo, c.meta?.uploader, c.analysis?.title, c.analysis?.format, c.analysis?.cover?.text]).toLowerCase().includes(n)
      );
    });
  }, [carousels, folders, sel, q]);
  const nameOfFolder = (c) => {
    const id = folderIdOf(c, folders);
    return id ? folders.find((f) => f.id === id)?.name || "" : "";
  };
  // 새로 넣을 때 지금 보고 있는 폴더로
  const here = () => (sel !== "all" && sel !== "none" ? { folderId: sel } : {});
  const [planning, setPlanning] = useState(null); // {kind, topic, postOn, products, fill} — 상품 없음 / 1개 단독 / 여러 개 묶음
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
    // 10/3: 예전엔 앞 40개만 한 장씩 받았다 → 폴더를 바꾸면 안 뜨는 카드가 있었다. 보이는 카드 전부를 100장씩 한 번에
    (async () => {
      const need = shownRefs.filter((c) => thumbs[key(c)] === undefined && c.slides);
      for (let i = 0; i < need.length; i += 100) {
        const part = need.slice(i, i + 100);
        let map = {};
        if (fileUrls) map = await fileUrls(part.map((c) => `c-${c.id}-1.jpg`));
        else for (const c of part) map[`c-${c.id}-1.jpg`] = await fileUrl(`c-${c.id}-1.jpg`);
        if (!alive) return;
        setThumbs((p) => ({ ...p, ...Object.fromEntries(part.map((c) => [key(c), map[`c-${c.id}-1.jpg`] || null])) }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab, shownRefs, fileUrl, fileUrls, thumbs]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLink = async (url, memo, analyze = true) => {
    const id = newId("c");
    await onSaveRef({
      id,
      title: (analyze ? "분석 대기 — " : "보관 대기 — ") + url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40),
      source: { type: "link", url },
      meta: { url },
      memo,
      ...here(),
      job: { status: "queued", at: new Date().toISOString() },
    });
    await onQueue(id, "carousel", analyze ? {} : { analyze: false });
  };

  const addImages = async (files, memo, setStep, analyze = true) => {
    const id = newId("c");
    const slides = [];
    for (let i = 0; i < files.length; i++) {
      setStep(`사진 줄이는 중… ${i + 1}/${files.length}`);
      const { data, blob } = await shrinkImage(files[i]);
      slides.push({ data });
      await putFile(`c-${id}-${i + 1}.jpg`, blob, "image/jpeg");
    }
    if (!analyze) {
      // 보관만 — Claude 를 안 부른다. 나중에 열어서 '분석하기'
      const item = {
        id,
        title: memo.trim().slice(0, 40) || `캐러셀 ${files.length}장`,
        source: { type: "images" },
        memo,
        ...here(),
        slides: files.length,
        keepOnly: true,
        thumbAt: new Date().toISOString(),
        job: { status: "done", at: new Date().toISOString() },
      };
      await onSaveRef(item);
      return;
    }
    setStep("분석 중… (30초~1분)");
    const r = await analyzeCarousel({ slides, meta: null, memo });
    if (!r.ok) throw new Error(r.message);
    const item = {
      id,
      title: r.data.title,
      source: { type: "images" },
      memo,
      ...here(),
      slides: files.length,
      analysis: r.data,
      thumbAt: new Date().toISOString(),
      job: { status: "done", at: new Date().toISOString() },
    };
    await onSaveRef(item);
    setOpenRef(item);
  };

  const retry = async (item) => {
    if (item.source?.type === "images") {
      // 사진으로 넣은 캐러셀은 분석기(인스타)로 못 받는다 — 보관된 장 사진을 이 화면에서 줄여 바로 분석
      await onSaveRef({ ...item, job: { status: "working", step: "분석 중… (30초~1분)", at: new Date().toISOString() } });
      try {
        const slides = [];
        for (let i = 1; i <= (item.slides || 0); i++) {
          const u = await fileUrl(`c-${item.id}-${i}.jpg`);
          if (!u) continue;
          const blob = await (await fetch(u)).blob();
          slides.push({ data: (await shrinkImage(blob)).data });
        }
        if (!slides.length) throw new Error("보관된 장 사진을 못 찾았어요.");
        const r = await analyzeCarousel({ slides, meta: item.meta || null, memo: item.memo || "" });
        if (!r.ok) throw new Error(r.message);
        await onSaveRef({ ...item, title: r.data.title || item.title, analysis: r.data, keepOnly: false, job: { status: "done", at: new Date().toISOString() } });
      } catch (e) {
        await onSaveRef({ ...item, job: { status: "error", message: e?.message || "분석하지 못했어요.", at: new Date().toISOString() } });
      }
      return;
    }
    await onSaveRef({ ...item, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(item.id, "carousel");
  };

  const donePlan = async (item) => {
    await onSavePlan(item);
    if (!planning?.fill) setDraft(EMPTY_DRAFT);
    setPlanning(null);
    setViewPlan(item);
    setTab("plans");
  };

  const counts = useMemo(() => ({ refs: carousels.length, plans: plans.length }), [carousels, plans]);
  // 게시일 → 만든 날 순으로 최근 것이 위. 유형으로 거른다
  const shownPlans = useMemo(() => {
    const at = (p) => p.postOn || String(p.createdAt || "").slice(0, 10);
    return plans
      .filter((p) => planType === "all" || (planType === "none" ? !typeOf(p.kind) : p.kind === planType))
      .sort((a, b) => at(b).localeCompare(at(a)));
  }, [plans, planType]);
  const typeCount = (key) => plans.filter((p) => (key === "none" ? !typeOf(p.kind) : p.kind === key)).length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <GalleryHorizontal size={20} /> 캐러셀 기획
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          유형과 주제에서 시작해요. 상품은 넣어도 되고 나중에 골라도 돼요. 모아 둔 캐러셀·릴스 레퍼런스에서 배운 틀로 장별로 기획해요.
        </p>
      </div>

      <TrendBox online={online} />

      <div className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
        {[
          ["new", "새 기획"],
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

      {tab === "new" && <NewPlan draft={draft} setDraft={setDraft} stats={stats} onNext={() => setPlanning(draft)} />}

      {tab === "refs" && (
        <>
          <AddRef worker={worker} onLink={addLink} onImages={addImages} />
          <FolderBar items={carousels} folders={folders} sel={sel} onSel={setSel} onEdit={() => setEditCats(true)} q={q} setQ={setQ} searchPlaceholder="제목·표지·계정 검색" />
          {carousels.length === 0 ? (
            <Empty title="아직 모아 둔 캐러셀이 없어요." hint="잘 된 캐러셀 게시물 링크를 넣거나 장 사진을 올리세요. 기획할 때 여기서 배워요." />
          ) : shownRefs.length === 0 ? (
            <Empty title="이 폴더엔 아직 캐러셀이 없어요." hint="카드 오른쪽 아래 폴더 단추로 옮기거나, 이 폴더를 보면서 새로 넣으면 여기로 들어와요." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shownRefs.map((c) => (
                <RefCard
                  key={c.id}
                  item={c}
                  thumb={thumbs[key(c)]}
                  status={statusOf(c, queue)}
                  onOpen={setOpenRef}
                  folders={folders}
                  folderName={sel === "all" ? nameOfFolder(c) : ""}
                  onMove={(id) => onSaveRef({ ...c, folderId: id, folder: "" })}
                />
              ))}
            </div>
          )}
          {editCats && (
            <div className="backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-stone-900/45 p-2 sm:p-4">
              <button type="button" aria-label="닫기" onClick={() => setEditCats(false)} className="absolute inset-0 cursor-default" />
              <div className="sheet relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
                <CategoryEditor
                  items={carousels}
                  folders={folders}
                  onChange={saveFolders}
                  onClose={() => setEditCats(false)}
                  openKey="poclo_carousel_cats_open"
                  noun="캐러셀"
                  topHint="상위 폴더 이름 — 예: 코디 모음"
                />
              </div>
            </div>
          )}
          {!workerAlive(worker) && carousels.some((c) => statusOf(c, queue).kind === "queued") && (
            <p className="mt-3 text-xs text-stone-500">링크로 넣은 것은 사무실 PC 분석기가 켜지면 분석돼요.</p>
          )}
        </>
      )}

      {tab === "plans" &&
        (plans.length === 0 ? (
          <Empty title="아직 만든 기획안이 없어요." hint="'새 기획' 탭에서 유형을 고르면 기획이 시작돼요." />
        ) : (
          <>
            <TypeCompare plans={plans} />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[["all", "전체", plans.length], ...CAROUSEL_TYPES.map((t) => [t.key, t.name, typeCount(t.key)]), ...(typeCount("none") ? [["none", "유형 없음", typeCount("none")]] : [])].map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={planType === k}
                  onClick={() => setPlanType(k)}
                  className={"rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums " + (planType === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400")}
                >
                  {label} {n}
                </button>
              ))}
            </div>
            {shownPlans.length === 0 ? (
              <Empty title="이 유형의 기획안이 아직 없어요." hint="'새 기획' 탭에서 이 유형을 고르면 여기에 들어와요." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shownPlans.map((p) => (
                  <PlanCard key={p.id} p={p} onOpen={setViewPlan} />
                ))}
              </div>
            )}
          </>
        ))}

      {planning && (
        <Overlay onClose={() => setPlanning(null)}>
          <Planner job={planning} carousels={carousels} reels={reels} folders={folders} onDone={donePlan} onClose={() => setPlanning(null)} />
        </Overlay>
      )}
      {fillPick && (
        <Overlay wide onClose={() => setFillPick(null)}>
          <div className="flex max-h-[90vh] flex-col">
            <Head title="넣을 상품 고르기" sub={fillPick.title} onClose={() => setFillPick(null)} />
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ProductsTab
                stats={stats}
                onPick={(list) => {
                  const it = fillPick;
                  setFillPick(null);
                  setPlanning({ kind: it.kind, topic: it.topic || "", postOn: it.postOn || "", products: list, fill: it });
                }}
              />
            </div>
          </div>
        </Overlay>
      )}
      {viewPlan && !fillPick && !planning && (
        <Overlay wide onClose={() => setViewPlan(null)}>
          <PlanView item={plans.find((p) => p.id === viewPlan.id) || viewPlan} onRemove={onRemovePlan} onSave={onSavePlan} onFill={(it) => setFillPick(it)} onClose={() => setViewPlan(null)} />
        </Overlay>
      )}
      {openRef && (
        <Overlay wide="x" onClose={() => setOpenRef(null)}>
          {(() => {
            const it = carousels.find((c) => c.id === openRef.id) || openRef;
            return <RefDetail item={it} status={statusOf(it, queue)} fileUrl={fileUrl} onRetry={retry} onRemove={onRemoveRef} onSaveRef={onSaveRef} folders={folders} onClose={() => setOpenRef(null)} />;
          })()}
        </Overlay>
      )}
    </div>
  );
}
