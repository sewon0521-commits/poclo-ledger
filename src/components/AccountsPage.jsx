import { useEffect, useMemo, useState } from "react";
import {
  Radar,
  Loader2,
  RotateCw,
  Trash2,
  X,
  ExternalLink,
  Heart,
  MessageCircle,
  Play,
  Layers,
  Image as ImageIcon,
  Info,
  Plus,
} from "lucide-react";
import { newId } from "../lib/id";
import { WorkerStatus } from "./ContentBits";
import { Empty } from "./ui";

/**
 * 계정 아카이브 (세원 2026-09-23, 쇼필공 레퍼런스랩 '계정 아카이브' 참고):
 *   "계정의 릴스, 캐러셀, 광고소재까지 모니터링. 링크 넣고 스캔 누르면 그날부터.
 *    게재한 날, 중단한 날 다 추적되고 볼 수 있어."
 *
 * 스캔은 사무실 PC 분석기가 한다(poclo-cafe24/account_scan.py) — 등록할 때 한 번, 그 뒤 하루 한 번 저절로.
 *   인스타: 최근 게시물 12개 → 새 게시물은 날짜·좋아요·댓글·조회수까지
 *   광고 라이브러리: 게재 중인 광고 전부 → 처음 본 날·게재 시작일·중단한 날
 * 목록은 settings 'accounts', 계정마다 기록은 'acct_<id>'. 썸네일은 Storage reels/acct/<id>/.
 */

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";
const num = (n) => (n == null ? "—" : new Intl.NumberFormat("ko-KR").format(n));
const md = (d) => (d ? d.slice(5).replace("-", "/") : "");
const daysBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)) : null);
// 한국 날짜 (분석기가 쓰는 날짜와 같게)
const today = () => new Date().toLocaleDateString("sv-SE");
const handleOf = (t) => {
  const s = String(t || "").trim();
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  const h = m ? m[1] : s.replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) && !["p", "reel", "reels"].includes(h) ? h : "";
};
const isAdUrl = (s) => /facebook\.com\/ads\/library/i.test(String(s || ""));

function statusOf(acc, queue) {
  const q = queue.find((j) => j.id === acc.id && j.target === "account");
  if (q?.status === "working") return { kind: "working", text: q.step || "스캔 중" };
  if (q) return { kind: "queued", text: "스캔 대기 중" };
  if (acc.job?.status === "error") return { kind: "error", text: acc.job.message || "스캔 실패" };
  return { kind: "done" };
}

// ------------------------------------------------------------------ 등록

function AddAccount({ worker, onAdd }) {
  const [ig, setIg] = useState("");
  const [ad, setAd] = useState("");
  const [busy, setBusy] = useState(false);
  const handle = handleOf(ig);
  const ok = (handle || isAdUrl(ad)) && (!ad.trim() || isAdUrl(ad));
  return (
    <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="인스타 계정 링크 또는 @아이디" className={FIELD + " text-sm"} />
        <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="광고 라이브러리 링크 (선택)" className={FIELD + " text-sm"} />
        <button
          type="button"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onAdd({ handle, adUrl: ad.trim() });
              setIg("");
              setAd("");
            } finally {
              setBusy(false);
            }
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} 스캔
        </button>
      </div>
      {ad.trim() && !isAdUrl(ad) && <p className="mt-1.5 text-xs text-rose-700">광고 라이브러리 주소(facebook.com/ads/library/…)를 넣어주세요.</p>}
      <p className="mt-2 text-xs leading-relaxed text-stone-400">
        스캔한 날부터 기록해요. 그 뒤로는 <b className="font-medium text-stone-500">하루 한 번 저절로</b> 다시 봐서 새 게시물, 새로 켠 광고, 중단한 광고를 잡아요.
        광고 링크는 메타 광고 라이브러리에서 그 브랜드를 검색한 주소를 그대로 붙이면 돼요.
      </p>
      <WorkerStatus worker={worker} />
    </div>
  );
}

// ------------------------------------------------------------------ 계정 카드

