import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Copy, EyeOff, FileSignature, Loader2, Plus, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import {
  EMPTY,
  KEY,
  KINDS,
  PAY_DAYS,
  TAXES,
  accountText,
  daysBetween,
  dueOf,
  endOf,
  hoursText,
  markPaid,
  md,
  mdw,
  monthRows,
  monthText,
  newId,
  payOf,
  peopleOf,
  removePerson,
  removeWork,
  sameName,
  savePerson,
  saveWork,
  skipSuggestion,
  spanMinutes,
  suggestionsOf,
  sumPay,
  todayISO,
  transferLine,
  won,
} from "../lib/partTime";
import { ContractError, listContracts } from "../lib/contract";
import { changeKey, loadKey, onSettingsChange, watchKeys } from "../lib/shoot";
import { RrnBox } from "./ContractPage";
import HangulInput from "./HangulInput";
import { Sheet, SheetHead } from "./ShootBits";
import { Empty } from "./ui";

// 일 › 파트타이머 관리 (10/28) — 서명한 모델 계약서 = 파트타이머, 계좌는 계약서에서. 근무 시간 × 시급, 프리랜서 3.3% 떼기/그대로. 설명은 lib/partTime.js 머리말.

const F = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600";
const TAB_KEY = "poclo_parttime_tab";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

function CopyBtn({ text, children, primary }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={
        "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap " +
        (primary ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-stone-200 bg-white text-stone-700 hover:border-rose-300 hover:text-rose-800")
      }
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "복사했어요" : children}
    </button>
  );
}

const Pill = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={"rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap " + (on ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
    {children}
  </button>
);
const Pills = ({ value, onChange, options }) => (
  <div className="inline-flex flex-wrap rounded-full bg-stone-100 p-1">
    {options.map(([k, label]) => (
      <Pill key={k} on={value === k} onClick={() => onChange(k)}>
        {label}
      </Pill>
    ))}
  </div>
);
const TaxChip = ({ tax }) =>
  tax === "3.3" ? (
    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200">3.3%</span>
  ) : (
    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">그대로</span>
  );
const KindChip = ({ kind }) => <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">{kind === "staff" ? "알바·기타" : "모델"}</span>;
const Label = ({ children }) => <span className="mb-1 block text-xs font-semibold text-stone-500">{children}</span>;

/** 지급액 − 3.3% = 실지급 한 줄 */
function PayLine({ w, strong }) {
  const p = payOf(w);
  return (
    <span className="tabular-nums">
      {won(p.gross)}
      {p.tax > 0 && <span className="text-stone-400"> − 3.3% {p.tax.toLocaleString("ko-KR")}</span>}
      {p.tax > 0 && <span className={strong ? "font-semibold text-stone-900" : ""}> = {won(p.net)}</span>}
    </span>
  );
}

function DueBadge({ w, today }) {
  if (w.paidOn) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">지급 {md(w.paidOn)}</span>;
  const due = dueOf(w);
  const left = daysBetween(today, due);
  const tone = left < 0 ? "bg-rose-50 text-rose-800 ring-rose-200" : left <= 1 ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-stone-50 text-stone-600 ring-stone-200";
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + tone}>{left < 0 ? `기한 ${md(due)} · ${-left}일 지남` : left === 0 ? `오늘까지 지급` : `기한 ${md(due)} · D-${left}`}</span>;
}

// ------------------------------------------------------------ 근무 넣기 · 고치기

