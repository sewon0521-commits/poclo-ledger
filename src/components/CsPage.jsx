import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Plus, Search, X, Copy, Check, RefreshCw, Wand2, AlertTriangle, ExternalLink, Trash2, Undo2, ImagePlus, Settings2, CircleCheck, Inbox, Package } from "lucide-react";
import { loadKey, changeKey, upsert, remove } from "../lib/shoot";
import { CHANNELS, channelOf, canSend, pcState, PC_CHANNELS, stockFor, learnRow, pickExamples, LEARN_MAX, etaFor, etaText, codeOf, TYPES, STATUS, TABS, inTab, finalText, openBlanks, staleDone, archiveKey, productUrl, orderAdminUrl, withDefaults, when, fixType, recentReplies, repliedTo, delaysFor } from "../lib/cs";
import DelayPage from "./DelayPage";
import { shrink } from "../lib/photos";
import { clipImages, filesOf } from "../lib/pasteImages";
import { newId } from "../lib/id";
import { Sheet, SheetHead } from "./ShootBits";

/**
 * 일 › CS 관리 (lib/cs.js 머리말).
 * 영상(온라인테크트리 CS 자동화)의 화면 구조: 위 숫자(답할 문의 · 보낼 준비 · 오늘 처리 · 자동 수집) → 왼쪽 문의 목록 · 오른쪽 원문과 답변 초안 →
 * 빈칸 채우기 → '확인했어요' 체크 → 보내기. 색·부품은 포클로ERP 것.
 */

// 11/10 세원 "네이버페이, 카톡 등등 각 사이트에서 온 cs만 볼 수 있게 편하게 버튼" — 채널 버튼(안 답한 건수)
const CH_GROUPS = [
  ["", "전체", null],
  ["kakao", "카톡", ["kakao"]],
  ["npay", "네이버페이", ["npay"]],
  ["naver", "톡톡", ["naver"]],
  ["cafe24", "카페24 게시판", ["cafe24_qna", "cafe24_consult"]],
  ["insta", "인스타", ["insta"]],
  ["etc", "기타", ["phone", "etc"]],
];
const inGroup = (x, g) => !g || (CH_GROUPS.find(([k]) => k === g)?.[2] || []).includes(x.channel);

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
    aiDraft: r.draft || "", // 11/10 고친 것 학습 — 세원이 고친 뒤 보낸 글과 비교
    confirmed: false,
    status: "ready",
    error: "",
    cost: (x.cost || 0) + (r._cost?.won || 0),
    draftedAt: new Date().toISOString(),
  };
}

const requestOf = (x, tpl, extra = {}, stock = null, learn = null, inbound = null) => ({
  channel: x.channel,
  customer: x.customer,
  title: x.title,
  text: x.message,
  at: x.at,
  product: x.product?.url ? { url: x.product.url } : x.product?.name ? { name: x.product.name } : undefined,
  order: x.order,
  stock: stockFor(stock, inbound, orderLines(x), [x.product?.name]).text || undefined, // 11/11 넥스트팩 재고 + 입고 예정(상품의 모든 옵션) — 빈칸 없이 바로 답하게
  templates: tpl,
  examples: pickExamples(learn, x), // 세원이 예전에 고친 초안 → 고친 글 (같은 유형 먼저)
  type: x.type || undefined, // 세원이 고른 '답변 유형' — 그 틀대로
  eta: etaText(inbound, stock, orderLines(x)) || undefined, // 11/10 옵션별 출고 가능(거래처 입고 예정 + 재고) — 부분 배송 안내
  replied: threadOf(x).some((m) => m.from === "us" && m.who !== "자동") || undefined, // 11/11 세원 "이미 답변을 했던 상태면 인삿말은 생략" — 카톡·톡톡 자동 인사·부재중은 답으로 안 침
  ...extra,
});

