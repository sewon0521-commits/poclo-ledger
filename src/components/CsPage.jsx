import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Plus, Search, X, Copy, Check, RefreshCw, Wand2, AlertTriangle, ExternalLink, Trash2, Undo2, ImagePlus, Settings2, CircleCheck, Inbox, Package } from "lucide-react";
import { loadKey, changeKey, upsert, remove } from "../lib/shoot";
import { CHANNELS, channelOf, isAuto, TYPES, STATUS, TABS, inTab, finalText, openBlanks, staleDone, archiveKey, productUrl, withDefaults, when } from "../lib/cs";
import { shrink } from "../lib/photos";
import { clipImages, filesOf } from "../lib/pasteImages";
import { newId } from "../lib/id";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 일 › CS 관리 (lib/cs.js 머리말).
 * 영상(온라인테크트리 CS 자동화)의 화면 구조: 위 숫자(답할 문의 · 보낼 준비 · 오늘 처리 · 자동 수집) → 왼쪽 문의 목록 · 오른쪽 원문과 답변 초안 →
 * 빈칸 채우기 → '확인했어요' 체크 → 보내기. 색·부품은 포클로ERP 것.
 */

const FIELD = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-100";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function draftApi(body) {
  const r = await fetch("/api/cs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", effort: "low", ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `초안을 만들지 못했어요 (${r.status})`);
  return j;
}

/** 초안 결과 → 문의 칸 (빈칸에 적어 둔 값은 같은 빈칸이면 이어 쓴다) */
function applyDraft(x, r) {
  const fills = Object.fromEntries(Object.entries(x.fills || {}).filter(([k]) => (r.blanks || []).some((b) => b.key === k)));
  return {
    ...x,
    type: r.type || x.type,
    summary: r.summary || x.summary,
    customer: x.customer || r.customer || "",
    message: x.message || r.message || "",
    product: x.product?.name || x.product?.url || !r.product ? x.product : { ...(x.product || {}), name: r.product },
    orderNo: x.orderNo || r.orderNo || "",
    caution: r.caution || "",
    check: r.check || [],
    blanks: r.blanks || [],
    fills,
    draft: r.draft || "",
    confirmed: false,
    status: "ready",
    error: "",
    cost: (x.cost || 0) + (r._cost?.won || 0),
    draftedAt: new Date().toISOString(),
  };
}

const requestOf = (x, tpl, extra = {}) => ({
  channel: x.channel,
  customer: x.customer,
  title: x.title,
  text: x.message,
  at: x.at,
  product: x.product?.url ? { url: x.product.url } : x.product?.name ? { name: x.product.name } : undefined,
  order: x.order,
  templates: tpl,
  ...extra,
});

/** 데이터 — 문의 · 답변 틀 · 사무실 PC 상태. 화면이 떠 있는 동안 PC 상태를 15초마다 보고, PC 가 문의를 바꿨으면 다시 읽는다 */
function useCs(online) {
  const [inbox, setInbox] = useState([]);
  const [tpl, setTpl] = useState(() => withDefaults(null));
  const [worker, setWorker] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const lastInbox = useRef("");

  const loadInbox = useCallback(async () => {
    const v = await loadKey("cs_inbox", online);
    setInbox(v.items || []);
    setLoaded(true);
  }, [online]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [v, t] = await Promise.all([loadKey("cs_inbox", online), loadKey("cs_templates", online, null)]);
        if (!alive) return;
        setTpl(withDefaults(t));
        // 한 번도 저장 안 했으면 기본 틀을 저장해 둔다 — 사무실 PC 가 카페24 문의 초안을 쓸 때 이걸 읽는다
        if (!t) changeKey("cs_templates", online, () => withDefaults(null), null).catch(() => {});
        // 처리 끝난 지 7일 넘은 것은 달마다 따로(목록을 가볍게)
        const old = staleDone(v.items);
        if (old.length) {
          const byKey = {};
          for (const x of old) (byKey[archiveKey(x.doneAt || x.sentAt || x.createdAt)] ||= []).push(x);
          for (const [k, list] of Object.entries(byKey)) await changeKey(k, online, (a) => ({ ...a, items: [...list, ...(a.items || []).filter((y) => !list.some((z) => z.id === y.id))] }));
          const ids = new Set(old.map((x) => x.id));
          const next = await changeKey("cs_inbox", online, (a) => ({ ...a, items: (a.items || []).filter((y) => !ids.has(y.id)) }));
          if (alive) setInbox(next.items || []);
        } else setInbox(v.items || []);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [online]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const w = await loadKey("cs_worker", online, {});
        if (!alive) return;
        setWorker(w);
        if (w.inboxAt && w.inboxAt !== lastInbox.current) {
          if (lastInbox.current) loadInbox();
          lastInbox.current = w.inboxAt;
        }
      } catch {
        /* 다음에 */
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    const vis = () => !document.hidden && (tick(), loadInbox());
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [online, loadInbox]);

  const saveItem = useCallback(
    async (item) => {
      setInbox((l) => (l.some((y) => y.id === item.id) ? l.map((y) => (y.id === item.id ? { ...y, ...item } : y)) : [item, ...l]));
      const next = await changeKey("cs_inbox", online, upsert(item));
      setInbox(next.items || []);
    },
    [online],
  );
  const dropItem = useCallback(
    async (id) => {
      setInbox((l) => l.filter((y) => y.id !== id));
      await changeKey("cs_inbox", online, remove(id));
    },
    [online],
  );
  const saveTpl = useCallback(
    async (t) => {
      setTpl(withDefaults(t));
      await changeKey("cs_templates", online, () => t, null);
    },
    [online],
  );
  const enqueue = useCallback(
    (job) =>
      changeKey("cs_queue", online, (v) => ({
        ...v,
        items: [...(v.items || []).filter((j) => !(j.id === job.id && j.kind === job.kind)), { ...job, at: new Date().toISOString() }],
      })),
    [online],
  );
  return { inbox, tpl, worker, loaded, loadInbox, saveItem, dropItem, saveTpl, enqueue };
}

