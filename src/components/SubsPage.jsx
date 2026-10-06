import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ExternalLink, ChevronDown, Repeat, AlertTriangle, ArrowUpRight, ImagePlus, X } from "lucide-react";
import { loadKey, changeKey, upsert, remove, FIELD, md } from "../lib/shoot";
import { won } from "../lib/sales";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { CYCLES, STATUSES, KINDS, QUICK, nextPay, daysUntil, monthly, summary, tileColor, brandOf, nameFit, makeLogo } from "../lib/subs";
import { clipImages, filesOf } from "../lib/pasteImages";
import { Sheet, SheetHead, Chips } from "./ShootBits";

/**
 * 돈 › 구독 · 고정 지출 (lib/subs.js).
 * 맨 위 = 한 달에 얼마 나가나 · 30일 안에 나갈 돈. 그 아래 = 다음 결제일 순서로 **카드**(가장 가까운 결제가 맨 앞).
 * 10/7 세원(노션 카드 화면): "줄로 보이지 말고 블록으로, 썸네일은 직관적으로" → 위에 로고 썸네일, 아래 이름 · 상태 · 결제 시작일 · 다음 결제일 · 구독료 · 월간.
 * 무료체험은 '무료체험 중'(빨강) + 7일 안에 끝나면 위에 노란 줄 — 해지하려면 그 전에 해야 하니까.
 */

const EMPTY = { name: "", cycle: "month", price: "", status: "active", start: "", card: "", kind: "", url: "", memo: "", logo: "", logoBg: "" };
const KEY = "subscriptions";
const GRID = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4";
const dot = (k) => (k ? k.replaceAll("-", ".") : "—");