/** 데이터 — 문의 · 답변 틀 · 사무실 PC 상태. 화면이 떠 있는 동안 PC 상태를 15초마다 보고, PC 가 문의를 바꿨으면 다시 읽는다 */
function useCs(online) {
  const [inbox, setInbox] = useState([]);
  const [tpl, setTpl] = useState(() => withDefaults(null));
  const [worker, setWorker] = useState(null);
  const [stock, setStock] = useState(null);
  const [learn, setLearn] = useState(null);
  const [inbound, setInbound] = useState(null);
  const [npay, setNpay] = useState(null); // 11/11 지연 안내 기록(네이버 발송지연·지연 문자) — 문의 카드에 '지연 안내 보냄'
  const [sms, setSms] = useState(null);
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
        loadKey("stock", online, null).then((x) => alive && setStock(x)).catch(() => {});
        loadKey("cs_learn", online, { items: [] }).then((x) => alive && setLearn(x)).catch(() => {});
        loadKey("inbound_eta", online, { items: [] }).then((x) => alive && setInbound(x)).catch(() => {});
        loadKey("npay_delay", online, { items: [] }).then((x) => alive && setNpay(x)).catch(() => {});
        loadKey("delay_sms", online, { items: [] }).then((x) => alive && setSms(x)).catch(() => {});
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
  /** [한꺼번에 보내기] — 고른 문의를 한 번에 '보내는 중'으로 바꾸고 사무실 PC 일감에 넣는다(문의 목록·일감 목록 한 번씩만 쓴다) */
  const bulkSend = useCallback(
    async (ids) => {
      const set = new Set(ids);
      const at = new Date().toISOString();
      setInbox((l) => l.map((y) => (set.has(y.id) ? { ...y, status: "sending", sendAskedAt: at, error: "" } : y)));
      const next = await changeKey("cs_inbox", online, (v) => ({ ...v, items: (v.items || []).map((y) => (set.has(y.id) && y.status === "approved" ? { ...y, status: "sending", sendAskedAt: at, error: "" } : y)) }));
      setInbox(next.items || []);
      await changeKey("cs_queue", online, (v) => ({
        ...v,
        items: [...(v.items || []).filter((j) => !(j.kind === "send" && set.has(j.id))), ...ids.map((id) => ({ id, kind: "send", at }))],
      }));
    },
    [online],
  );
  /** 고친 것 학습 한 줄 저장 (AI 초안과 보낸 글이 다를 때만) */
  const learnFrom = useCallback(
    async (x, text) => {
      const row = learnRow(x, text);
      if (!row) return;
      const next = await changeKey("cs_learn", online, (v) => ({ ...v, items: [row, ...(v.items || []).filter((l) => !l.id.startsWith(`${x.id}-`))].slice(0, LEARN_MAX) })).catch(() => null);
      if (next) setLearn(next);
    },
    [online],
  );
  return { inbox, tpl, worker, stock, learn, inbound, npay, sms, loaded, loadInbox, saveItem, dropItem, saveTpl, enqueue, bulkSend, learnFrom };
}

function ChannelBadge({ k, className = "" }) {
  const c = channelOf(k);
  return <span className={"inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " + c.tone + " " + className}>{c.short}</span>;
}
function StatusChip({ s }) {
  const st = STATUS[s || "new"] || STATUS.new;
  return <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + st.tone}>{st.label}</span>;
}

// 11/11 세원 "합쳐줘" — 일 › CS 관리 = [문의 답하기] [먼저 연락(배송지연)] [입고 예정]. 같은 손님 기록을 잇는다(lib/cs recentReplies·repliedTo·delaysFor).
// ⚠ 세원: "지연 칸은 남겨둬야 된다" — 먼저 연락 탭에 네이버 발송지연 처리 + 지연 문자 그대로(DelayPage part="delay").
const SECTIONS = [
  ["inbox", "문의 답하기"],
  ["delay", "먼저 연락 (배송지연)"],
  ["inbound", "입고 예정"],
];
const SECTION_KEY = "poclo_cs_section";
export default function CsPage({ online, products = [], part = "" }) {
  const D = useCs(online);
  const [sec, setSec] = useState(() => {
    if (part) return part;
    try {
      return localStorage.getItem(SECTION_KEY) || "inbox";
    } catch {
      return "inbox";
    }
  });
  const pick = (k) => {
    setSec(k);
    try {
      localStorage.setItem(SECTION_KEY, k);
    } catch {
      /* 무시 */
    }
  };
  const [now] = useState(() => Date.now());
  const replies = useMemo(() => recentReplies(D.inbox, now), [D.inbox, now]);
  const replied = useCallback((row) => repliedTo(replies, row), [replies]);
  const todo = D.inbox.filter((x) => inTab(x, "todo")).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold text-stone-900">CS 관리</h2>
        <nav className="flex gap-1 rounded-xl bg-stone-100 p-1" aria-label="CS 관리 갈래">
          {SECTIONS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => pick(k)} className={"rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors " + (sec === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
              {label}
              {k === "inbox" && todo > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{todo}</span>}
            </button>
          ))}
        </nav>
      </div>
      {sec === "inbox" ? (
        <CsInbox products={products} D={D} />
      ) : (
        <>
          {sec === "delay" && <p className="text-sm text-stone-500">늦어지는 주문에 우리가 먼저 연락 — 대상 목록 → 문구·날짜 → 버튼. 최근 3일 안에 개별 답장을 받은 손님은 표시돼요(문자에선 기본으로 빠져요).</p>}
          <DelayPage online={online} part={sec} replied={replied} />
        </>
      )}
    </div>
  );
}