function AccountCard({ acc, status, onOpen }) {
  const c = acc.counts || {};
  const pending = status.kind !== "done";
  return (
    <button type="button" onClick={() => onOpen(acc)} className="rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-rose-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-900">{acc.name || (acc.handle ? `@${acc.handle}` : "광고만")}</div>
          {acc.handle && <div className="truncate text-xs text-stone-400">@{acc.handle}</div>}
        </div>
        {pending ? (
          <span className={"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium " + (status.kind === "error" ? "bg-rose-600 text-white" : "bg-amber-400 text-amber-950")}>
            {status.text}
          </span>
        ) : (
          acc.delta && (acc.delta.newPosts > 0 || acc.delta.newAds > 0 || acc.delta.stopped > 0) && (
            <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              새 소식 {acc.delta.newPosts + acc.delta.newAds + acc.delta.stopped}
            </span>
          )
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {[
          ["릴스", c.reels],
          ["캐러셀", c.carousels],
          ["게재 중 광고", acc.adUrl ? c.adsActive : null],
          ["중단 광고", acc.adUrl ? c.adsStopped : null],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-stone-50 py-1.5">
            <div className="text-sm font-semibold tabular-nums text-stone-900">{v == null ? "—" : num(v)}</div>
            <div className="text-[10px] text-stone-400">{k}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-stone-400">
        {md(acc.addedAt)} 부터 추적 · 마지막 스캔 {acc.lastScan ? new Date(acc.lastScan).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "아직"}
      </div>
      {acc.note && <div className="mt-1 line-clamp-2 text-[11px] text-amber-700">{acc.note}</div>}
    </button>
  );
}

// ------------------------------------------------------------------ 계정 상세

function PostTile({ p, url, onKeep }) {
  const Icon = p.kind === "reel" ? Play : p.kind === "carousel" ? Layers : ImageIcon;
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <a href={p.url} target="_blank" rel="noreferrer" className="relative block aspect-[4/5] bg-stone-100">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          <Icon size={10} /> {p.kind === "carousel" ? `${p.slides}장` : p.kind === "reel" ? "릴스" : "사진"}
        </span>
        {p.firstSeen && p.firstSeen === today() && (
          <span className="absolute top-1.5 right-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">NEW</span>
        )}
      </a>
      <div className="space-y-1 px-2.5 py-2 text-[11px]">
        <div className="flex items-center justify-between text-stone-500">
          <span>{md(p.takenAt) || `${md(p.firstSeen)} 발견`}</span>
          <span className="flex items-center gap-2 tabular-nums">
            {p.likes != null && (
              <span className="flex items-center gap-0.5">
                <Heart size={10} /> {num(p.likes)}
              </span>
            )}
            {p.comments != null && (
              <span className="flex items-center gap-0.5">
                <MessageCircle size={10} /> {num(p.comments)}
              </span>
            )}
            {p.views != null && (
              <span className="flex items-center gap-0.5">
                <Play size={10} /> {num(p.views)}
              </span>
            )}
          </span>
        </div>
        {p.caption && <div className="line-clamp-2 text-stone-600">{p.caption}</div>}
        {(p.kind === "reel" || p.kind === "carousel") && (
          <button type="button" onClick={() => onKeep(p)} className="flex items-center gap-1 font-medium text-rose-700 hover:underline">
            <Plus size={11} /> {p.kind === "reel" ? "릴스 라이브러리에 담기" : "캐러셀 레퍼런스에 담기"}
          </button>
        )}
      </div>
    </div>
  );
}

function AdTile({ a, url }) {
  const end = a.active ? today() : a.stoppedAt || a.lastSeen;
  const days = daysBetween(a.startAt || a.firstSeen, end);
  return (
    <div className={"overflow-hidden rounded-xl border bg-white " + (a.active ? "border-stone-200" : "border-stone-200 opacity-75")}>
      <a href={`https://www.facebook.com/ads/library/?id=${a.id}`} target="_blank" rel="noreferrer" className="relative block aspect-square bg-stone-100">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
        <span className={"absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold " + (a.active ? "bg-emerald-600 text-white" : "bg-stone-700 text-white")}>
          {a.active ? "게재 중" : `중단 ${md(a.stoppedAt)}`}
        </span>
        <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          {a.video ? "영상" : a.format || "사진"}
          {a.cards > 1 ? ` ${a.cards}장` : ""}
        </span>
        {days != null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-stone-800">{days}일째</span>
        )}
      </a>
      <div className="space-y-0.5 px-2.5 py-2 text-[11px]">
        <div className="text-stone-500">
          {md(a.startAt)} 게재 시작{a.firstSeen && a.firstSeen !== a.startAt ? ` · ${md(a.firstSeen)} 발견` : ""}
        </div>
        {a.text && <div className="line-clamp-3 text-stone-700">{a.text}</div>}
        {a.cta && <div className="text-stone-400">버튼: {a.cta}</div>}
        {a.active && a.outOfTop && <div className="text-amber-700">아직 게재 중 · 노출 순위 밖으로 밀림</div>}
      </div>
    </div>
  );
}

function Detail({ acc, status, load, fileUrls, onRescan, onRemove, onSave, onKeepReel, onKeepCarousel, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(acc.handle ? "reel" : "ads");
  const [adFilter, setAdFilter] = useState("active");
  const [adSort, setAdSort] = useState("long");
  const [urls, setUrls] = useState({});
  const [adUrl, setAdUrl] = useState(acc.adUrl || "");
  const [kept, setKept] = useState({});

  useEffect(() => {
    let alive = true;
    load(acc.id).then((d) => alive && setData(d || { posts: {}, ads: {} }));
    return () => {
      alive = false;
    };
  }, [acc.id, acc.lastScan, load]);

  const posts = useMemo(
    () => Object.values(data?.posts || {}).sort((a, b) => (b.takenAt || b.firstSeen || "").localeCompare(a.takenAt || a.firstSeen || "")),
    [data],
  );
  const ads = useMemo(() => {
    const list = Object.values(data?.ads || {}).filter((a) => (adFilter === "all" ? true : adFilter === "active" ? a.active : !a.active));
    const dur = (a) => daysBetween(a.startAt || a.firstSeen, a.active ? today() : a.stoppedAt || a.lastSeen) || 0;
    return list.sort((a, b) => (adSort === "long" ? dur(b) - dur(a) : (b.startAt || "").localeCompare(a.startAt || "")));
  }, [data, adFilter, adSort]);

  const shown = useMemo(() => (tab === "ads" ? [] : posts.filter((p) => p.kind === tab)), [tab, posts]);
  // 보이는 것의 썸네일만 서명 주소로 받는다
  useEffect(() => {
    const keys = [...(tab === "ads" ? ads : shown).map((x) => x.thumb).filter(Boolean)].filter((k) => !urls[k]).slice(0, 120);
    if (!keys.length) return;
    let alive = true;
    fileUrls(keys).then((m) => alive && setUrls((u) => ({ ...u, ...m })));
    return () => {
      alive = false;
    };
  }, [tab, ads, shown, fileUrls, urls]);

  const c = acc.counts || {};
  const TABS = [
    ...(acc.handle
      ? [
          ["reel", `릴스 ${num(c.reels || 0)}`],
          ["carousel", `캐러셀 ${num(c.carousels || 0)}`],
          ["photo", `사진 ${num(c.photos || 0)}`],
        ]
      : []),
    ["ads", `광고소재 ${num((c.adsActive || 0) + (c.adsStopped || 0))}`],
  ];

  return (
    <div className="flex max-h-[92vh] flex-col">
      <header className="shrink-0 border-b border-stone-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-stone-900">{acc.name || `@${acc.handle}`}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
              {acc.handle && (
                <a href={`https://www.instagram.com/${acc.handle}/`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-700 hover:underline">
                  <ExternalLink size={11} /> @{acc.handle}
                </a>
              )}
              <span>{md(acc.addedAt)} 부터 추적</span>
              <span>스캔 {(data?.scans || []).length}번</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>
        {status.kind !== "done" && (
          <div className={"mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs " + (status.kind === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900")}>
            {status.kind === "error" ? <Info size={13} /> : <Loader2 size={13} className="animate-spin" />}
            {status.text}
          </div>
        )}
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1 text-sm">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={"flex-1 rounded-lg px-2 py-1.5 font-medium whitespace-nowrap " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!data ? (
          <div className="flex justify-center py-10 text-stone-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : tab === "ads" ? (
          !acc.adUrl ? (
            <div className="space-y-2 rounded-xl border border-dashed border-stone-300 p-4 text-sm">
              <p className="text-stone-600">광고 라이브러리 링크를 넣으면 이 계정의 광고소재도 추적해요.</p>
              <div className="flex gap-2">
                <input value={adUrl} onChange={(e) => setAdUrl(e.target.value)} placeholder="https://www.facebook.com/ads/library/?…" className={FIELD + " min-w-0 flex-1 text-sm"} />
                <button
                  type="button"
                  disabled={!isAdUrl(adUrl)}
                  onClick={() => onSave({ ...acc, adUrl: adUrl.trim() }, true)}
                  className="rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:bg-stone-300"
                >
                  넣고 스캔
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                {[
                  ["active", `게재 중 ${num(c.adsActive || 0)}`],
                  ["stopped", `중단 ${num(c.adsStopped || 0)}`],
                  ["all", "전체"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAdFilter(k)}
                    className={"rounded-full border px-3 py-1 font-medium " + (adFilter === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white text-stone-600")}
                  >
                    {label}
                  </button>
                ))}
                <select value={adSort} onChange={(e) => setAdSort(e.target.value)} className="ml-auto rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs">
                  <option value="long">오래 켠 순 (잘 되는 소재)</option>
                  <option value="new">최근 시작 순</option>
                </select>
              </div>
              <p className="mb-3 text-[11px] text-stone-400">
                광고를 오래 켜 둘수록 성과가 나는 소재일 가능성이 커요. 게재 시작일은 메타가 알려준 날짜, 중단일은 스캔에서 사라진 날이에요.
              </p>
              {ads.length === 0 ? (
                <Empty title="해당하는 광고가 없어요." hint="다음 스캔을 기다리거나 필터를 바꿔 보세요." />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {ads.map((a) => (
                    <AdTile key={a.id} a={a} url={urls[a.thumb]} />
                  ))}
                </div>
              )}
            </>
          )
        ) : shown.length === 0 ? (
          <Empty title="아직 없어요." hint="최근 게시물 12개 안에 이 종류가 없거나 스캔 전이에요. 하루 한 번 새로 쌓여요." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((p) => (
              <div key={p.code} className="relative">
                <PostTile
                  p={p}
                  url={urls[p.thumb]}
                  onKeep={async (x) => {
                    if (x.kind === "reel") await onKeepReel(x.url, acc);
                    else await onKeepCarousel(x.url, acc);
                    setKept((k) => ({ ...k, [x.code]: true }));
                  }}
                />
                {kept[p.code] && (
                  <span className="absolute inset-x-2 bottom-2 rounded bg-emerald-600 px-2 py-1 text-center text-[11px] font-medium text-white">담았어요 — 분석 대기</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`${acc.name || acc.handle} 추적을 멈추고 기록을 지울까요?`)) {
              onRemove(acc.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
        >
          <Trash2 size={13} /> 추적 그만하기
        </button>
        <button
          type="button"
          disabled={status.kind === "working" || status.kind === "queued"}
          onClick={() => onRescan(acc)}
          className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 disabled:opacity-50"
        >
          <RotateCw size={12} /> 지금 다시 스캔
        </button>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------- 화면

export default function AccountsPage({
  accounts,
  onSave,
  onRemove,
  load,
  fileUrls,
  worker,
  queue,
  onQueue,
  onPoll,
  onSaveReel,
  onSaveCarousel,
}) {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    onPoll();
    const t = setInterval(onPoll, 4000);
    return () => clearInterval(t);
  }, [onPoll]);

  const scan = async (acc) => {
    await onSave({ ...acc, job: { status: "queued", at: new Date().toISOString() } });
    await onQueue(acc.id, "account");
  };

  const add = async ({ handle, adUrl }) => {
    const exists = accounts.find((a) => handle && a.handle === handle);
    if (exists) {
      await scan({ ...exists, adUrl: adUrl || exists.adUrl });
      setOpen(exists);
      return;
    }
    const acc = { id: newId("ac"), handle, adUrl, name: "", addedAt: today(), counts: {} };
    await scan(acc);
  };

  // 계정 아카이브의 게시물을 라이브러리로 — 기존 분석 흐름(사무실 PC)에 그대로 태운다
  const keepReel = async (url, acc) => {
    const id = newId("r");
    await onSaveReel({
      id,
      title: `분석 대기 — @${acc.handle}`,
      source: { type: "link", url },
      meta: { url },
      memo: `계정 아카이브 @${acc.handle}`,
      shop: { name: acc.name || `@${acc.handle}`, url: `https://www.instagram.com/${acc.handle}/` },
      job: { status: "queued", at: new Date().toISOString() },
      filled: [],
    });
    await onQueue(id, "ref");
  };
  const keepCarousel = async (url, acc) => {
    const id = newId("c");
    await onSaveCarousel({
      id,
      title: `분석 대기 — @${acc.handle}`,
      source: { type: "link", url },
      meta: { url },
      memo: `계정 아카이브 @${acc.handle}`,
      job: { status: "queued", at: new Date().toISOString() },
    });
    await onQueue(id, "carousel");
  };

  const sorted = [...accounts].sort((a, b) => (b.lastScan || "").localeCompare(a.lastScan || ""));

  return (
    <div>
      <div className="mb-4">
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
          <Radar size={20} /> 계정 아카이브
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          경쟁·참고 계정의 릴스·캐러셀과 광고소재를 등록한 날부터 매일 기록해요. 광고를 언제 켜고 언제 껐는지까지.
        </p>
      </div>

      <AddAccount worker={worker} onAdd={add} />

      {sorted.length === 0 ? (
        <Empty title="아직 추적하는 계정이 없어요." hint="위에 인스타 계정 링크(와 광고 라이브러리 링크)를 넣고 스캔을 누르세요." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((a) => (
            <AccountCard key={a.id} acc={a} status={statusOf(a, queue)} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 sm:p-4">
          <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="absolute inset-0 cursor-default" />
          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            {(() => {
              const acc = accounts.find((a) => a.id === open.id) || open;
              return (
                <Detail
                  key={acc.id}
                  acc={acc}
                  status={statusOf(acc, queue)}
                  load={load}
                  fileUrls={fileUrls}
                  onRescan={scan}
                  onRemove={onRemove}
                  onSave={(a, rescan) => (rescan ? scan(a) : onSave(a))}
                  onKeepReel={keepReel}
                  onKeepCarousel={keepCarousel}
                  onClose={() => setOpen(null)}
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