/** 로고 썸네일 — 붙여 넣은 로고 → 알아보는 곳은 글자·색 로고 → 이름 크게. 폭에 맞춰 커진다(@container + cqw). */
function Thumb({ s }) {
  const box = "@container flex h-full w-full items-center justify-center overflow-hidden";
  if (s.logo)
    return (
      <div className={box} style={{ background: s.logoBg || "#fff" }}>
        <img src={s.logo} alt="" className="max-h-[52%] max-w-[70%] object-contain" />
      </div>
    );
  const b = brandOf(s.name);
  if (b) {
    const font = { fontSize: `${b.size}cqw`, fontWeight: b.weight, color: b.color, letterSpacing: b.tracking, fontStyle: b.italic ? "italic" : undefined, fontFamily: b.serif ? "Georgia, 'Times New Roman', serif" : undefined, lineHeight: 1 };
    return (
      <div className={box + " gap-[2.5cqw]"} style={{ background: b.bg }} aria-hidden>
        {b.icon === "burst" && (
          <svg viewBox="-12 -12 24 24" style={{ width: "11cqw", height: "11cqw" }}>
            {Array.from({ length: 10 }, (_, i) => (
              <line key={i} x1="0" y1="-3.2" x2="0" y2="-10.5" stroke={b.iconColor} strokeWidth="2.8" strokeLinecap="round" transform={`rotate(${i * 36})`} />
            ))}
          </svg>
        )}
        {b.icon === "play" && (
          <svg viewBox="0 0 28 20" style={{ width: "11cqw" }}>
            <rect width="28" height="20" rx="5.5" fill="#FF0000" />
            <path d="M11.2 5.8 18.4 10l-7.2 4.2z" fill="#fff" />
          </svg>
        )}
        {b.letters ? (
          <span style={font}>
            {b.letters.map(([ch, c], i) => (
              <span key={i} style={{ color: c }}>
                {ch}
              </span>
            ))}
          </span>
        ) : b.boxed ? (
          <span className="flex items-center justify-center" style={{ ...font, width: "24cqw", height: "24cqw", border: "1.3cqw solid #111", borderRadius: "3cqw", background: "#fff" }}>
            {b.text}
          </span>
        ) : (
          <span style={{ ...font, transform: b.squish ? "scaleX(0.78)" : undefined }}>{b.text}</span>
        )}
      </div>
    );
  }
  const c = tileColor(s.name);
  return (
    <div className={box} style={{ background: `linear-gradient(135deg, ${c}14, ${c}2e)` }} aria-hidden>
      <span className="line-clamp-2 max-w-[84%] text-center font-bold break-keep" style={{ color: c, fontSize: `${nameFit(s.name)}cqw`, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
        {String(s.name || "?").trim()}
      </span>
    </div>
  );
}

const STATUS_CHIP = {
  active: ["구독 중", "bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  trial: ["무료체험 중", "bg-rose-50 text-rose-700", "bg-rose-500"],
  ended: ["해지", "bg-stone-100 text-stone-500", "bg-stone-400"],
};

function Card({ s, today, onOpen }) {
  const at = nextPay(s, today);
  const n = at ? daysUntil(at, today) : null;
  const [label, tone, dotTone] = STATUS_CHIP[s.status] || STATUS_CHIP.active;
  const ended = s.status === "ended";
  const trial = s.status === "trial";
  const due = n == null ? "" : n === 0 ? "오늘 결제" : `D-${n}`;
  const dueTone = trial ? "bg-amber-100 text-amber-900" : n <= 3 ? "bg-rose-600 text-white" : "bg-white/95 text-stone-700";
  const rows = ended
    ? [["해지한 날", dot(s.endedOn)]]
    : trial
      ? [["첫 결제일", dot(s.start)]]
      : [
          ["결제 시작일", dot(s.start)],
          ["다음 결제일", dot(at)],
        ];
  rows.push(["구독료", `${won(s.price)}원`]);
  if (s.card) rows.push(["결제 수단", s.card]);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:outline-none active:scale-[0.985]"
    >
      <div className={"relative aspect-[16/9] border-b border-stone-100 " + (ended ? "opacity-50 grayscale" : "")}>
        <Thumb s={s} />
        {due && <span className={"absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm tabular-nums " + dueTone}>{due}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-3.5">
        <div className="flex min-w-0 items-center gap-1">
          <b className="truncate text-[15px] font-semibold text-stone-900">{s.name}</b>
          {/^https?:\/\//.test(s.url) && (
            <a href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="해지·결제 관리 열기" className="shrink-0 rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <ArrowUpRight size={15} />
            </a>
          )}
        </div>
        <span className={"inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold " + tone}>
          <span className={"h-1.5 w-1.5 rounded-full " + dotTone} />
          {label}
        </span>
        <dl className="space-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="shrink-0 text-stone-400">{k}</dt>
              <dd className="truncate text-right font-medium text-stone-800 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
            {s.cycle === "year" ? `연간 · 월 ${won(monthly({ ...s, status: "active" }))}원꼴` : "월간"}
          </span>
          {s.kind && (
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[kindOf(s)] }} />
              {s.kind}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 고치기 창의 썸네일 칸 — 미리 보기 + 로고 사진 넣기(고르기 · 끌어다 놓기 · 창이 열린 동안 Ctrl+V) */
function LogoField({ x, set }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef(null);
  const take = useCallback(
    async (files) => {
      const f = files?.[0];
      if (!f) return;
      setBusy(true);
      setErr("");
      try {
        set(await makeLogo(f));
      } catch (e) {
        setErr(e.message || "사진을 넣지 못했어요.");
      } finally {
        setBusy(false);
      }
    },
    [set],
  );
  useEffect(() => {
    const onPaste = (e) => {
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return; // 글은 칸에 그대로
      e.preventDefault();
      filesOf(c).then(take);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [take]);
  const auto = !x.logo && brandOf(x.name);
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-stone-500">썸네일</span>
      <div className="flex items-start gap-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            filesOf(clipImages(e.dataTransfer)).then(take);
          }}
          className={"relative aspect-[16/9] w-40 shrink-0 overflow-hidden rounded-xl border border-stone-200 " + (busy ? "opacity-50" : "")}
        >
          <Thumb s={x} />
        </div>
        <div className="min-w-0 space-y-1.5 text-xs text-stone-500">
          <p>{x.logo ? "넣은 로고 사진이에요." : auto ? "이름을 알아봐서 로고 모양으로 보여요." : "로고 사진을 넣으면 카드에 그대로 보여요. 안 넣으면 이름이 크게 나와요."}</p>
          <p className="text-stone-400">캡처해서 Ctrl+V · 끌어다 놓기 — 둘레 여백은 저절로 잘라요.</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-700 hover:border-stone-400">
              <ImagePlus size={13} /> 로고 사진
            </button>
            {x.logo && (
              <button type="button" onClick={() => set({ logo: "", logoBg: "" })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-stone-400 hover:text-rose-600">
                <X size={13} /> 빼기
              </button>
            )}
          </div>
          {err && <p className="text-rose-600">{err}</p>}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          take([...e.target.files]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 어디에 얼마 쓰나 (세원 10/1: "그래프로 얼마를 어디서 쓰는지 가독성 좋고 예쁘게")
//
// 한 달 기준(연간은 12로 나눔). ① 분류별 한 줄 막대(부분 → 전체) + 아래 표처럼 읽히는 범례(색 · 분류 · 금액 · %)
// ② 구독별 막대 — 가장 많이 나가는 것부터, 한 색(크기만 보는 것이라). 색은 분류 고정 순서(KINDS) — 금액 순위가 바뀌어도 색은 안 바뀐다.
// 범주 색 6개는 dataviz 검사기 통과(색약 구분 OK). 노랑·초록·분홍이 바탕과 대비가 낮아 숫자는 늘 글자로 옆에 둔다.
const KIND_COLOR = { "쇼핑몰·운영": "#2a78d6", "디자인·영상": "#eb6834", "AI·업무툴": "#1baf7a", "광고·마케팅": "#eda100", 고정비: "#e87ba4", 기타: "#008300" };
const kindOf = (s) => (KIND_COLOR[s.kind] ? s.kind : "기타");

function SpendChart({ list }) {
  const [hover, setHover] = useState("");
  const live = list.filter((s) => s.status !== "ended" && monthly(s) > 0);
  const total = live.reduce((a, s) => a + monthly(s), 0);
  if (!total) return null;
  const kinds = KINDS.map((k) => ({ k, v: live.filter((s) => kindOf(s) === k).reduce((a, s) => a + monthly(s), 0) })).filter((x) => x.v > 0);
  const rows = [...live].sort((a, b) => monthly(b) - monthly(a));
  const top = rows.slice(0, 8);
  const rest = rows.slice(8);
  const max = monthly(rows[0]);
  const pct = (v) => Math.round((v / total) * 100);

  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-stone-800">어디에 얼마 쓰나</h3>
        <span className="text-xs text-stone-400">한 달 기준 · 연간은 12로 나눠서</span>
      </div>

      {/* 분류별 — 한 줄로 나눈 막대 */}
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={kinds.map((x) => `${x.k} ${won(x.v)}원`).join(", ")}>
        {kinds.map((x) => (
          <span
            key={x.k}
            title={`${x.k} · 월 ${won(x.v)}원 · ${pct(x.v)}%`}
            onMouseEnter={() => setHover(x.k)}
            onMouseLeave={() => setHover("")}
            style={{ width: `${(x.v / total) * 100}%`, background: KIND_COLOR[x.k], opacity: hover && hover !== x.k ? 0.35 : 1 }}
            className="h-full transition-opacity first:rounded-l-md last:rounded-r-md"
          />
        ))}
      </div>
      <ul className="mt-2.5 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {kinds.map((x) => (
          <li key={x.k} onMouseEnter={() => setHover(x.k)} onMouseLeave={() => setHover("")} className={"flex items-center gap-2 rounded-md px-1 " + (hover === x.k ? "bg-stone-50" : "")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: KIND_COLOR[x.k] }} />
            <span className="flex-1 text-stone-700">{x.k}</span>
            <span className="font-semibold text-stone-900 tabular-nums">{won(x.v)}원</span>
            <span className="w-9 text-right text-xs text-stone-400 tabular-nums">{pct(x.v)}%</span>
          </li>
        ))}
      </ul>

      {/* 구독별 — 많이 나가는 것부터 */}
      <div className="mt-4 space-y-1.5 border-t border-stone-100 pt-4">
        {top.map((s) => {
          const v = monthly(s);
          return (
            <div key={s.id} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2.5 text-sm" title={`${s.name} · 월 ${won(v)}원 · 전체의 ${pct(v)}%`}>
              <span className="truncate text-stone-700">{s.name}</span>
              <span className="h-2.5 rounded-r bg-stone-100">
                <span className="block h-full rounded-r" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: KIND_COLOR[kindOf(s)] }} />
              </span>
              <span className="w-24 text-right tabular-nums">
                <b className="font-semibold text-stone-900">{won(v)}</b>
                <span className="ml-1 text-xs text-stone-400">{pct(v)}%</span>
              </span>
            </div>
          );
        })}
        {rest.length > 0 && (
          <p className="pt-1 text-xs text-stone-400">
            그 외 {rest.length}개 · 월 {won(rest.reduce((a, s) => a + monthly(s), 0))}원
          </p>
        )}
      </div>
    </section>
  );
}

