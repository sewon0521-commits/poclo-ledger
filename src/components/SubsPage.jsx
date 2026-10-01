import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ExternalLink, ChevronDown, Repeat, AlertTriangle } from "lucide-react";
import { loadKey, changeKey, upsert, remove, FIELD, md } from "../lib/shoot";
import { won } from "../lib/sales";
import { newId } from "../lib/id";
import { dayKey } from "../lib/journal";
import { CYCLES, STATUSES, KINDS, QUICK, nextPay, daysUntil, monthly, summary, tileColor } from "../lib/subs";
import { Sheet, SheetHead, Chips } from "./ShootBits";

/**
 * 돈 › 구독 · 고정 지출 (lib/subs.js).
 * 맨 위 = 한 달에 얼마 나가나 · 30일 안에 나갈 돈. 그 아래 = 다음 결제일 순서로 한 줄씩(가장 가까운 결제가 맨 위).
 * 무료체험은 '체험 끝나면 첫 결제'를 노랗게 — 해지하려면 그 전에 해야 하니까.
 */

const EMPTY = { name: "", cycle: "month", price: "", status: "active", start: "", card: "", kind: "", url: "", memo: "" };
const KEY = "subscriptions";

function Tile({ name, size = "h-10 w-10 text-base" }) {
  return (
    <span className={"flex shrink-0 items-center justify-center rounded-xl font-bold text-white " + size} style={{ background: tileColor(name) }} aria-hidden>
      {String(name || "?").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function Due({ s, today }) {
  const at = nextPay(s, today);
  if (!at) return <span className="text-xs text-stone-400">{s.status === "ended" ? `해지 ${md(s.endedOn) || ""}` : "결제일 없음"}</span>;
  const n = daysUntil(at, today);
  const tone = s.status === "trial" ? "bg-amber-100 text-amber-900" : n <= 3 ? "bg-rose-100 text-rose-800" : "bg-stone-100 text-stone-600";
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums " + tone}>{n === 0 ? "오늘" : `D-${n}`}</span>
      <span className="text-[11px] text-stone-400 tabular-nums">{md(at)}</span>
    </span>
  );
}

function Row({ s, today, onOpen }) {
  const trial = s.status === "trial";
  return (
    <button type="button" onClick={onOpen} className={"flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 " + (s.status === "ended" ? "opacity-55" : "")}>
      <Tile name={s.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="truncate font-semibold text-stone-900">{s.name}</b>
          {trial && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">무료체험</span>}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {[s.kind, s.card, trial && nextPay(s, today) ? "체험 끝나면 첫 결제" : ""].filter(Boolean).join(" · ") || (s.cycle === "year" ? "연간 결제" : "월간 결제")}
        </span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <b className="block text-stone-900">{won(s.price)}원</b>
        <span className="text-[11px] text-stone-400">{s.cycle === "year" ? `연간 · 월 ${won(monthly({ ...s, status: "active" }))}원꼴` : "매달"}</span>
      </span>
      <span className="w-14 shrink-0 text-right">
        <Due s={s} today={today} />
      </span>
    </button>
  );
}

function Editor({ seed, onSave, onRemove, onClose }) {
  const [x, setX] = useState({ ...EMPTY, ...seed });
  const set = (p) => setX((v) => ({ ...v, ...p }));
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
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {live.map((s) => (
              <Row key={s.id} s={s} today={today} onOpen={() => setEdit(s)} />
            ))}
            {!live.length && <p className="px-4 py-6 text-center text-sm text-stone-400">지금 구독 중인 게 없어요.</p>}
          </div>
          {ended.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowEnded(!showEnded)} className="flex items-center gap-1 px-1 text-sm text-stone-500">
                <ChevronDown size={14} className={showEnded ? "rotate-180" : ""} /> 해지한 것 {ended.length}
              </button>
              {showEnded && (
                <div className="mt-1.5 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  {ended.map((s) => (
                    <Row key={s.id} s={s} today={today} onOpen={() => setEdit(s)} />
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