function CsInbox({ products = [], D }) {
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
      .filter((x) => inTab(x, tab) && inGroup(x, ch))
      .filter((x) => !w || [x.customer, x.summary, x.title, x.message, x.product?.name, x.orderNo, x.type].join(" ").toLowerCase().includes(w))
      .sort((a, b) => String(b.at || b.createdAt).localeCompare(String(a.at || a.createdAt)));
  }, [D.inbox, tab, ch, q]);
  const current = D.inbox.find((x) => x.id === sel) || (wide ? shown[0] : null) || null;

  const w = D.worker || {};
  const pcOn = w.at && now - new Date(w.at).getTime() < 3 * 60000;
  const c24 = w.channels?.cafe24 || null;
  const needsScope = c24 && !c24.ok && /권한|scope/i.test(c24.msg || "");
  // 보낼 목록 — 채널이 지금 되는 것(PC 가 ok 라고 적은 것)만 [한꺼번에 보내기]에 들어간다
  const approvedList = D.inbox.filter((x) => x.status === "approved" && canSend(x.channel));
  const sendReady = approvedList.filter((x) => pcState(w, x.channel)?.ok);
  const sendBlocked = approvedList.filter((x) => !pcState(w, x.channel)?.ok);
  const sendAll = async () => {
    if (!sendReady.length) return;
    const byCh = {};
    for (const x of sendReady) byCh[channelOf(x.channel).label] = (byCh[channelOf(x.channel).label] || 0) + 1;
    const lines = Object.entries(byCh).map(([k, n]) => `${k} ${n}건`).join(" · ");
    if (!window.confirm(`${sendReady.length}건을 보낼까요?
${lines}

보내면 손님에게 바로 가요.`)) return;
    await D.bulkSend(sendReady.map((x) => x.id));
    setMsg(pcOn ? `${sendReady.length}건을 사무실 PC에 맡겼어요 — 한 건씩 차례로 보내요.` : `${sendReady.length}건을 맡겼어요 — 사무실 PC가 켜지면 보내요.`);
  };

  const collectNow = async () => {
    await D.enqueue({ id: "collect", kind: "collect" });
    setMsg(pcOn ? "사무실 PC 에 '지금 모으기'를 맡겼어요 — 1분 안에 들어와요." : "사무실 PC 가 꺼져 있어요 — 켜지면 모아요.");
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">흩어진 문의를 한곳에 모으고, 초안은 AI가 — 확인하고 고친 다음 [한꺼번에 보내기] 한 번으로.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTplOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
            <Settings2 size={15} /> 답변 틀
          </button>
          <button type="button" onClick={collectNow} title="카페24 게시판 · 네이버페이 문의 · 카톡 채널 · 톡톡을 지금 모아요(연결된 곳만)" className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-400">
            <RefreshCw size={15} /> 지금 모으기
          </button>
          <button type="button" onClick={() => setAdding({})} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            <Plus size={16} /> 문의 붙여넣기
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="답할 문의" value={counts.todo} sub="초안 확인하고 보내 주세요" tone={counts.todo ? "text-rose-700" : "text-stone-900"} onClick={() => pickTab("todo")} />
        <Stat label="보낼 준비" value={counts.approved} sub="확인 끝 · [한꺼번에 보내기] 기다리는 중" onClick={() => pickTab("approved")} />
        <Stat label="오늘 처리" value={counts.doneToday} sub="보냈거나 처리 완료" onClick={() => pickTab("done")} />
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <div className="flex items-center justify-between text-xs font-medium text-stone-500">
            사무실 PC가 모으고 보내는 곳 <span className={pcOn ? "text-emerald-600" : "text-stone-400"}>{pcOn ? "PC 켜짐" : "PC 꺼짐"}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {PC_CHANNELS.map(([k, label]) => {
              const st = (w.channels || {})[k];
              return (
                <li key={k} className="flex items-center gap-1.5" title={st?.msg || ""}>
                  <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (pcOn && st?.ok ? "bg-emerald-500" : st && !st.ok ? "bg-amber-400" : "bg-stone-300")} />
                  <span className="font-medium text-stone-700">{label}</span>
                  <span className="truncate text-stone-400">{!st ? "준비 중" : st.ok ? `됨${st.at ? ` · ${when(st.at)}` : ""}` : st.msg || "확인 필요"}</span>
                </li>
              );
            })}
          </ul>
          <NotifyToggle online={online} last={w.notify} />
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
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CH_GROUPS.map(([k, label]) => {
          const n = D.inbox.filter((x) => inTab(x, "todo") && inGroup(x, k)).length;
          return (
            <button key={k || "all"} type="button" onClick={() => setCh(k)} className={"flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold " + (ch === k ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300")}>
              {label}
              {n > 0 && <span className={"rounded-full px-1.5 text-[10px] tabular-nums " + (ch === k ? "bg-white/25" : "bg-rose-100 text-rose-700")}>{n}</span>}
            </button>
          );
        })}
      </div>

      {tab === "approved" && approvedList.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
          <div className="min-w-0 flex-1 text-sm text-sky-950">
            <b>보낼 목록 {approvedList.length}건</b>
            <span className="ml-2 text-xs text-sky-800">
              {CHANNELS.filter((c) => approvedList.some((x) => x.channel === c.k))
                .map((c) => `${c.short} ${approvedList.filter((x) => x.channel === c.k).length}`)
                .join(" · ")}
            </span>
            {sendBlocked.length > 0 && (
              <p className="mt-0.5 text-[11px] text-amber-800">
                {sendBlocked.length}건은 아직 못 보내요 — {[...new Set(sendBlocked.map((x) => channelOf(x.channel).label))].join(" · ")} 연결(로그인·권한)이 먼저예요. 위 '사무실 PC가 모으고 보내는 곳'을 봐 주세요.
              </p>
            )}
          </div>
          <button type="button" onClick={sendAll} disabled={!sendReady.length} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
            <Send size={15} /> 한꺼번에 보내기 {sendReady.length}건
          </button>
        </section>
      )}

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
                  {/* 11/11 세원 "왼쪽에 이렇게 뜨는 거 확 줄여 — 성함, 주문번호, 마지막 상담 날짜 같이 중요한 것만" → 두 줄. 대화 전문은 오른쪽 말풍선에서만 */}
                  <span className="flex items-center gap-1.5">
                    <ChannelBadge k={x.channel} />
                    {(x.urgent || /^🔥/.test(x.caution || "")) && <span title="급함" className="text-xs leading-none">🔥</span>}
                    <span className="min-w-0 truncate text-sm font-semibold text-stone-900">{x.customer || "고객"}</span>
                    <StatusChip s={x.status} />
                    <span className="ml-auto shrink-0 text-[11px] text-stone-400 tabular-nums">{when(x.at || x.createdAt)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-500">
                    {x.orderNo && <span className="shrink-0 font-mono text-stone-600">{x.orderNo}</span>}
                    <span className="min-w-0 truncate">{shortGoods(x) || (x.summary || x.title || "").slice(0, 30)}</span>
                    {x.type && <span className="ml-auto shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">{x.type}</span>}
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
      {tplOpen && <TemplateSheet tpl={D.tpl} learn={D.learn} onSave={D.saveTpl} onClose={() => setTplOpen(false)} />}
    </div>
  );
}