function Editor({ seed, onSave, onRemove, onClose }) {
  const [x, setX] = useState({ ...EMPTY, ...seed });
  const set = useCallback((p) => setX((v) => ({ ...v, ...p })), []);
  const ok = x.name.trim() && Number(x.price) > 0;
  const SEG = "flex-1 rounded-md py-1.5 text-sm font-medium ";
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={seed.id ? x.name || "구독" : "구독 추가"} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {!seed.id && (
          <div className="flex flex-wrap gap-1">
            {QUICK.map(([n, kind]) => (
              <button key={n} type="button" onClick={() => set({ name: n, kind })} className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-stone-400">
                {n}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">이름</span>
            <input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: Adobe" className={FIELD} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">금액 (한 번 결제)</span>
            <input value={x.price ? won(x.price) : ""} onChange={(e) => set({ price: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="0" className={FIELD + " text-right font-semibold tabular-nums"} />
          </label>
        </div>
        <LogoField x={x} set={set} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">주기</span>
            <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
              {CYCLES.map(([k, label]) => (
                <button key={k} type="button" onClick={() => set({ cycle: k })} className={SEG + (x.cycle === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">상태</span>
            <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
              {STATUSES.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set({ status: k, endedOn: k === "ended" ? x.endedOn || dayKey() : "" })}
                  className={SEG + (x.status === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">{x.status === "trial" ? "첫 결제일 (체험 끝나는 날)" : "결제 시작일"}</span>
            <input type="date" value={x.start} onChange={(e) => set({ start: e.target.value })} className={FIELD} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-stone-500">결제 수단</span>
            <input value={x.card} onChange={(e) => set({ card: e.target.value })} placeholder="예: 사업자카드 1234" className={FIELD} />
          </label>
        </div>
        {x.start && x.status !== "ended" && (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            다음 결제일 <b className="tabular-nums text-stone-900">{nextPay(x) || "—"}</b> · {x.cycle === "year" ? "1년마다" : "매달"} {x.start.slice(8)}일에 저절로 넘어가요.
          </p>
        )}
        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">분류</span>
          <Chips list={KINDS} value={x.kind} onChange={(v) => set({ kind: v })} />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">해지·결제 관리 주소</span>
          <input value={x.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className={FIELD} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-stone-500">메모</span>
          <textarea value={x.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 지원 계정으로 가입, 연간으로 바꾸면 20% 할인" className={FIELD + " min-h-[3rem] [field-sizing:content]"} />
        </label>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {seed.id ? (
          <button type="button" onClick={() => window.confirm(`${x.name} 을(를) 지울까요? 해지만 한 거면 상태를 '해지'로 두는 게 기록이 남아요.`) && onRemove(seed.id)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600">
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2">
          {/^https?:\/\//.test(x.url) && (
            <a href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
              <ExternalLink size={12} /> 열기
            </a>
          )}
          <button type="button" disabled={!ok} onClick={() => onSave({ ...x, name: x.name.trim(), price: Number(x.price), id: seed.id || newId("sub"), createdAt: seed.createdAt || new Date().toISOString() })} className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
            저장
          </button>
        </span>
      </footer>
    </Sheet>
  );
}

export default function SubsPage({ online }) {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(null);
  const [showEnded, setShowEnded] = useState(false);
  const today = dayKey();

  const load = useCallback(async () => {
    try {
      setList((await loadKey(KEY, online)).items || []);
    } catch {
      setMsg("구독 목록을 불러오지 못했어요. 인터넷을 확인해 주세요.");
    } finally {
      setLoaded(true);
    }
  }, [online]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect, react-hooks/set-state-in-effect
    load();
  }, [load]);

  const save = async (fn) => {
    try {
      setList((await changeKey(KEY, online, fn)).items || []);
      setEdit(null);
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    }
  };

  const sum = useMemo(() => summary(list, today), [list, today]);
  // 다음 결제일이 가까운 순 — 결제일이 없는 건 뒤로
  const live = useMemo(
    () => list.filter((s) => s.status !== "ended").sort((a, b) => (nextPay(a, today) || "9999").localeCompare(nextPay(b, today) || "9999")),
    [list, today],
  );
  const ended = list.filter((s) => s.status === "ended");
  const trialSoon = live.filter((s) => s.status === "trial" && nextPay(s, today) && daysUntil(nextPay(s, today), today) <= 7);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-900">구독 · 고정 지출</h2>
          <p className="mt-0.5 text-sm text-stone-500">매달·매년 저절로 빠져나가는 돈. 다음 결제일은 결제 시작일에서 저절로 넘어가요.</p>
        </div>
        <button type="button" onClick={() => setEdit({})} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <Plus size={16} /> 구독 추가
        </button>
      </div>

      {msg && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p>}

      {/* 한 달에 얼마 — 이 화면이 답하려는 질문 */}
      <section className="mb-4 grid gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-[1.4fr_1fr]">
        <div className="bg-white px-5 py-4">
          <span className="text-xs font-semibold text-stone-500">한 달에 나가는 돈</span>
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <b className="text-3xl font-bold tracking-tight text-stone-900">{won(sum.month)}</b>
            <span className="text-sm text-stone-500">원</span>
          </div>
          <p className="mt-1 text-xs text-stone-500 tabular-nums">
            1년이면 <b className="text-stone-700">{won(sum.year)}원</b> · 구독 {sum.count}개{sum.trials ? ` · 무료체험 ${sum.trials}개` : ""}
            <span className="text-stone-400"> (연간 결제는 12로 나눠서)</span>
          </p>
        </div>
        <div className="bg-stone-50 px-5 py-4">
          <span className="text-xs font-semibold text-stone-500">30일 안에 빠져나갈 돈</span>
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <b className="text-2xl font-bold text-rose-700">{won(sum.soonTotal)}</b>
            <span className="text-sm text-stone-500">원 · {sum.soonCount}건</span>
          </div>
        </div>
      </section>

      <SpendChart list={list} />

      {trialSoon.length > 0 && (
        <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            무료체험이 곧 끝나요 — {trialSoon.map((s) => `${s.name} ${md(nextPay(s, today))}`).join(", ")}. 계속 안 쓸 거면 그 전에 해지하세요.
          </span>
        </p>
      )}

      {!loaded ? null : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <Repeat size={22} className="mx-auto text-stone-300" />
          <p className="mt-2 text-sm text-stone-500">카페24, Claude, Adobe처럼 매달·매년 결제되는 걸 넣어 두면 한 달에 얼마 나가는지, 다음에 언제 빠져나가는지 보여 드려요.</p>
          <button type="button" onClick={() => setEdit({})} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700">
            <Plus size={14} /> 첫 구독 넣기
          </button>
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <h3 className="text-sm font-semibold text-stone-700">다음 결제 순서</h3>
            <span className="text-xs text-stone-400">누르면 고쳐요</span>
          </div>
          {live.length ? (
            <div className={GRID}>
              {live.map((s) => (
                <Card key={s.id} s={s} today={today} onOpen={() => setEdit(s)} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">지금 구독 중인 게 없어요.</p>
          )}
          {ended.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowEnded(!showEnded)} className="flex items-center gap-1 px-1 text-sm text-stone-500">
                <ChevronDown size={14} className={showEnded ? "rotate-180" : ""} /> 해지한 것 {ended.length}
              </button>
              {showEnded && (
                <div className={"mt-1.5 " + GRID}>
                  {ended.map((s) => (
                    <Card key={s.id} s={s} today={today} onOpen={() => setEdit(s)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {edit && <Editor key={edit.id || "new"} seed={edit} onClose={() => setEdit(null)} onSave={(s) => save(upsert(s))} onRemove={(id) => save(remove(id))} />}
    </div>
  );
}