function WorkSheet({ init, people, onClose, onSave, onRemove }) {
  const [w, setW] = useState(init);
  const [hoursIn, setHoursIn] = useState(() => (init.minutes ? String(Math.round((init.minutes / 60) * 100) / 100) : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const person = people.find((p) => p.id === w.personId);
  const set = (patch) => setW((x) => ({ ...x, ...patch }));
  const choose = (id) => {
    const p = people.find((x) => x.id === id);
    // 새 근무면 그 사람 기본 시급·세금으로, 고치는 근무면 적어 둔 시급 그대로
    set(init.createdAt ? { personId: id } : { personId: id, wage: Number(p?.wage) || w.wage, tax: p?.tax || w.tax });
  };
  const setTimes = (start, end) => {
    const m = spanMinutes(start, end);
    set({ start, end, ...(m ? { minutes: m } : {}) });
    if (m) setHoursIn(String(Math.round((m / 60) * 100) / 100));
  };
  const setHours = (v) => {
    setHoursIn(v);
    const m = Math.round((Number(v) || 0) * 60);
    set({ minutes: m, end: w.start && m ? endOf(w.start, m) : w.end });
  };
  const p = payOf(w);
  const ok = w.personId && w.on && w.minutes > 0 && Number(w.wage) > 0;
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await onSave({ ...w, wage: Number(w.wage) || 0 });
      onClose();
    } catch (e) {
      setErr("저장하지 못했어요: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={init.id && init.createdAt ? "근무 고치기" : "근무 넣기"} onClose={onClose} />
      <div className="space-y-3.5 overflow-y-auto p-4">
        <label className="block">
          <Label>누가</Label>
          <select value={w.personId} onChange={(e) => choose(e.target.value)} className={F}>
            <option value="">사람 고르기</option>
            {people
              .filter((x) => !x.hidden || x.id === w.personId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.kind === "staff" ? "알바·기타" : "모델"}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="col-span-2 block sm:col-span-1">
            <Label>일한 날</Label>
            <input type="date" value={w.on} onChange={(e) => set({ on: e.target.value })} className={F} />
          </label>
          <label className="col-span-2 block sm:col-span-1">
            <Label>일한 시간</Label>
            <div className="flex items-center gap-1.5">
              <input type="number" min="0" step="0.5" inputMode="decimal" value={hoursIn} onChange={(e) => setHours(e.target.value)} className={F} aria-label="일한 시간" />
              <span className="shrink-0 text-sm text-stone-500">시간</span>
            </div>
          </label>
          <label className="block">
            <Label>시작</Label>
            <input type="time" value={w.start || ""} onChange={(e) => setTimes(e.target.value, w.end)} className={F} />
          </label>
          <label className="block">
            <Label>끝</Label>
            <input type="time" value={w.end || ""} onChange={(e) => setTimes(w.start, e.target.value)} className={F} />
          </label>
        </div>
        <p className="-mt-1.5 text-[11px] text-stone-400">시작·끝을 적으면 시간이 저절로 · {w.minutes ? hoursText(w.minutes) : "시간을 적어 주세요"}</p>
        <label className="block">
          <Label>시급(원){person && Number(person.wage) > 0 && Number(person.wage) !== Number(w.wage) ? ` · 기본 시급은 ${won(person.wage)}` : ""}</Label>
          <input type="number" min="0" step="1000" inputMode="numeric" value={w.wage || ""} onChange={(e) => set({ wage: e.target.value })} className={F} />
        </label>
        <div>
          <Label>세금</Label>
          <Pills value={w.tax} onChange={(tax) => set({ tax })} options={TAXES} />
        </div>
        <div className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
          <div className="flex justify-between">
            <span className="text-stone-500">지급액 ({won(w.wage)} × {hoursText(w.minutes)})</span>
            <span className="font-semibold tabular-nums">{won(p.gross)}</span>
          </div>
          {w.tax === "3.3" && (
            <>
              <div className="mt-1 flex justify-between text-stone-500">
                <span>소득세 3%</span>
                <span className="tabular-nums">− {won(p.incomeTax)}</span>
              </div>
              <div className="flex justify-between text-stone-500">
                <span>지방소득세 0.3%</span>
                <span className="tabular-nums">− {won(p.localTax)}</span>
              </div>
            </>
          )}
          <div className="mt-1.5 flex justify-between border-t border-stone-200 pt-1.5">
            <span className="font-semibold text-stone-800">보낼 돈</span>
            <span className="text-base font-bold text-rose-800 tabular-nums">{won(p.net)}</span>
          </div>
        </div>
        <label className="block">
          <Label>메모</Label>
          <input value={w.memo || ""} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 테스트 촬영 · 30분 일찍 끝남" className={F} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={!!w.paidOn} onChange={(e) => set({ paidOn: e.target.checked ? todayISO() : null })} className="size-4 accent-rose-700" />
            보냈어요(지급 완료)
          </label>
          {w.paidOn && <input type="date" value={w.paidOn} onChange={(e) => set({ paidOn: e.target.value || null })} className="rounded-lg border border-stone-300 px-2 py-1 text-sm" aria-label="지급한 날" />}
        </div>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        {onRemove ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 근무를 지울까요?")) return;
              await onRemove(w.id);
              onClose();
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-stone-400 hover:text-rose-700"
          >
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600">
            닫기
          </button>
          <button type="button" disabled={!ok || busy} onClick={save} className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300">
            {busy && <Loader2 size={14} className="animate-spin" />} 저장
          </button>
        </span>
      </footer>
    </Sheet>
  );
}

// ------------------------------------------------------------ 사람

function PersonSheet({ init, works, online, today, onClose, onSave, onRemove, onWork, onOpenWork, onPage }) {
  const fromContract = !!init.contract;
  const baseWage = Number(init.contract?.terms?.wage) || 0;
  const [p, setP] = useState(() => ({ ...init, wage: init.wage || "" }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const mine = works.filter((w) => w.personId === init.id).sort((a, b) => b.on.localeCompare(a.on));
  const rrnC = (init.contracts || []).find((c) => c.hasRrn) || init.contract;
  const ok = p.name.trim();
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const wage = Number(p.wage) || 0;
      await onSave({
        id: p.id,
        name: p.name.trim(),
        kind: p.kind,
        tax: p.tax,
        memo: p.memo || "",
        // 계약서 사람은 계약서 시급과 같으면 저장 안 함(다음 계약서 시급을 따라감)
        wage: fromContract && wage === baseWage ? null : wage,
        ...(fromContract ? {} : { phone: p.phone || "", bank: p.bank || "", account: p.account || "", holder: p.holder || "" }),
        ...(init.createdAt ? {} : { createdAt: new Date().toISOString() }),
      });
      onClose();
    } catch (e) {
      setErr("저장하지 못했어요: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title={init.name ? `${init.name}` : "사람 추가"} onClose={onClose} />
      <div className="space-y-4 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>이름</Label>
            <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 이주현" className={F} autoFocus={!init.name} />
          </label>
          <div>
            <Label>구분</Label>
            <Pills value={p.kind} onChange={(kind) => set({ kind })} options={KINDS} />
          </div>
          <label className="block">
            <Label>기본 시급(원){fromContract && baseWage ? ` · 계약서 ${won(baseWage)}` : ""}</Label>
            <input type="number" min="0" step="1000" inputMode="numeric" value={p.wage} onChange={(e) => set({ wage: e.target.value })} className={F} />
          </label>
          <div>
            <Label>세금 기본값</Label>
            <Pills value={p.tax} onChange={(tax) => set({ tax })} options={TAXES} />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-stone-400">시급·세금을 바꾸면 앞으로 넣는 근무부터 들어가요(이미 넣은 근무는 그대로 — 근무마다 고칠 수 있어요).</p>

        <section className="rounded-xl border border-stone-200 p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-stone-800">연락처 · 계좌</span>
            {fromContract && <span className="text-[11px] text-stone-400">모델 계약서에서 가져와요 · {md(init.accountAt?.slice(0, 10))} 서명</span>}
          </div>
          {fromContract ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="w-14 shrink-0 text-stone-500">연락처</span>
                <span className="text-stone-900 tabular-nums">{init.phone || "-"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-14 shrink-0 text-stone-500">계좌</span>
                <span className="min-w-0 break-all text-stone-900 tabular-nums">{accountText(init) || "-"}</span>
                {init.account && <CopyBtn text={accountText(init)}>복사</CopyBtn>}
              </div>
              <p className="text-[11px] text-stone-400">계좌가 바뀌었으면 새 계약서에 다시 서명받으면 바로 바뀌어요.</p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <Label>연락처</Label>
                <input value={p.phone || ""} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="010-0000-0000" className={F} />
              </label>
              <label className="block">
                <Label>은행</Label>
                <input value={p.bank || ""} onChange={(e) => set({ bank: e.target.value })} placeholder="예: 국민" className={F} />
              </label>
              <label className="block">
                <Label>계좌번호</Label>
                <input value={p.account || ""} onChange={(e) => set({ account: e.target.value.replace(/[^\d-]/g, "") })} inputMode="numeric" className={F} />
              </label>
              <label className="block sm:col-span-2">
                <Label>예금주</Label>
                <HangulInput value={p.holder || ""} onChange={(v) => set({ holder: v })} className={F} />
              </label>
              <p className="text-[11px] text-stone-400 sm:col-span-2">모델 계약서에 서명하면 계좌는 계약서 것으로 저절로 바뀌어요.</p>
            </div>
          )}
        </section>

        {rrnC?.signed_at && <RrnBox key={"rrn" + rrnC.id} c={rrnC} online={online} compact />}

        <label className="block">
          <Label>메모</Label>
          <input value={p.memo || ""} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 스레드 @soyepie · 월 3~4회" className={F} />
        </label>

        {(init.contracts || []).length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-800">모델 계약서 {init.contracts.length}</span>
              {onPage && (
                <button type="button" onClick={() => onPage("contracts")} className="text-xs font-semibold text-rose-700 hover:text-rose-900">
                  모델 계약서 화면 ›
                </button>
              )}
            </div>
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {init.contracts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs text-stone-600">
                  <FileSignature size={12} className="text-stone-400" />
                  <span className="text-stone-900">촬영 {mdw(c.terms?.date)}</span>
                  <span>시급 {won(c.terms?.wage)}</span>
                  <span className="text-stone-400">{md(c.signed_at?.slice(0, 10))} 서명</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {init.id && init.name && (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-800">근무 {mine.length}</span>
              <button type="button" onClick={() => onWork(init)} className="flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900">
                <Plus size={13} /> 근무 넣기
              </button>
            </div>
            {mine.length ? (
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {mine.slice(0, 12).map((w) => (
                  <li key={w.id}>
                    <button type="button" onClick={() => onOpenWork(w)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-xs text-stone-600 hover:bg-stone-50">
                      <span className="text-stone-900">{mdw(w.on)}</span>
                      <span>{hoursText(w.minutes)}</span>
                      <PayLine w={w} />
                      <span className="ml-auto">
                        <DueBadge w={w} today={today} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-xs text-stone-400">아직 넣은 근무가 없어요</p>
            )}
          </section>
        )}
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <span className="flex gap-1">
          {init.name && (
            <button
              type="button"
              onClick={async () => {
                await onSave({ id: init.id, name: init.name, hidden: init.hidden ? null : true });
                onClose();
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-stone-500 hover:text-stone-800"
            >
              <EyeOff size={13} /> {init.hidden ? "다시 보이기" : "목록에서 숨기기"}
            </button>
          )}
          {init.name && !fromContract && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`${init.name}을(를) 지울까요? 넣은 근무 ${mine.length}개도 같이 지워져요.`)) return;
                await onRemove(init.id);
                onClose();
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-stone-400 hover:text-rose-700"
            >
              <Trash2 size={13} /> 지우기
            </button>
          )}
        </span>
        <span className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600">
            닫기
          </button>
          <button type="button" disabled={!ok || busy} onClick={save} className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300">
            {busy && <Loader2 size={14} className="animate-spin" />} 저장
          </button>
        </span>
      </footer>
    </Sheet>
  );
}

// ------------------------------------------------------------ 지급할 것

function PayTab({ people, works, today, onOpenWork, onPaid, onPerson }) {
  const unpaid = works.filter((w) => !w.paidOn);
  const groups = people
    .map((p) => ({ p, ws: unpaid.filter((w) => w.personId === p.id).sort((a, b) => a.on.localeCompare(b.on)) }))
    .filter((g) => g.ws.length)
    .sort((a, b) => a.ws[0].on.localeCompare(b.ws[0].on));
  const [paidOn, setPaidOn] = useState(today);
  if (!groups.length) return <Empty title="보낼 돈이 없어요" hint="근무를 넣으면 지급 기한(근무일 + 3일)과 보낼 돈이 여기에 떠요." />;
  const all = sumPay(groups.flatMap((g) => g.ws));
  const allText = groups.map((g) => transferLine(g.p, sumPay(g.ws).net)).join("\n");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm">
        <span className="text-stone-600">
          {groups.length}명 · 보낼 돈 <b className="text-stone-900 tabular-nums">{won(all.net)}</b>
          {all.tax > 0 && <span className="text-stone-500"> (3.3% {won(all.tax)} 뗌)</span>}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-stone-500">지급한 날</span>
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value || today)} className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs" aria-label="지급한 날" />
          <CopyBtn text={allText}>이체 목록 복사</CopyBtn>
        </span>
      </div>
      {groups.map(({ p, ws }) => {
        const s = sumPay(ws);
        const late = ws.some((w) => daysBetween(today, dueOf(w)) < 0);
        return (
          <section key={p.id} className={"rounded-xl border bg-white p-3.5 " + (late ? "border-rose-200" : "border-stone-200")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onPerson(p)} className="font-semibold text-stone-900 hover:text-rose-800">
                {p.name}
              </button>
              <KindChip kind={p.kind} />
              {late && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-rose-700">
                  <AlertTriangle size={12} /> 지급 기한 지남
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              {p.account ? (
                <>
                  <span className="min-w-0 break-all text-stone-800 tabular-nums">{accountText(p)}</span>
                  <CopyBtn text={p.account}>계좌번호 복사</CopyBtn>
                  <span className="text-[11px] text-stone-400">{p.accountFrom === "contract" ? "모델 계약서에서" : "직접 적은 계좌"}</span>
                </>
              ) : (
                <button type="button" onClick={() => onPerson(p)} className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                  계좌가 없어요 — 계약서 서명 또는 직접 적기
                </button>
              )}
            </div>
            <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-100">
              {ws.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => onOpenWork(w)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2 text-left text-xs text-stone-600 hover:bg-stone-50">
                    <span className="font-medium text-stone-900">{mdw(w.on)}</span>
                    {w.start && <span>{w.start}{w.end ? `~${w.end}` : ""}</span>}
                    <span>{hoursText(w.minutes)} × {won(w.wage)}</span>
                    <PayLine w={w} />
                    {w.memo && <span className="text-stone-400">· {w.memo}</span>}
                    <span className="ml-auto">
                      <DueBadge w={w} today={today} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-stone-600">
                보낼 돈 <b className="text-base text-rose-800 tabular-nums">{won(s.net)}</b>
                {s.tax > 0 && <span className="text-xs text-stone-400"> · 지급 {won(s.gross)} − 3.3% {won(s.tax)}</span>}
              </span>
              <CopyBtn text={transferLine(p, s.net)}>이체 정보 복사</CopyBtn>
              <button
                type="button"
                onClick={() => onPaid(ws.map((w) => w.id), paidOn)}
                className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
              >
                <Check size={12} /> {md(paidOn)} 지급 완료
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ 근무 기록 (달마다)

const ymOf = (iso) => iso.slice(0, 7);
const shiftYm = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ymText = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
function MonthPick({ ym, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(shiftYm(ym, -1))} aria-label="이전 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[6.5rem] text-center text-sm font-semibold text-stone-800">{ymText(ym)}</span>
      <button type="button" onClick={() => onChange(shiftYm(ym, 1))} aria-label="다음 달" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function WorksTab({ people, works, today, ym, setYm, onOpenWork, onAdd }) {
  const list = works.filter((w) => ymOf(w.on) === ym).sort((a, b) => b.on.localeCompare(a.on) || (b.start || "").localeCompare(a.start || ""));
  const s = sumPay(list);
  const name = (id) => people.find((p) => p.id === id)?.name || "지운 사람";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPick ym={ym} onChange={setYm} />
        <span className="text-xs text-stone-500 tabular-nums">
          근무 {s.n}회 · {hoursText(s.minutes)} · 지급 {won(s.gross)}
          {s.tax > 0 ? ` · 3.3% ${won(s.tax)}` : ""} · 보낼 돈 {won(s.net)}
        </span>
      </div>
      {!list.length ? (
        <Empty title={`${Number(ym.slice(5, 7))}월에 넣은 근무가 없어요`} hint="'근무 넣기'로 누가 · 언제 · 몇 시간 일했는지 적으면 시급 × 시간으로 계산해요.">
          <button type="button" onClick={onAdd} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white">
            근무 넣기
          </button>
        </Empty>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {list.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => onOpenWork(w)} className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2.5 text-left text-sm hover:bg-stone-50">
                <span className="w-16 shrink-0 text-xs text-stone-500">{mdw(w.on)}</span>
                <span className="font-medium text-stone-900">{name(w.personId)}</span>
                <span className="text-xs text-stone-500">
                  {w.start ? `${w.start}${w.end ? `~${w.end}` : ""} · ` : ""}
                  {hoursText(w.minutes)} × {won(w.wage)}
                </span>
                <TaxChip tax={w.tax} />
                <span className="ml-auto flex items-center gap-2 text-xs">
                  <PayLine w={w} strong />
                  <DueBadge w={w} today={today} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 사람 목록

function PeopleTab({ people, works, days, today, onPerson, onAdd }) {
  const [showHidden, setShowHidden] = useState(false);
  const ym = today.slice(0, 7);
  const shown = people.filter((p) => showHidden || !p.hidden);
  const hiddenN = people.filter((p) => p.hidden).length;
  const nextShoot = (p) =>
    (days?.items || [])
      .filter((d) => d.on > today && (d.models || []).some((m) => sameName(m, p.name)))
      .map((d) => d.on)
      .sort()[0];
  if (!people.length)
    return (
      <Empty title="아직 파트타이머가 없어요" hint="모델 계약서에 서명하면 여기 저절로 들어와요(계좌·연락처·시급까지). 계약서 없이 일하는 알바는 '사람 추가'로.">
        <button type="button" onClick={onAdd} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white">
          사람 추가
        </button>
      </Empty>
    );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((p) => {
          const mineM = works.filter((w) => w.personId === p.id && ymOf(w.on) === ym);
          const s = sumPay(mineM);
          const unpaid = works.filter((w) => w.personId === p.id && !w.paidOn);
          const nx = nextShoot(p);
          return (
            <button key={p.id} type="button" onClick={() => onPerson(p)} className={"rounded-xl border border-stone-200 bg-white p-3.5 text-left hover:border-stone-400 " + (p.hidden ? "opacity-60" : "")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-stone-900">{p.name}</span>
                <KindChip kind={p.kind} />
                <TaxChip tax={p.tax} />
                {p.hidden && <span className="text-[11px] text-stone-400">숨김</span>}
                <span className="ml-auto text-sm font-semibold text-stone-800 tabular-nums">{Number(p.wage) ? `시급 ${won(p.wage)}` : "시급 없음"}</span>
              </div>
              <div className="mt-1 truncate text-xs text-stone-500 tabular-nums">
                {p.account ? accountText(p) : <span className="text-amber-700">계좌 없음</span>}
                {p.account && <span className="text-stone-400"> · {p.accountFrom === "contract" ? "계약서" : "직접"}</span>}
                {p.phone ? ` · ${p.phone}` : ""}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-500">
                <span>
                  {Number(ym.slice(5, 7))}월 {s.n}회 · {hoursText(s.minutes)} · {won(s.gross)}
                </span>
                {unpaid.length > 0 && <span className="font-semibold text-rose-700">보낼 돈 {won(sumPay(unpaid).net)}</span>}
                {nx && (
                  <span className="flex items-center gap-0.5">
                    <CalendarClock size={11} /> 다음 촬영 {mdw(nx)}
                  </span>
                )}
                {!p.contract && p.kind === "model" && <span className="text-amber-700">계약서 없음</span>}
              </div>
            </button>
          );
        })}
      </div>
      {hiddenN > 0 && (
        <button type="button" onClick={() => setShowHidden(!showHidden)} className="text-xs font-medium text-stone-500 hover:text-stone-800">
          {showHidden ? "숨긴 사람 접기" : `숨긴 사람 ${hiddenN}명 보기`}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 월별 정리 (지급일 기준 — 원천징수 신고 자료)

function MonthTab({ people, works, online, biz, ym, setYm }) {
  const rows = monthRows(works, people, ym);
  const taxed = sumPay(rows.flatMap((r) => r.taxedWorks));
  const plain = sumPay(rows.flatMap((r) => r.plainWorks));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPick ym={ym} onChange={setYm} />
        {rows.length > 0 && <CopyBtn text={monthText(ym, rows, biz?.name || "포클로")}>세무사에게 보낼 글 복사</CopyBtn>}
      </div>
      <p className="text-xs leading-relaxed text-stone-500">
        <b>지급한 날</b> 기준으로 모았어요. 주민등록번호는 복사 글에 넣지 않아요 — 사람마다 &apos;신고용 보기&apos;(누가 언제 봤는지 남음)에서 확인해요.
      </p>
      {!rows.length ? (
        <Empty title={`${Number(ym.slice(5, 7))}월에 지급한 돈이 없어요`} hint="'지급할 것'에서 지급 완료를 누르면 그 날짜 달로 들어와요." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["3.3% 지급액", taxed.gross],
              ["소득세 3%", taxed.incomeTax],
              ["지방소득세", taxed.localTax],
              ["떼지 않고 지급", plain.gross],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="text-xs text-stone-500">{k}</div>
                <div className="mt-0.5 text-base font-bold text-stone-900 tabular-nums">{won(v)}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const c = (r.person?.contracts || []).find((x) => x.hasRrn) || r.person?.contract;
              return (
                <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-900">{r.name}</span>
                    <span className="text-xs text-stone-400">지급일 {[...new Set([...r.paidDays.taxed, ...r.paidDays.plain])].sort().map(md).join(", ")}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
                    {r.taxed.n > 0 && (
                      <>
                        <div>
                          <dt className="text-[11px] text-stone-500">지급액 (3.3%)</dt>
                          <dd className="font-semibold tabular-nums">{won(r.taxed.gross)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-stone-500">소득세</dt>
                          <dd className="tabular-nums">{won(r.taxed.incomeTax)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-stone-500">지방소득세</dt>
                          <dd className="tabular-nums">{won(r.taxed.localTax)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-stone-500">실지급</dt>
                          <dd className="tabular-nums">{won(r.taxed.net)}</dd>
                        </div>
                      </>
                    )}
                    {r.plain.n > 0 && (
                      <div className="col-span-2">
                        <dt className="text-[11px] text-stone-500">떼지 않고 지급</dt>
                        <dd className="font-semibold tabular-nums">{won(r.plain.gross)}</dd>
                      </div>
                    )}
                  </dl>
                  {r.taxed.n > 0 &&
                    (c?.signed_at ? (
                      <div className="mt-2.5">
                        <RrnBox key={"rrn" + c.id} c={c} online={online} compact />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-700">서명한 모델 계약서가 없어 주민등록번호가 없어요 — 신고 전에 따로 받아야 해요.</p>
                    ))}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 화면

export default function PartTimePage({ online, onPage }) {
  const today = todayISO();
  const [data, setData] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [noContracts, setNoContracts] = useState(false);
  const [days, setDays] = useState({ items: [] });
  const [biz, setBiz] = useState({});
  const [err, setErr] = useState("");
  const [tab, setTabState] = useState(() => {
    try {
      return localStorage.getItem(TAB_KEY) || "pay";
    } catch {
      return "pay";
    }
  });
  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 무시 */
    }
  };
  const [ym, setYm] = useState(today.slice(0, 7));
  const [work, setWork] = useState(null); // 근무 창 {init, isNew}
  const [person, setPerson] = useState(null);

  const loadData = () => loadKey(KEY, online, EMPTY).then((v) => setData({ ...EMPTY, ...v })).catch((e) => setErr("못 읽었어요: " + (e.message || e)));
  const loadContracts = () =>
    listContracts(online)
      .then((l) => {
        setContracts(l);
        setNoContracts(false);
      })
      .catch((e) => {
        if (e instanceof ContractError && e.code === "missing") setNoContracts(true);
      });
  useEffect(() => {
    loadData();
    loadContracts();
    loadKey("shoot_days", online, { items: [] })
      .then((v) => setDays(v || { items: [] }))
      .catch(() => {});
    loadKey("biz_info", online, {})
      .then((v) => setBiz(v || {}))
      .catch(() => {});
    // 둘이 같이 쓰기 — 상대가 고치면 바로(방송), 놓쳐도 4초마다 확인. 계약서는 화면을 다시 볼 때 새로
    const off = onSettingsChange((k) => k === KEY && loadData());
    const stop = watchKeys([KEY], () => loadData());
    const vis = () => document.visibilityState === "visible" && loadContracts();
    document.addEventListener("visibilitychange", vis);
    return () => {
      off();
      stop();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 누르면 내 화면 먼저, 서버는 최신을 읽어 같은 바꾸기를 한 번 더(lib/shoot changeKey) */
  const change = async (fn) => {
    setErr("");
    setData((d) => ({ ...EMPTY, ...fn(d || EMPTY) }));
    try {
      const v = await changeKey(KEY, online, fn, EMPTY);
      setData({ ...EMPTY, ...v });
    } catch (e) {
      setErr("저장하지 못했어요: " + (e.message || e));
      loadData();
      throw e;
    }
  };

  const people = useMemo(() => peopleOf(data, contracts), [data, contracts]);
  const works = useMemo(() => data?.works || [], [data]);
  const sugg = useMemo(() => (data ? suggestionsOf(data, people, days, today) : []), [data, people, days, today]);

  const unpaid = works.filter((w) => !w.paidOn);
  const unpaidSum = sumPay(unpaid);
  const late = unpaid.filter((w) => daysBetween(today, dueOf(w)) < 0).length;
  const mon = today.slice(0, 7);
  const paidM = sumPay(works.filter((w) => w.paidOn?.startsWith(mon)));
  const workM = sumPay(works.filter((w) => w.on.startsWith(mon)));

  const blankWork = (p, extra) => ({ id: newId("w"), personId: p?.id || "", on: today, start: "", end: "", minutes: 120, wage: Number(p?.wage) || 0, tax: p?.tax || "3.3", memo: "", paidOn: null, ...extra });
  const openNewWork = (p) => setWork({ init: blankWork(p), isNew: true });
  const openWork = (w) => setWork({ init: w, isNew: false });
  const fromSuggestion = (s) =>
    setWork({ init: blankWork(people.find((p) => p.id === s.personId), { on: s.on, start: s.start, end: s.start ? endOf(s.start, s.minutes) : "", minutes: s.minutes, wage: s.wage, tax: s.tax, from: s.from }), isNew: true });
  const newPerson = () => setPerson({ id: newId("p"), name: "", kind: "staff", tax: "3.3", wage: "", contracts: [], contract: null });

  if (!data)
    return (
      <div className="flex h-40 items-center justify-center text-stone-300">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
            <Users size={20} /> 파트타이머 관리
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">모델 계약서에 서명한 사람은 계좌·연락처·시급까지 저절로 들어와요. 일한 시간 × 시급, 프리랜서 3.3%는 사람·근무마다 떼거나 그대로 줘요.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={newPerson} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300">
            <UserPlus size={14} /> 사람 추가
          </button>
          <button type="button" onClick={() => openNewWork(null)} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            <Plus size={15} /> 근무 넣기
          </button>
        </div>
      </div>

      {noContracts && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">모델 계약서 표가 아직 없어서 계약서 사람을 못 불러왔어요 — 모델 계약서 화면의 SQL 안내를 따라 주세요.</p>}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => setTab("pay")} className={"rounded-xl border bg-white p-3.5 text-left hover:border-stone-400 " + (late ? "border-rose-300" : "border-stone-200")}>
          <div className="flex items-center gap-1 text-xs font-medium text-stone-500">
            <Wallet size={12} /> 보낼 돈
          </div>
          <div className="mt-1 text-lg leading-tight font-bold text-rose-800 tabular-nums">{won(unpaidSum.net)}</div>
          <div className={"mt-0.5 text-[11px] " + (late ? "font-semibold text-rose-700" : "text-stone-400")}>{late ? `기한 지난 근무 ${late}개` : `근무 ${unpaidSum.n}개 · 근무일 + ${PAY_DAYS}일 안에`}</div>
        </button>
        <div className="rounded-xl border border-stone-200 bg-white p-3.5">
          <div className="text-xs font-medium text-stone-500">{Number(mon.slice(5, 7))}월 보낸 돈</div>
          <div className="mt-1 text-lg leading-tight font-bold text-stone-900 tabular-nums">{won(paidM.net)}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">지급액 {won(paidM.gross)}</div>
        </div>
        <button type="button" onClick={() => (setYm(mon), setTab("month"))} className="rounded-xl border border-stone-200 bg-white p-3.5 text-left hover:border-stone-400">
          <div className="text-xs font-medium text-stone-500">{Number(mon.slice(5, 7))}월 뗀 3.3%</div>
          <div className="mt-1 text-lg leading-tight font-bold text-stone-900 tabular-nums">{won(paidM.tax)}</div>
          <div className="mt-0.5 text-[11px] text-stone-400">소득세 {won(paidM.incomeTax)} · 지방 {won(paidM.localTax)}</div>
        </button>
        <button type="button" onClick={() => (setYm(mon), setTab("works"))} className="rounded-xl border border-stone-200 bg-white p-3.5 text-left hover:border-stone-400">
          <div className="text-xs font-medium text-stone-500">{Number(mon.slice(5, 7))}월 근무</div>
          <div className="mt-1 text-lg leading-tight font-bold text-stone-900 tabular-nums">{workM.n}회</div>
          <div className="mt-0.5 text-[11px] text-stone-400">{hoursText(workM.minutes)} · 지급액 {won(workM.gross)}</div>
        </button>
      </div>

      {sugg.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <div className="mb-2 text-sm font-semibold text-amber-950">넣을 근무가 있어요 · {sugg.length}</div>
          <p className="mb-2 text-[11px] text-amber-900/70">모델 계약서 촬영일·촬영 관리에서 찾았어요. '넣기'를 누르면 실제로 일한 시간을 확인하고 저장해요.</p>
          <ul className="space-y-1.5">
            {sugg.slice(0, 8).map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
                <span className="font-semibold text-stone-900">{s.name}</span>
                <span className="text-stone-700">{mdw(s.on)}</span>
                <span className="text-xs text-stone-500">
                  {s.start ? `${s.start} · ` : ""}
                  {hoursText(s.minutes)} · 시급 {won(s.wage)} · {s.why}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" onClick={() => change(skipSuggestion(s.key)).catch(() => {})} className="rounded-lg px-2 py-1 text-xs text-stone-500 hover:text-stone-800">
                    건너뛰기
                  </button>
                  <button type="button" onClick={() => fromSuggestion(s)} className="rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-800">
                    넣기
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto">
        <div className="inline-flex rounded-full bg-stone-100 p-1">
          <Pill on={tab === "pay"} onClick={() => setTab("pay")}>
            지급할 것 {new Set(unpaid.map((w) => w.personId)).size || ""}
          </Pill>
          <Pill on={tab === "works"} onClick={() => setTab("works")}>
            근무 기록
          </Pill>
          <Pill on={tab === "people"} onClick={() => setTab("people")}>
            사람 {people.filter((p) => !p.hidden).length}
          </Pill>
          <Pill on={tab === "month"} onClick={() => setTab("month")}>
            월별 정리
          </Pill>
        </div>
      </div>

      {tab === "pay" ? (
        <PayTab people={people} works={works} today={today} onOpenWork={openWork} onPerson={setPerson} onPaid={(ids, on) => change(markPaid(ids, on)).catch(() => {})} />
      ) : tab === "works" ? (
        <WorksTab people={people} works={works} today={today} ym={ym} setYm={setYm} onOpenWork={openWork} onAdd={() => openNewWork(null)} />
      ) : tab === "people" ? (
        <PeopleTab people={people} works={works} days={days} today={today} onPerson={setPerson} onAdd={newPerson} />
      ) : (
        <MonthTab people={people} works={works} online={online} biz={biz} ym={ym} setYm={setYm} />
      )}

      {work && (
        <WorkSheet
          key={work.init.id}
          init={work.init}
          people={people}
          onClose={() => setWork(null)}
          onSave={(w) => change(saveWork(work.isNew ? { ...w, createdAt: new Date().toISOString() } : w))}
          onRemove={work.isNew ? null : (id) => change(removeWork(id))}
        />
      )}
      {person && (
        <PersonSheet
          key={person.id}
          init={person}
          works={works}
          online={online}
          today={today}
          onClose={() => setPerson(null)}
          onSave={(x) => change(savePerson(x))}
          onRemove={(id) => change(removePerson(id))}
          onWork={(p) => {
            setPerson(null);
            openNewWork(p);
          }}
          onOpenWork={(w) => {
            setPerson(null);
            openWork(w);
          }}
          onPage={onPage}
        />
      )}
    </div>
  );
}