/** 11/11 세원 "CS가 쌓이면 10분에 한번씩 pc 알림" — 사무실 PC 가 답할 문의를 세어 윈도우 알림(9~23시). settings cs_notify {on}, 없으면 켜짐 */
function NotifyToggle({ online, last }) {
  const [on, setOn] = useState(null);
  useEffect(() => {
    let alive = true;
    loadKey("cs_notify", online, {})
      .then((v) => alive && setOn(v?.on !== false))
      .catch(() => alive && setOn(true));
    return () => {
      alive = false;
    };
  }, [online]);
  const flip = async () => {
    const next = !on;
    setOn(next);
    try {
      await changeKey("cs_notify", online, (v) => ({ ...(v || {}), on: next, at: new Date().toISOString() }));
    } catch {
      setOn(!next);
    }
  };
  if (on === null) return null;
  return (
    <button type="button" onClick={flip} className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-[11px] hover:bg-stone-50" title={last?.at ? `마지막 알림 ${when(last.at)} · ${last.msg || ""}` : "아직 알림 없음"}>
      <span className={"relative h-3.5 w-6 shrink-0 rounded-full transition-colors " + (on ? "bg-emerald-500" : "bg-stone-300")}>
        <span className={"absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all " + (on ? "left-3" : "left-0.5")} />
      </span>
      <span className="font-medium text-stone-700">PC 알림</span>
      <span className="truncate text-stone-400">{on ? "쌓이면 10분마다 · 9~23시" : "꺼짐"}</span>
    </button>
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
        카페24 게시판 · 네이버페이 문의 · 카톡 채널 · 톡톡은 사무실 PC가 모아 와요(연결된 곳부터). 인스타 DM 이나 아직 연결 안 된 곳은 문의를 복사하거나 캡처해서 붙여넣으면 초안이 바로 만들어져요.
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

// ------------------------------------------------------------------ 채팅방 모양 · 상품 줄 (11/10 세원)

/** 주문번호 → 카페24 관리자 주문상세정보 새 창 (11/11 세원 "누르면 주문 상세정보칸 뜨게") */
function OrderLink({ no }) {
  const url = orderAdminUrl(no);
  if (!url) return <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-stone-700">주문 {no}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="카페24 주문 상세 (새 창)" className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-stone-700 hover:bg-rose-50 hover:text-rose-800">
      주문 {no} <ExternalLink size={10} />
    </a>
  );
}
const cleanName = (n) => String(n || "").replace(/^\s*(\[[^\]]*\]\s*)+/, "").replace(/\s*\(\d+\s*colou?r\)\s*$/i, "").trim();
/** 11/11 '재고 ○시 기준' — 초안은 넥스트팩 현재고 + 입고 예정으로 쓴다. 6시간 넘으면 노랗게 */
function StockAt({ stock }) {
  const [now] = useState(() => Date.now());
  const at = stock?.nextpack?.at;
  if (!at) return <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">재고 정보 없음 — 입고 예정 표로만 써요</span>;
  const t = new Date(at);
  const hrs = (now - t.getTime()) / 3600000;
  const label = `재고 ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} 기준`;
  return (
    <span title="초안은 넥스트팩 현재고 + 거래처 입고 예정 표로 써요(출고는 넥스트팩에서만)" className={"ml-auto rounded-full px-2 py-0.5 text-[11px] " + (hrs >= 6 ? "bg-amber-100 font-semibold text-amber-900" : "bg-stone-100 text-stone-500")}>
      {label}
      {hrs >= 6 && ` · ${Math.floor(hrs)}시간 전`}
    </span>
  );
}
/** 목록 카드용 상품 짧게 — '테디 아이보리 +1' (고유네임 + 옵션, 상품이 더 있으면 +N) */
function shortGoods(x) {
  const ls = orderLines(x);
  if (!ls.length) return x.product?.name ? cleanName(x.product.name).split(/\s+/)[0] : "";
  const first = `${cleanName(ls[0].name).split(/\s+/)[0]} ${String(ls[0].option || "").replace(/^색상=/, "")}`.trim();
  return ls.length > 1 ? `${first} +${ls.length - 1}` : first;
}
/** 주문 상품 줄 [{name, option, qty}] — 새 문의는 lines, 예전 문의는 '이름 옵션 ×N' 글에서 */
function orderLines(x) {
  if (Array.isArray(x?.lines) && x.lines.length) return x.lines;
  const out = [];
  for (const o of x?.order?.orders || []) {
    for (const it of [].concat(o.items || [])) {
      if (typeof it !== "string") {
        if (it?.name) out.push({ orderId: o.id, ...it });
        continue;
      }
      const m = it.match(/^(.*?)(?:\s+([^\s×]+(?:\s*\+\s*[^\s×]+)?))?\s*×\s*(\d+)/);
      out.push(m ? { orderId: o.id, name: m[1], option: m[2] || "", qty: Number(m[3]) } : { orderId: o.id, name: it, option: "", qty: 1 });
    }
  }
  return out;
}
const NL = String.fromCharCode(10);
/** 대화 줄 [{from:'them'|'us', who, at, text, img}] — 새 문의는 thread, 예전 문의는 '[11/7 10:48] …' · '(11/8 23:06 지원 답: …)' 글에서 */
function threadOf(x) {
  if (Array.isArray(x?.thread) && x.thread.length) return x.thread;
  const out = [];
  for (const line of String(x?.message || "").split(NL)) {
    const us = line.match(/^\((\d+\/\d+ \d+:\d+) (\S+?) 답: (.*)\)\s*$/);
    const them = line.match(/^\[(\d+\/\d+ \d+:\d+)\]\s*(.*)$/);
    if (us) out.push({ from: "us", who: us[2], at: us[1], text: us[3] });
    else if (them) out.push({ from: "them", at: them[1], text: them[2] });
    else if (line.trim() && out.length) out[out.length - 1].text += NL + line;
    else if (line.trim()) out.push({ from: "them", at: "", text: line });
  }
  return out;
}
function ChatThread({ v }) {
  const [big, setBig] = useState(null);
  // 11/11 세원 "사진 누르면 더 크게" — 바깥을 누르거나 ESC 로 닫기
  useEffect(() => {
    if (!big) return;
    const k = (e) => e.key === "Escape" && setBig(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [big]);
  const t = threadOf(v);
  if (!t.length) return <div className="rounded-xl bg-stone-50 px-3.5 py-3 text-sm text-stone-500">(캡처에서 글을 못 읽었어요)</div>;
  return (
    <div className="space-y-2 rounded-2xl bg-sky-50/60 p-3">
      {t.map((m, i) => (
        <div key={i} className={"flex items-end gap-1.5 " + (m.from === "us" ? "flex-row-reverse" : "")}>
          <div className={"max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-sm " + (m.from === "us" ? "rounded-br-md bg-amber-200/80 text-stone-900" : "rounded-bl-md bg-white text-stone-900")}>
            {m.from === "us" && m.who && <div className="mb-0.5 text-[10px] font-semibold text-stone-500">{m.who}</div>}
            {m.img && (
              <button type="button" onClick={() => setBig(m.img)} className="mb-1 block overflow-hidden rounded-lg">
                <img src={m.img} alt="손님이 보낸 사진" className="max-h-48 w-auto" />
              </button>
            )}
            {m.text}
          </div>
          <span className="shrink-0 pb-0.5 text-[10px] text-stone-400 tabular-nums">{m.at}</span>
        </div>
      ))}
      {big && (
        <button type="button" onClick={() => setBig(null)} className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4" aria-label="닫기 (ESC)">
          <img src={big} alt="손님이 보낸 사진 크게" className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" style={{ minHeight: "60vh" }} />
          <span className="absolute top-3 right-4 rounded-full bg-white/15 px-3 py-1 text-xs text-white">닫기 · ESC</span>
        </button>
      )}
    </div>
  );
}

/**
 * 11/11 세원 "카톡처럼 취소 CS 오면 옆에 버튼으로 카페24 해당 주문건 취소하기 누르면 취소되게 — 내가 누르면 너가"
 * [카페24 주문 취소] → 사무실 PC 가 주문을 다시 읽어 확인(order_info) → 확인 창(주문번호·상품·옵션·결제수단·환불 금액·되는지) →
 * [이 주문 취소하기] → PC 가 그 순간 한 번 더 읽고 막을 건 막은 뒤 카페24 주문 취소(cancel_order). 되돌릴 수 없어요.
 * 네이버페이 주문형·톡체크아웃·출고된 주문은 막는다(그곳 관리자에서).
 */
function CancelBox({ v, D, pcOn }) {
  const [mountAt] = useState(() => Date.now());
  const [wait, setWait] = useState(null); // {kind: "info"|"cancel", at} — 맡긴 뒤 PC 답을 기다리는 중
  const info = v.cancelInfo && v.cancelInfo.orderNo === v.orderNo ? v.cancelInfo : null;
  const infoAt = info ? new Date(info.at).getTime() : 0;
  const newer = wait ? infoAt >= wait.at - 60000 : false; // PC 시계가 조금 달라도
  const waiting = wait && !(newer && (wait.kind === "info" || info?.done || info?.error || info?.ok === false));
  const fresh = info && (newer || infoAt > mountAt - 15 * 60000); // 15분 넘은 확인은 다시 읽고 보여 준다
  const check = async () => {
    setWait({ kind: "info", at: Date.now() });
    await D.enqueue({ id: v.id, kind: "order_info", orderNo: v.orderNo });
  };
  const cancel = async () => {
    const lines = (info.items || []).map((i) => `${cleanName(i.name)} ${i.option || ""} ×${i.qty} (${i.status})`).join("\n");
    if (!window.confirm(`이 주문을 취소할까요? 되돌릴 수 없어요.\n\n주문 ${info.orderNo}\n${lines}\n결제 ${(info.pays || []).join("+")} · 환불 ${Number(info.amount || 0).toLocaleString()}원${info.reasonLabel ? `\n취소 사유: ${info.reasonLabel} · 환불 방식: ${info.refundLabel || ""}` : ""}${info.why ? `\n\n⚠ ${info.why}` : ""}`)) return;
    setWait({ kind: "cancel", at: Date.now() });
    await D.enqueue({ id: v.id, kind: "cancel", orderNo: v.orderNo });
  };
  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-rose-900">취소 요청이 있는 문의예요</span>
        {info?.done ? (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">카페24 취소 완료 {when(info.doneAt)}</span>
        ) : !fresh || (waiting && wait.kind === "info") ? (
          <button type="button" onClick={check} disabled={!!waiting} className="ml-auto rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white disabled:bg-stone-300">
            {waiting ? "주문 확인 중…" : "카페24 주문 취소"}
          </button>
        ) : null}
      </div>
      {waiting && (
        <p className="mt-1 text-stone-500">
          {!pcOn ? "사무실 PC가 꺼져 있어요 — 켜지면 해요." : wait.kind === "cancel" ? "사무실 PC가 한 번 더 확인하고 취소하는 중이에요(1분 안)." : "사무실 PC가 주문을 읽고 있어요(1분 안)."}
        </p>
      )}
      {fresh && !info.done && !(waiting && wait.kind === "info") && (
        <div className="mt-2 space-y-1 text-stone-700">
          <div>
            <OrderLink no={info.orderNo} /> · {info.place} · 결제 {(info.pays || []).join("+")} · 환불 <b>{Number(info.amount || 0).toLocaleString()}원</b>
          </div>
          {/* 11/11 카페24 취소 필수 칸 — 취소사유 구분(배송지연·고객변심, 세원 "너가 취소 사유 종류를 선택해서") · 무통장은 환불 방식 '현금'(기록만, 돈은 세원이 직접) */}
          {info.reasonLabel ? (
            <div className="text-stone-500">
              취소 사유: <b className="text-stone-700">{info.reasonLabel}</b> · 환불 방식: {info.refundLabel}
            </div>
          ) : (
            <div className="text-amber-700">'다시 확인'을 눌러 취소 사유·환불 방식을 채운 뒤 취소해 주세요</div>
          )}
          <ul className="list-disc pl-4">
            {(info.items || []).map((i) => (
              <li key={i.code}>
                {cleanName(i.name)} · {i.option} · {i.qty}개 · {i.status}
              </li>
            ))}
          </ul>
          {info.why && <p className={info.ok ? "text-amber-800" : "font-semibold text-rose-700"}>⚠ {info.why}</p>}
          {info.error && <p className="font-semibold text-rose-700">취소 못 함: {info.error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={check} className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-stone-600">
              다시 확인
            </button>
            <button type="button" onClick={cancel} disabled={!info.ok || !!waiting || !info.reasonLabel} className="rounded-lg bg-rose-700 px-3 py-1 font-semibold text-white disabled:bg-stone-300">
              {waiting ? "취소하는 중…" : "이 주문 취소하기"}
            </button>
          </div>
        </div>
      )}
    </section>
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
  const auto = canSend(v.channel); // 사무실 PC 가 보내 주는 채널(카페24 API · 어사이드)
  const chName = channelOf(v.channel).label;
  const ready = !!v.draft && !open.length && v.confirmed;
  const sentLike = ["approved", "sending", "sent", "done"].includes(v.status);

  const redraft = async () => {
    setBusy("draft");
    setErr("");
    try {
      const r = await draftApi(requestOf(v, D.tpl, { previous: v.draft || undefined, instruct: instruct.trim() || undefined }, D.stock, D.learn, D.inbound));
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
  // 11/10 반자동 — 여기서는 '보낼 목록'에 넣기만, 실제 보내기는 '보낼 준비'의 [한꺼번에 보내기] 한 번으로
  const send = async () => {
    if (!ready) return;
    setBusy("send");
    try {
      const patch = { status: "approved", final: text, approvedAt: new Date().toISOString(), error: "" };
      setV((p) => ({ ...p, ...patch }));
      await D.saveItem({ id: x.id, ...patch, draft: v.draft, fills: v.fills, basis: v.basis, confirmed: true });
      D.learnFrom(v, text);
      onMsg("보낼 목록에 넣었어요 — 다 확인한 뒤 '보낼 준비'에서 [한꺼번에 보내기]를 눌러 주세요.");
    } finally {
      setBusy("");
    }
  };
  const unapprove = () => save({ status: "ready", final: "", approvedAt: "" }, true);
  const copyDone = async (done) => {
    const ok = await copyText(text);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
    if (ok && done) {
      const patch = { status: "done", final: text, doneAt: new Date().toISOString() };
      setV((p) => ({ ...p, ...patch }));
      await D.saveItem({ id: x.id, ...patch, draft: v.draft, fills: v.fills, basis: v.basis, confirmed: v.confirmed });
      D.learnFrom(v, text);
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
        {/* 11/11 세원 "계좌번호가 ERP에서 안 보이는데" — 계좌·전화번호는 개인정보라 끝 4자리만 저장. 전체는 원래 대화방에서 */}
        {v.ext?.url && threadOf(v).some((m) => /\*\*\*\*\d{4}|\(전화번호\)/.test(m.text || "")) && (
          <a href={v.ext.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100">
            🔒 계좌·전화번호는 가려서 저장했어요 — 전체 번호는 원래 대화방에서 보기 <ExternalLink size={11} />
          </a>
        )}
      </header>

      {/* 11/10 세원 "cs창 상단 ui를 실제 채팅방처럼" — 손님 왼쪽 · 우리 오른쪽 말풍선, 시각, 사진 */}
      <section>
        {v.title && <div className="mb-1 text-sm font-semibold text-stone-800">{v.title}</div>}
        <ChatThread v={v} />
      </section>

      {/* 11/10 세원 "제품 나오는 거 좋은데 옵션, 개수까지 — 눈에 확 안 들어와서" — 상품마다 한 줄 + 입고·재고 배지 */}
      {(orderLines(v).length > 0 || v.orderNo || v.product?.name) && (
        <section className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
            {v.orderNo && <OrderLink no={v.orderNo} />}
            {(v.order?.orders || []).slice(0, 3).map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1.5">
                {o.id && o.id !== v.orderNo && <OrderLink no={o.id} />}
                {[o.date, o.status, o.invoice && `송장 ${o.invoice}`].filter(Boolean).join(" · ")}
              </span>
            ))}
            {v.product?.url && (
              <a href={v.product.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-rose-700 hover:underline">
                상품 페이지 <ExternalLink size={10} />
              </a>
            )}
          </div>
          {orderLines(v).length ? (
            <ul className="space-y-1">
              {orderLines(v).map((l, i) => {
                const eta = etaFor(D.inbound, D.stock, codeOf(l.name), l.option);
                const url = orderAdminUrl(l.orderId || v.orderNo || v.order?.orders?.[0]?.id);
                return (
                  <li
                    key={i}
                    onClick={url ? () => window.open(url, "_blank", "noopener") : undefined}
                    title={url ? "누르면 카페24 주문 상세가 새 창으로 열려요" : undefined}
                    className={"flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2" + (url ? " cursor-pointer hover:border-rose-300 hover:bg-rose-50/40" : "")}
                  >
                    <Package size={14} className="shrink-0 text-stone-400" />
                    <span className="text-sm font-semibold text-stone-900">{cleanName(l.name)}</span>
                    {l.option && <span className="rounded-md bg-stone-800 px-1.5 py-0.5 text-xs font-bold text-white">{l.option}</span>}
                    <span className="text-sm font-bold text-stone-900">{l.qty || 1}{/1\+1/.test(l.name) ? "세트" : "개"}</span>
                    <span title={eta.memo} className={"ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold " + (eta.tone === "ok" ? "bg-emerald-100 text-emerald-800" : eta.tone === "wait" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800")}>
                      {eta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            v.product?.name && (
              <div className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-700">
                <Package size={12} /> {v.product.name}
              </div>
            )
          )}
        </section>
      )}

      {/* 11/11 세원 "합쳐줘" — 같은 손님에게 지연 안내가 이미 나갔으면 (네이버는 이름 첫 글자·상품으로 맞춘 힌트) */}
      {(() => {
        const ds = delaysFor(v, D.npay, D.sms);
        return ds.length ? (
          <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
            📮 지연 안내 보냄 — {ds.map((d) => `${d.kind}${d.at ? " " + when(d.at) : ""}`).join(" · ")} · 같은 내용을 또 보내지 않게 봐 주세요
          </p>
        ) : null;
      })()}

      {/* 11/11 세원 "강다인님은 취소 요청 없는 사람인데 왜 취소 요청이 있다고 뜨냐" — '주문 취소' 유형에만 */}
      {v.orderNo && fixType(v.type, threadOf(v).filter((m) => m.from === "them").map((m) => m.text).join(" ")) === "주문 취소" && <CancelBox v={v} D={D} pcOn={pcOn} />}

      {(() => {
        // 11/10 세원 "어떤 고객님인지 파악" — 같은 고객의 다른 문의(지금 목록 안)
        const past = v.customer ? D.inbox.filter((y) => y.id !== v.id && y.customer === v.customer).slice(0, 5) : [];
        return past.length ? (
          <section className="text-xs">
            <div className="mb-1 text-[11px] font-semibold text-stone-400">이 고객의 다른 문의 {past.length}</div>
            <ul className="space-y-0.5">
              {past.map((y) => (
                <li key={y.id} className="flex gap-2 text-stone-600">
                  <span className="shrink-0 text-stone-400">{when(y.at || y.createdAt)}</span>
                  <span className="truncate">{y.summary || (y.message || "").slice(0, 40)}</span>
                  <span className="ml-auto shrink-0 text-stone-400">{STATUS[y.status || "new"]?.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })()}

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
          {/* 11/10 세원 "답변 초안 고를 수 있는 건 뭐여?" → 이름을 '답변 유형'으로 + 무엇이 바뀌는지 */}
          <label className="flex items-center gap-1 text-[11px] text-stone-500" title="AI가 문의를 보고 고른 유형이에요. 바꾸고 '초안 다시 만들기'를 누르면 그 유형의 답변 틀(순서·예시)대로 다시 써요.">
            답변 유형
            <select value={v.type || ""} onChange={(e) => save({ type: e.target.value })} className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700" aria-label="답변 유형">
              <option value="">고르기</option>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
            </select>
          </label>
          <span className="text-[11px] text-stone-400">바꾸고 '초안 다시 만들기' → 그 유형 틀대로</span>
          <StockAt stock={D.stock} />
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

        {/* 11/11 세원 "계좌 오면 [다음 답]" — 손님 답을 받은 뒤 보낼 글을 카드에 맡겨 둔다(지금은 안 보냄) */}
        {v.nextReply?.text && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sky-900">다음 답</span>
              <span className="text-sky-800">{v.nextReply.when || "손님 답이 오면"} 보낼 글 · 지금은 안 보내요{v.nextReply.by ? ` · ${v.nextReply.by}` : ""}</span>
              <span className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => copyText(v.nextReply.text).then((ok) => ok && onMsg("다음 답을 복사했어요."))} className="flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2 py-1 text-sky-800">
                  <Copy size={11} /> 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!sentLike && v.draft && !window.confirm("지금 초안을 이 '다음 답'으로 바꿀까요? (지금 초안은 아직 안 보냈어요)")) return;
                    save({ draft: v.nextReply.text, blanks: [], fills: {}, confirmed: false, status: "ready", final: "", approvedAt: "", nextReply: null, nextUsed: { ...v.nextReply, usedAt: new Date().toISOString() } }, true);
                    onMsg("다음 답을 초안으로 옮겼어요 — 확인하고 보낼 목록에 넣어 주세요.");
                  }}
                  className="rounded-lg bg-sky-700 px-2.5 py-1 font-semibold text-white"
                >
                  이 글을 초안으로
                </button>
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-stone-700">{v.nextReply.text}</p>
          </div>
        )}

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
                  {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 보낼 목록에 넣기
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
            {v.status === "approved" ? (
              <>
                <Send size={15} className="text-sky-700" /> 보낼 목록에 있어요 — '보낼 준비'에서 [한꺼번에 보내기]를 누르면 {chName}로 나가요
              </>
            ) : v.status === "sending" ? (
              <>
                <Loader2 size={15} className="animate-spin text-sky-700" /> {pcOn ? `사무실 PC가 ${chName}로 보내는 중이에요` : `사무실 PC가 켜지면 ${chName}로 보내요`}
              </>
            ) : (
              <>
                <CircleCheck size={15} className="text-emerald-600" /> {v.status === "sent" ? `${chName}로 보냈어요 ${when(v.sentAt)}` : `처리 완료 ${when(v.doneAt)}`}
              </>
            )}
          </p>
          {v.error && <p className="text-xs text-rose-700">보내기 실패: {v.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copyDone(false)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600">
              {copied ? <Check size={13} /> : <Copy size={13} />} 보낸 글 복사
            </button>
            {v.status === "approved" && (
              <button type="button" onClick={unapprove} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-600">
                <Undo2 size={13} /> 보낼 목록에서 빼고 고치기
              </button>
            )}
            {!["sending", "approved"].includes(v.status) && (
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
      const r = await draftApi({ ...requestOf(base, D.tpl, {}, D.stock, D.learn, D.inbound), images });
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

function TemplateSheet({ tpl, learn, onSave, onClose }) {
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">CS 지침서 — AI가 가장 먼저 읽어요 (말투 · 사실 확인 · 하자·오배송·품절·지연·교환반품·취소 기준)</span>
          <textarea value={t.guide || ""} onChange={(e) => setT({ ...t, guide: e.target.value })} rows={14} className={FIELD + " font-mono text-xs leading-relaxed"} />
        </label>
        {(learn?.items || []).length > 0 && (
          <details className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-stone-600">세원이 고친 기록 {learn.items.length}개 — 다음 초안에 예시로 들어가요 · 자주 고치는 건 위 지침서에 옮겨 주세요</summary>
            <ul className="mt-2 space-y-2">
              {learn.items.slice(0, 20).map((l) => (
                <li key={l.id} className="rounded-lg bg-white p-2 text-[11px] leading-relaxed">
                  <div className="mb-1 font-semibold text-stone-500">
                    {l.type || "유형 없음"} · {l.product || ""} · {when(l.at)}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="whitespace-pre-wrap text-stone-400 line-through decoration-stone-300">{l.before}</p>
                    <p className="whitespace-pre-wrap text-stone-800">{l.after}</p>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
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