function ChannelBadge({ k, className = "" }) {
  const c = channelOf(k);
  return <span className={"inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " + c.tone + " " + className}>{c.short}</span>;
}
function StatusChip({ s }) {
  const st = STATUS[s || "new"] || STATUS.new;
  return <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + st.tone}>{st.label}</span>;
}

export default function CsPage({ online, products = [] }) {
  const D = useCs(online);
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem("poclo_cs_tab") || "todo";
    } catch {
      return "todo";
    }
  });
  const [q, setQ] = useState("");
  const [ch, setCh] = useState("");
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(null); // {images?:[dataURL]} — 문의 붙여넣기 창
  const [tplOpen, setTplOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [wide, setWide] = useState(() => window.matchMedia?.("(min-width: 1024px)").matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 1024px)");
    if (!mq) return;
    const f = () => setWide(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const pickTab = (t) => {
    setTab(t);
    try {
      localStorage.setItem("poclo_cs_tab", t);
    } catch {
      /* 무시 */
    }
  };

  // 캡처를 화면 아무 데나 Ctrl+V · 끌어다 놓기 → 문의 붙여넣기 창
  useEffect(() => {
    const onPaste = async (e) => {
      if (adding || tplOpen || e.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const c = clipImages(e.clipboardData);
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!c.files.length && !c.urls.length && !text.trim()) return;
      e.preventDefault();
      const files = await filesOf(c);
      const images = await Promise.all(files.slice(0, 4).map((f) => shrink(f).catch(() => null)));
      setAdding({ images: images.filter(Boolean), text: files.length ? "" : text });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adding, tplOpen]);

  // 지금 시각 — 30초마다 (PC 켜짐 판단·'몇 분 전')
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const today = new Date(now).toDateString();
  const counts = useMemo(
    () => ({
      todo: D.inbox.filter((x) => inTab(x, "todo")).length,
      approved: D.inbox.filter((x) => inTab(x, "approved")).length,
      doneToday: D.inbox.filter((x) => inTab(x, "done") && new Date(x.doneAt || x.sentAt || 0).toDateString() === today).length,
    }),
    [D.inbox, today],
  );
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return D.inbox
      .filter((x) => inTab(x, tab) && (!ch || x.channel === ch))
      .filter((x) => !w || [x.customer, x.summary, x.title, x.message, x.product?.name, x.orderNo, x.type].join(" ").toLowerCase().includes(w))
      .sort((a, b) => String(b.at || b.createdAt).localeCompare(String(a.at || a.createdAt)));
  }, [D.inbox, tab, ch, q]);
  const current = D.inbox.find((x) => x.id === sel) || (wide ? shown[0] : null) || null;

  const w = D.worker || {};
  const pcOn = w.at && now - new Date(w.at).getTime() < 3 * 60000;
  const c24 = w.channels?.cafe24 || null;
  const needsScope = c24 && !c24.ok && /권한|scope/i.test(c24.msg || "");

  const collectNow = async () => {
    await D.enqueue({ id: "collect", kind: "collect" });
    setMsg(pcOn ? "사무실 PC 에 '지금 모으기'를 맡겼어요 — 1분 안에 들어와요." : "사무실 PC 가 꺼져 있어요 — 켜지면 모아요.");
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">CS 관리</h2>
          <p className="mt-0.5 text-sm text-stone-500">흩어진 문의를 한곳에 모으고, 초안은 AI가 — 보내는 건 확인한 다음에.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTplOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
            <Settings2 size={15} /> 답변 틀
          </button>
          <button type="button" onClick={collectNow} title="카페24 게시판(상품 Q&A · 1:1 상담)을 지금 모아요" className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
            <RefreshCw size={15} /> 지금 모으기
          </button>
          <button type="button" onClick={() => setAdding({})} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            <Plus size={16} /> 문의 붙여넣기
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="답할 문의" value={counts.todo} sub="초안 확인하고 보내 주세요" tone={counts.todo ? "text-rose-700" : "text-stone-900"} onClick={() => pickTab("todo")} />
        <Stat label="보낼 준비" value={counts.approved} sub="확인 끝 · 카페24로 나가는 중" onClick={() => pickTab("approved")} />
        <Stat label="오늘 처리" value={counts.doneToday} sub="보냈거나 처리 완료" onClick={() => pickTab("done")} />
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <div className="text-xs font-medium text-stone-500">카페24 자동 수집</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <span className={"h-2 w-2 rounded-full " + (pcOn && c24?.ok ? "bg-emerald-500" : pcOn ? "bg-amber-400" : "bg-stone-300")} />
            {!pcOn ? "PC 꺼짐" : !c24 ? "준비 중" : c24.ok ? "10분마다" : "확인 필요"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-stone-400">{c24?.at ? `마지막 ${when(c24.at)}` : "사무실 PC 가 모아요"}</div>
        </div>
      </section>

      {needsScope && <ScopeHelp msg={c24.msg} />}
      {c24 && !c24.ok && !needsScope && (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0" /> 카페24 문의를 못 모았어요: {c24.msg}
        </p>
      )}
      {msg && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-700">
          {msg}
          <button type="button" onClick={() => setMsg("")} aria-label="닫기" className="text-stone-400 hover:text-stone-700">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => pickTab(k)} className={"rounded-lg px-3 py-1.5 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
              {k === "todo" && counts.todo > 0 && <span className="ml-1 text-rose-700">{counts.todo}</span>}
              {k === "approved" && counts.approved > 0 && <span className="ml-1 text-sky-700">{counts.approved}</span>}
            </button>
          ))}
        </div>
        <span className="relative min-w-40 flex-1">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="고객·상품·문의 내용 찾기" className="w-full rounded-xl border border-stone-200 bg-white py-2 pr-3 pl-8 text-sm outline-none focus:border-rose-600" />
        </span>
        <select value={ch} onChange={(e) => setCh(e.target.value)} className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700">
          <option value="">모든 채널</option>
          {CHANNELS.map((c) => (
            <option key={c.k} value={c.k}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {!D.loaded ? (
        <div className="flex items-center gap-2 py-12 text-sm text-stone-400">
          <Loader2 size={16} className="animate-spin" /> 문의를 불러오는 중…
        </div>
      ) : D.inbox.length === 0 ? (
        <Empty onAdd={() => setAdding({})} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <ul className="space-y-2 lg:max-h-[calc(100vh-300px)] lg:overflow-y-auto lg:pr-1">
            {shown.length === 0 && <li className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-400">여기에는 문의가 없어요.</li>}
            {shown.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setSel(x.id)}
                  className={
                    "block w-full rounded-2xl border bg-white p-3 text-left transition-colors " +
                    (current?.id === x.id && wide ? "border-rose-300 ring-2 ring-rose-100" : "border-stone-200 hover:border-stone-300")
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <ChannelBadge k={x.channel} />
                    {x.type && <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">{x.type}</span>}
                    <span className="ml-auto">
                      <StatusChip s={x.status} />
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-sm font-semibold text-stone-900">{x.summary || x.title || (x.message || "").slice(0, 40) || "문의"}</span>
                  {x.message && <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-stone-500">{x.message}</span>}
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-400">
                    <span className="truncate">{[x.customer, x.product?.name].filter(Boolean).join(" · ") || "고객 정보 없음"}</span>
                    <span className="ml-auto shrink-0">{when(x.at || x.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {wide ? (
            current ? (
              <Detail key={current.id} x={current} D={D} pcOn={pcOn} onMsg={setMsg} />
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-16 text-center text-sm text-stone-400">왼쪽에서 문의를 고르면 원문과 답변 초안이 여기에 떠요.</div>
            )
          ) : (
            current && (
              <Sheet onClose={() => setSel(null)} wide>
                <SheetHead title={`${current.customer || "고객"}님 문의`} onClose={() => setSel(null)} />
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <Detail key={current.id} x={current} D={D} pcOn={pcOn} onMsg={setMsg} bare />
                </div>
              </Sheet>
            )
          )}
        </div>
      )}

      {adding && <AddSheet init={adding} D={D} products={products} onClose={() => setAdding(null)} onAdded={(id) => (pickTab("todo"), setSel(id))} />}
      {tplOpen && <TemplateSheet tpl={D.tpl} onSave={D.saveTpl} onClose={() => setTplOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-stone-900", onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-stone-200 bg-white p-3 text-left hover:border-stone-300">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className={"mt-0.5 text-2xl font-bold tabular-nums " + tone}>{value}</div>
      <div className="truncate text-[11px] text-stone-400">{sub}</div>
    </button>
  );
}

function Empty({ onAdd }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <Inbox size={28} className="mx-auto text-stone-300" />
      <p className="mt-3 text-sm font-semibold text-stone-800">아직 들어온 문의가 없어요</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">
        카페24 게시판(상품 Q&A · 1:1 상담)은 사무실 PC가 10분마다 모아 와요. 카톡 채널 · 톡톡 · 인스타 DM 은 문의를 복사하거나 캡처해서 여기에 붙여넣으면 초안이 바로 만들어져요.
      </p>
      <button type="button" onClick={onAdd} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">
        <Plus size={15} /> 문의 붙여넣기
      </button>
    </div>
  );
}

/** 카페24 게시판 권한이 없을 때 — 세원이 한 번 해 줄 것 */
function ScopeHelp({ msg }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={15} /> 카페24 게시판 문의를 모으려면 권한을 한 번 열어 주세요
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed">
        <li>
          카페24 개발자센터(developers.cafe24.com) → 포클로 앱 → <b>권한(스코프)</b>에서 <b>게시판(커뮤니티) 읽기·쓰기</b>를 켜고 저장
        </li>
        <li>쇼핑몰 관리자에서 그 앱을 <b>다시 설치(재동의)</b> — 9/21 할인 권한을 열 때와 같아요</li>
        <li>
          사무실 PC에서 <b>1_카페24인증.bat</b> 실행 → 브라우저에서 '동의'
        </li>
      </ol>
      <p className="mt-2 text-[11px] text-amber-800/80">그다음부터 10분마다 저절로 모이고, '보내기'를 누르면 카페24에 답글이 달려요. ({msg})</p>
    </div>
  );
}

// ------------------------------------------------------------------ 문의 하나

function Detail({ x, D, pcOn, onMsg, bare = false }) {
  const [v, setV] = useState(x);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [instruct, setInstruct] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const timer = useRef(null);
  // 다른 데서 바뀌면(PC 가 보냄 등) 따라간다 — 내가 고치는 중인 칸(초안·빈칸·메모·확인)은 그대로
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    setV((p) => ({ ...x, draft: p.draft, fills: p.fills, basis: p.basis, confirmed: x.status !== p.status ? x.confirmed : p.confirmed }));
  }, [x]);
  const save = (patch, now = false) => {
    const next = { ...v, ...patch };
    setV(next);
    clearTimeout(timer.current);
    const go = () => D.saveItem({ id: x.id, ...patch, draft: next.draft, fills: next.fills, basis: next.basis, confirmed: next.confirmed });
    if (now) return go();
    timer.current = setTimeout(go, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const text = finalText(v);
  const open = openBlanks(v);
  const auto = isAuto(v.channel);
  const ready = !!v.draft && !open.length && v.confirmed;
  const sentLike = ["approved", "sending", "sent", "done"].includes(v.status);

  const redraft = async () => {
    setBusy("draft");
    setErr("");
    try {
      const r = await draftApi(requestOf(v, D.tpl, { previous: v.draft || undefined, instruct: instruct.trim() || undefined }));
      const next = applyDraft(v, r);
      setV(next);
      await D.saveItem(next);
      setInstruct("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };
  const send = async () => {
    if (!ready) return;
    setBusy("send");
    try {
      const patch = { status: "approved", final: text, approvedAt: new Date().toISOString(), error: "" };
      setV((p) => ({ ...p, ...patch }));
      await D.saveItem({ id: x.id, ...patch, draft: v.draft, fills: v.fills, basis: v.basis, confirmed: true });
      await D.enqueue({ id: x.id, kind: "send" });
      onMsg(pcOn ? "보낼 준비 끝 — 사무실 PC가 카페24에 답글을 달아요(1분 안)." : "보낼 준비 끝 — 사무실 PC가 꺼져 있어요. 켜지면 카페24에 답글을 달아요.");
    } finally {
      setBusy("");
    }
  };
  const copyDone = async (done) => {
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
    if (ok && done) {
      const patch = { status: "done", final: text, doneAt: new Date().toISOString() };
      setV((p) => ({ ...p, ...patch }));
      await D.saveItem({ id: x.id, ...patch, draft: v.draft, fills: v.fills, basis: v.basis, confirmed: v.confirmed });
      onMsg(`복사했어요 — ${channelOf(v.channel).label} 채팅창에 붙여넣어 보내 주세요. '처리 완료'로 옮겼어요.`);
    }
  };
  const reopen = () => save({ status: v.draft ? "ready" : "new", final: "", doneAt: "", sentAt: "", confirmed: false }, true);
  const markDone = () => save({ status: "done", final: text, doneAt: new Date().toISOString() }, true);

  return (
    <article className={bare ? "space-y-4" : "space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"}>
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <ChannelBadge k={v.channel} />
          <span className="text-xs text-stone-500">{channelOf(v.channel).label}</span>
          <span className="ml-auto">
            <StatusChip s={v.status} />
          </span>
        </div>
        <h3 className="text-lg font-bold text-stone-900">{v.customer ? `${v.customer} 고객님 문의` : "고객 문의"}</h3>
        <p className="text-xs text-stone-400">
          {v.at ? `접수 ${when(v.at)}` : ""}
          {v.createdAt ? ` · 들어옴 ${when(v.createdAt)}` : ""}
          {v.cost ? ` · 초안 약 ${v.cost}원` : ""}
          {v.ext?.url && (
            <a href={v.ext.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-rose-700 hover:underline">
              원문 보기 <ExternalLink size={11} />
            </a>
          )}
        </p>
      </header>

      <section>
        <div className="mb-1 text-[11px] font-semibold text-stone-400">고객이 보낸 말</div>
        {v.title && <div className="mb-1 text-sm font-semibold text-stone-800">{v.title}</div>}
        <div className="rounded-xl bg-stone-50 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">{v.message || "(캡처에서 글을 못 읽었어요)"}</div>
      </section>

      {(v.product?.name || v.product?.url || v.orderNo || v.order) && (
        <section className="flex flex-wrap gap-2 text-xs">
          {(v.product?.name || v.product?.url) && (
            <a href={v.product.url || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-stone-700 hover:bg-stone-200">
              <Package size={12} /> {v.product.name || "상품 페이지"}
            </a>
          )}
          {v.orderNo && <span className="rounded-lg bg-stone-100 px-2 py-1 text-stone-700">주문 {v.orderNo}</span>}
          {(v.order?.orders || []).slice(0, 3).map((o) => (
            <span key={o.id} className="rounded-lg bg-sky-50 px-2 py-1 text-sky-900">
              {[o.id, o.status, o.invoice && `송장 ${o.invoice}`].filter(Boolean).join(" · ")}
            </span>
          ))}
        </section>
      )}

      {v.caution && (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {v.caution}
        </p>
      )}
      {(v.check || []).length > 0 && (
        <div className="text-xs">
          <button type="button" onClick={() => setShowCheck(!showCheck)} className="font-medium text-stone-500 hover:text-stone-800">
            {showCheck ? "▾" : "▸"} 답하기 전 확인할 것 {v.check.length}
          </button>
          {showCheck && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-600">
              {v.check.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-stone-900">답변 초안</span>
          <select value={v.type || ""} onChange={(e) => save({ type: e.target.value })} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700" aria-label="문의 유형">
            <option value="">유형</option>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {busy === "draft" && (
            <span className="flex items-center gap-1 text-xs text-stone-400">
              <Loader2 size={13} className="animate-spin" /> 초안 쓰는 중…
            </span>
          )}
        </div>

        {(v.blanks || []).length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {v.blanks.map((b) => (
              <label key={b.key} className="block">
                <span className="mb-0.5 block text-[11px] font-medium text-stone-500">
                  {b.key.replace(/^\[|\]$/g, "")}
                  {b.hint && <span className="font-normal text-stone-400"> · {b.hint}</span>}
                </span>
                <input
                  value={v.fills?.[b.key] || ""}
                  onChange={(e) => save({ fills: { ...(v.fills || {}), [b.key]: e.target.value } })}
                  disabled={sentLike}
                  placeholder={b.hint || "채워 주세요"}
                  className={FIELD + (String(v.fills?.[b.key] || "").trim() ? "" : " border-amber-300 bg-amber-50/40")}
                />
              </label>
            ))}
          </div>
        )}

        {v.draft || busy !== "draft" ? (
          <textarea
            value={v.draft || ""}
            onChange={(e) => save({ draft: e.target.value })}
            disabled={sentLike}
            rows={Math.min(16, Math.max(6, (v.draft || "").split("\n").length + 1))}
            placeholder={v.status === "new" ? "아직 초안이 없어요 — 아래 '초안 만들기'를 눌러 주세요" : ""}
            className={FIELD + " leading-relaxed"}
          />
        ) : null}
        {open.length > 0 && v.draft && <p className="text-[11px] text-amber-700">빈칸 {open.length}개를 채우면 보낼 수 있어요: {open.map((b) => b.key).join(" · ")}</p>}

        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium text-stone-500">확인 근거 · 메모 (고객에겐 안 가요)</span>
          <input value={v.basis || ""} onChange={(e) => save({ basis: e.target.value })} placeholder="예: 넥스트팩 출고 10/14 확인, 송장 받음" className={FIELD} />
        </label>

        {!sentLike && (
          <div className="flex flex-wrap items-center gap-2">
            <input value={instruct} onChange={(e) => setInstruct(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && redraft()} placeholder="다시 쓸 때 바랄 것 (선택) — 예: 더 짧게, 반품으로 안내" className={FIELD + " min-w-0 flex-1"} />
            <button type="button" onClick={redraft} disabled={busy === "draft"} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-rose-300 disabled:opacity-50">
              <Wand2 size={14} /> {v.draft ? "초안 다시 만들기" : "초안 만들기"}
            </button>
          </div>
        )}
        {err && <p className="text-xs text-rose-700">{err}</p>}
      </section>

      {!sentLike ? (
        <footer className="space-y-3 border-t border-stone-100 pt-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={!!v.confirmed} onChange={(e) => save({ confirmed: e.target.checked }, true)} disabled={!v.draft} className="mt-0.5 accent-rose-700" />
            <span>
              답변 내용과 이 고객에게 맞는 <b>배송비 · 반품 방식 · 일정</b>을 확인했어요
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.confirm("이 문의를 지울까요? (답변하지 않고 목록에서 뺄 때)") && D.dropItem(x.id)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-rose-700">
              <Trash2 size={13} /> 지우기
            </button>
            <button type="button" onClick={markDone} className="rounded-lg px-2 py-1.5 text-xs text-stone-500 hover:text-stone-800" title="다른 곳에서 이미 답했을 때">
              이미 답했어요
            </button>
            <span className="ml-auto flex flex-wrap gap-2">
              {auto ? (
                <button type="button" onClick={send} disabled={!ready || busy === "send"} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
                  {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 카페24에 답변 보내기
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => copyDone(false)} disabled={!v.draft} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-50">
                    {copied ? <Check size={15} /> : <Copy size={15} />} 복사만
                  </button>
                  <button type="button" onClick={() => copyDone(true)} disabled={!ready} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
                    <Copy size={15} /> 복사하고 처리 완료
                  </button>
                </>
              )}
            </span>
          </div>
          {!ready && v.draft && <p className="text-right text-[11px] text-stone-400">{open.length ? "빈칸을 채우고" : ""} 위 '확인했어요'를 체크하면 {auto ? "보낼" : "처리할"} 수 있어요</p>}
        </footer>
      ) : (
        <footer className="space-y-2 border-t border-stone-100 pt-3">
          <p className="flex items-center gap-1.5 text-sm text-stone-700">
            {v.status === "sending" || v.status === "approved" ? (
              <>
                <Loader2 size={15} className="animate-spin text-sky-700" /> {pcOn ? "사무실 PC가 카페24에 답글을 다는 중이에요" : "사무실 PC가 켜지면 카페24에 답글을 달아요"}
              </>
            ) : (
              <>
                <CircleCheck size={15} className="text-emerald-600" /> {v.status === "sent" ? `카페24에 보냈어요 ${when(v.sentAt)}` : `처리 완료 ${when(v.doneAt)}`}
              </>
            )}
          </p>
          {v.error && <p className="text-xs text-rose-700">보내기 실패: {v.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copyDone(false)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600">
              {copied ? <Check size={13} /> : <Copy size={13} />} 보낸 글 복사
            </button>
            {v.status !== "sending" && (
              <button type="button" onClick={reopen} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600">
                <Undo2 size={13} /> 다시 답할 문의로
              </button>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ 문의 붙여넣기 (카톡·톡톡·인스타·전화)

function AddSheet({ init, D, products, onClose, onAdded }) {
  const [channel, setChannel] = useState(() => {
    try {
      return localStorage.getItem("poclo_cs_channel") || "kakao";
    } catch {
      return "kakao";
    }
  });
  const [customer, setCustomer] = useState("");
  const [text, setText] = useState(init.text || "");
  const [images, setImages] = useState(init.images || []);
  const [prod, setProd] = useState("");
  const [prodPick, setProdPick] = useState(null); // {no,name}
  const [orderNo, setOrderNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef(null);

  const addFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type?.startsWith("image/")).slice(0, 4 - images.length);
    const urls = await Promise.all(imgs.map((f) => shrink(f).catch(() => null)));
    setImages((p) => [...p, ...urls.filter(Boolean)].slice(0, 4));
  };
  // 창이 열린 동안 Ctrl+V — 캡처는 쌓고, 글은 칸에
  useEffect(() => {
    const onPaste = async (e) => {
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      e.stopPropagation();
      await addFiles(await filesOf(c));
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const w = prod.trim().replace(/\s+/g, "").toLowerCase();
    if (!w || prodPick || /^\d+$/.test(w) || /^https?:/.test(w)) return [];
    return products.filter((p) => String(p.name || "").replace(/\s+/g, "").toLowerCase().includes(w)).slice(0, 6);
  }, [prod, prodPick, products]);

  const go = async () => {
    if (!text.trim() && !images.length) return setErr("문의 글을 붙여넣거나 캡처를 넣어 주세요.");
    setBusy(true);
    setErr("");
    try {
      localStorage.setItem("poclo_cs_channel", channel);
    } catch {
      /* 무시 */
    }
    const url = prodPick ? productUrl(prodPick.no) : productUrl(prod);
    const base = {
      id: newId("cs"),
      channel,
      customer: customer.trim(),
      message: text.trim(),
      product: prodPick ? { no: prodPick.no, name: prodPick.name, url } : url ? { url } : prod.trim() ? { name: prod.trim() } : null,
      orderNo: orderNo.trim(),
      at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: "drafting",
    };
    try {
      const r = await draftApi({ ...requestOf(base, D.tpl), images });
      const item = applyDraft(base, r);
      await D.saveItem(item);
      // 주문번호가 있으면 사무실 PC 가 카페24 주문을 찾아 붙인다(배송 상태·송장)
      if (item.orderNo && /\d{8}-\d{5,}/.test(item.orderNo)) await D.enqueue({ id: item.id, kind: "lookup", orderNo: item.orderNo });
      onAdded(item.id);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHead title="문의 붙여넣기" onClose={onClose} />
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer?.files || []);
        }}
      >
        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">어디로 온 문의예요?</div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.filter((c) => !c.auto).map((c) => (
              <button key={c.k} type="button" onClick={() => setChannel(c.k)} aria-pressed={channel === c.k} className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (channel === c.k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">고객이 보낸 말</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="채팅에서 고객 말을 복사해 붙여넣어요. 캡처라면 아래에 붙여넣기(Ctrl+V)만 해도 돼요." className={FIELD + " leading-relaxed"} />
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>캡처 {images.length > 0 && `${images.length}장`}</span>
            <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-1 font-medium text-stone-500 hover:text-stone-800">
              <ImagePlus size={13} /> 사진 고르기
            </button>
          </div>
          {images.length ? (
            <div className="flex flex-wrap gap-2">
              {images.map((s, i) => (
                <span key={i} className="relative">
                  <img src={s} alt="" className="h-24 w-auto rounded-lg border border-stone-200 object-cover" />
                  <button type="button" onClick={() => setImages((p) => p.filter((_, k) => k !== i))} aria-label="빼기" className="absolute -top-1.5 -right-1.5 rounded-full bg-stone-800 p-0.5 text-white">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-400">채팅 캡처를 Ctrl+V · 끌어다 놓기 (4장까지) — 글만 읽고 사진은 보관하지 않아요</p>
          )}
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files || []), (e.target.value = ""))} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">고객 이름 (선택)</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="예: 혜원" className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">주문번호 (선택)</span>
            <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="예: 20261012-0000123" className={FIELD} />
          </label>
        </div>
        <label className="relative block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">상품 (선택 — 사이즈·소재 문의면 넣어 주세요)</span>
          <input
            value={prodPick ? prodPick.name : prod}
            onChange={(e) => (setProdPick(null), setProd(e.target.value))}
            placeholder="상품 이름 · 상품 번호 · 링크"
            className={FIELD}
          />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
              {matches.map((p) => (
                <li key={p.no}>
                  <button type="button" onClick={() => setProdPick({ no: p.no, name: p.name })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-50">
                    {p.image && <img src={p.image} alt="" className="h-8 w-6 rounded object-cover" />}
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-stone-400">{p.no}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        {err && <p className="text-xs text-rose-700">{err}</p>}
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button type="button" onClick={go} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-3 text-sm font-semibold text-white disabled:bg-stone-300">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} {busy ? "초안 쓰는 중… (10~30초)" : "초안 만들기 · 약 30~70원"}
        </button>
      </footer>
    </Sheet>
  );
}

// ------------------------------------------------------------------ 답변 틀

function TemplateSheet({ tpl, onSave, onClose }) {
  const [t, setT] = useState(() => JSON.parse(JSON.stringify(tpl)));
  const [openType, setOpenType] = useState(t.items[0]?.type || "");
  const [saving, setSaving] = useState(false);
  const setItem = (id, patch) => setT((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="답변 틀" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <p className="text-xs leading-relaxed text-stone-500">
          AI가 초안을 쓸 때 이 틀을 바탕으로 써요. <b>답변의 질은 여기서 정해져요</b> — 우리 몰이 실제로 쓰는 말투·규정으로 고쳐 주세요. 모르는 금액·날짜는 [대괄호]로 두면 초안에 빈칸으로 남아요.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">인사</span>
            <input value={t.greeting} onChange={(e) => setT({ ...t, greeting: e.target.value })} className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">맺음</span>
            <input value={t.closing} onChange={(e) => setT({ ...t, closing: e.target.value })} className={FIELD} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">말투</span>
          <textarea value={t.tone} onChange={(e) => setT({ ...t, tone: e.target.value })} rows={2} className={FIELD} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">우리 쇼핑몰 규정 (AI는 사실을 여기서만 가져와요)</span>
          <textarea value={t.policy} onChange={(e) => setT({ ...t, policy: e.target.value })} rows={9} className={FIELD + " font-mono text-xs leading-relaxed"} />
        </label>
        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">유형별 틀</div>
          <div className="flex flex-wrap gap-1.5">
            {t.items.map((x) => (
              <button key={x.id} type="button" onClick={() => setOpenType(x.type)} aria-pressed={openType === x.type} className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (openType === x.type ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}>
                {x.type}
              </button>
            ))}
          </div>
          {t.items
            .filter((x) => x.type === openType)
            .map((x) => (
              <div key={x.id} className="mt-3 space-y-2 rounded-xl border border-stone-200 p-3">
                <input value={x.title || ""} onChange={(e) => setItem(x.id, { title: e.target.value })} placeholder="예: 배송 언제 와요?" className={FIELD + " font-semibold"} />
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-stone-500">순서 · 지킬 것 (까다로운 유형일수록 순서를 박아 두면 사고가 안 나요)</span>
                  <textarea value={x.rules || ""} onChange={(e) => setItem(x.id, { rules: e.target.value })} rows={5} className={FIELD + " leading-relaxed"} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-stone-500">예시 답변 (있으면 말투를 그대로 따라 해요)</span>
                  <textarea value={x.body || ""} onChange={(e) => setItem(x.id, { body: e.target.value })} rows={6} placeholder="실제로 보내던 답변을 하나 붙여넣어 주세요" className={FIELD + " leading-relaxed"} />
                </label>
              </div>
            ))}
        </div>
      </div>
      <footer className="shrink-0 border-t border-stone-200 p-3">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(t);
            setSaving(false);
            onClose();
          }}
          className="w-full rounded-xl bg-rose-700 py-3 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </footer>
    </Sheet>
  );
}
