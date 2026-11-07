import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, FileSignature, Loader2, Lock, Pencil, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import {
  HOLES,
  PLACE,
  STOCK,
  TEMPLATES_KEY,
  TEMPLATE_KEY,
  USES,
  ContractError,
  createContract,
  dateText,
  dmText,
  faceText,
  fillText,
  kindName,
  listContracts,
  needsOf,
  removeContract,
  revealRrn,
  rrnReady,
  signLink,
  templateList,
  updateContract,
  usesText,
  whoOf,
  wonText,
} from "../lib/contract";
import { changeKey, loadKey } from "../lib/shoot";
import { isRemote } from "../lib/supabase";
import { ContractText, SignedBlock, printContract, signedAtText } from "./ContractDoc";
import { Sheet, SheetHead } from "./ShootBits";
import { Empty } from "./ui";

// 일 › 모델 계약서 (10/25, 10/28 촬영 갈래에서 옮김) — 계약 만들기 → 링크·DM 문구 복사 → 모델이 폰에서 서명 → '서명 완료'. 설명은 lib/contract.js 머리말.
// 서명한 사람은 일 › 파트타이머 관리에 저절로 들어간다(계좌·연락처·시급 — lib/partTime.js).

const F = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600";
const SQL_URL = "https://supabase.com/dashboard/project/prbsdwmlnigpjcfkvivd/sql/new";

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
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={
        "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap " +
        (primary ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-stone-200 text-stone-700 hover:border-rose-300 hover:text-rose-800")
      }
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "복사했어요" : children}
    </button>
  );
}

const Tab = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={"rounded-full px-3.5 py-1.5 text-sm font-medium " + (on ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
    {children}
  </button>
);

const nextWed = () => {
  const d = new Date();
  d.setDate(d.getDate() + (((3 - d.getDay() + 7) % 7) || 7));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ------------------------------------------------------------ 만들기

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const PICK_MEM = "poclo_contract_kind";

function NewSheet({ online, tpls, biz, onClose, onMade }) {
  // 계약서 종류 — 마지막에 고른 것(기기마다), 없으면 맨 앞
  const [kid, setKid] = useState(() => {
    let m = "";
    try {
      m = localStorage.getItem(PICK_MEM) || "";
    } catch {
      /* 기억 못 해도 맨 앞 */
    }
    return tpls.some((x) => x.id === m) ? m : tpls[0]?.id;
  });
  const tpl = tpls.find((x) => x.id === kid) || tpls[0];
  const need = needsOf(tpl.body);
  const [t, setT] = useState(() => ({
    name: "",
    date: nextWed(),
    time: "12:00",
    hours: 2,
    wage: 20000,
    face: "on",
    uses: [...USES],
    usesEtc: "",
    place: tpl.place || PLACE,
    startOn: todayISO(),
    memo: "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [peek, setPeek] = useState(false);
  // 이 계약서만 고친 본문 — null 이면 틀대로(위 칸이 바뀌면 같이 바뀜)
  const [edited, setEdited] = useState(null);
  const set = (k) => (v) => setT((x) => ({ ...x, [k]: v }));
  const pick = (id) => {
    if (id === kid) return;
    if (edited != null && !window.confirm("이 계약서만 고친 본문이 있어요. 종류를 바꾸면 고친 게 사라져요 — 바꿀까요?")) return;
    const next = tpls.find((x) => x.id === id);
    setKid(id);
    setEdited(null);
    if (next?.place) setT((x) => ({ ...x, place: next.place }));
    try {
      localStorage.setItem(PICK_MEM, id);
    } catch {
      /* 기억 못 해도 됨 */
    }
  };
  // 본문에 없는 칸은 계약서에 안 남긴다 — 정식 모델 계약서엔 촬영일이 없어서 파트타이머 '넣을 근무'에 안 뜬다
  const { date, time, hours, place, uses, usesEtc, startOn, ...rest } = t;
  const full = {
    ...rest,
    ...(need.date ? { date, time, hours } : {}),
    ...(need.place ? { place } : {}),
    ...(need.uses ? { uses, usesEtc } : {}),
    ...(need.start ? { startOn } : {}),
    title: tpl.title,
    tplId: tpl.id,
    tplName: tpl.name,
    bizName: biz.name || "포클로 POCLO",
    ceo: biz.ceo || "최지원",
  };
  const filled = fillText(tpl.body, full);
  const text = edited ?? filled;
  const ok = t.name.trim() && Number(t.wage) > 0 && (!need.date || (t.date && t.time)) && (!need.start || t.startOn);

  const make = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await createContract(online, { ...full, name: t.name.trim(), ...(need.date ? { hours: Number(t.hours) || 0 } : {}), wage: Number(t.wage) || 0, text, madeAt: new Date().toISOString() });
      onMade(r);
    } catch (e) {
      setErr(e instanceof ContractError && e.code === "missing" ? "missing" : "저장하지 못했어요: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="계약서 만들기" onClose={onClose} />
      <div className="space-y-3.5 overflow-y-auto p-4">
        <div>
          <span className="mb-1 block text-xs font-semibold text-stone-500">어떤 계약서?</span>
          <div className="flex flex-wrap gap-1.5" data-kinds>
            {tpls.map((x) => {
              const on = x.id === tpl.id;
              const n = needsOf(x.body);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => pick(x.id)}
                  className={"rounded-xl border px-3 py-2 text-left " + (on ? "border-rose-600 bg-rose-50 ring-1 ring-rose-600" : "border-stone-200 bg-white hover:border-stone-300")}
                >
                  <span className={"flex items-center gap-1 text-sm font-semibold " + (on ? "text-rose-800" : "text-stone-800")}>
                    {on && <Check size={13} />} {x.name}
                  </span>
                  <span className="block text-[11px] text-stone-500">{n.date ? "촬영마다 따로 — 날짜·장소가 들어가요" : "한 번만 쓰는 기본 계약"}</span>
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">모델 이름</span>
          <input value={t.name} onChange={(e) => set("name")(e.target.value)} placeholder="예: 이주현" className={F} autoFocus />
        </label>
        <div className={"grid grid-cols-2 gap-2.5 " + (need.date ? "sm:grid-cols-4" : "")}>
          {need.date && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-500">촬영일</span>
                <input type="date" value={t.date} onChange={(e) => set("date")(e.target.value)} className={F} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-500">시작 시각</span>
                <input type="time" value={t.time} onChange={(e) => set("time")(e.target.value)} className={F} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-500">예상 시간</span>
                <input type="number" min="0.5" step="0.5" inputMode="decimal" value={t.hours} onChange={(e) => set("hours")(e.target.value)} className={F} />
              </label>
            </>
          )}
          {need.start && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-stone-500">계약 시작일</span>
              <input type="date" value={t.startOn} onChange={(e) => set("startOn")(e.target.value)} className={F} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">시급(원)</span>
            <input type="number" min="0" step="1000" inputMode="numeric" value={t.wage} onChange={(e) => set("wage")(e.target.value)} className={F} />
          </label>
        </div>
        {need.face && (
        <div>
          <span className="mb-1 block text-xs font-semibold text-stone-500">얼굴 노출</span>
          <div className="inline-flex rounded-full bg-stone-100 p-1">
            <Tab on={t.face === "on"} onClick={() => set("face")("on")}>
              가능
            </Tab>
            <Tab on={t.face === "off"} onClick={() => set("face")("off")}>
              비노출
            </Tab>
          </div>
        </div>
        )}
        {need.uses && (
        <div>
          <span className="mb-1 block text-xs font-semibold text-stone-500">이용 범위</span>
          <div className="flex flex-wrap gap-1.5">
            {USES.map((u) => {
              const on = t.uses.includes(u);
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => set("uses")(on ? t.uses.filter((x) => x !== u) : [...t.uses, u])}
                  className={"flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600")}
                >
                  {on && <Check size={12} />} {u}
                </button>
              );
            })}
          </div>
          <input value={t.usesEtc} onChange={(e) => set("usesEtc")(e.target.value)} placeholder="기타 — 직접 적기 (예: 네이버 스마트스토어)" className={F + " mt-1.5"} />
        </div>
        )}
        {need.place && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">장소</span>
            <input value={t.place} onChange={(e) => set("place")(e.target.value)} className={F} />
          </label>
        )}
        {!need.date && <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">촬영 날짜·장소는 이 계약서에 안 들어가요 — 촬영마다 카톡이나 촬영 시트로 확인해요. 이용 범위·취소 규칙은 본문에 적혀 있어요(아래 &apos;펼치기&apos;로 확인).</p>}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">메모 (모델에겐 안 보여요)</span>
          <input value={t.memo} onChange={(e) => set("memo")(e.target.value)} placeholder="예: 스레드 @soyepie · 테스트 촬영" className={F} />
        </label>
        <div className="rounded-xl border border-stone-200">
          <button type="button" onClick={() => setPeek(!peek)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-stone-700">
            모델에게 보일 계약서 · 이 계약서만 고치기
            <span className="text-xs font-normal text-stone-400">{edited != null ? "고쳤어요 · " : ""}{peek ? "접기" : "펼치기"}</span>
          </button>
          {peek && (
            <TextEditor
              text={text}
              title={tpl.title}
              edited={edited != null}
              stale={edited != null && edited !== filled}
              onChange={setEdited}
              onReset={() => setEdited(null)}
            />
          )}
        </div>
        {err === "missing" ? <MissingSql /> : err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600">
          닫기
        </button>
        <button type="button" disabled={!ok || busy} onClick={make} className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300">
          {busy && <Loader2 size={14} className="animate-spin" />} 계약서 만들기
        </button>
      </footer>
    </Sheet>
  );
}

// 본문 고치기 — 왼쪽(폰은 위) 글 칸, 오른쪽(폰은 아래) 모델에게 보일 모양. '제N조'·'·' 규칙은 문구 틀과 같다.
function TextEditor({ text, title, edited, onChange, onReset }) {
  return (
    <div className="space-y-2 border-t border-stone-100 p-3">
      <p className="text-xs leading-relaxed text-stone-500">
        여기서 고치면 <b>이 계약서에만</b> 들어가요(문구 틀은 그대로). &apos;제N조&apos; 로 시작하는 줄은 제목, &apos;·&apos; 로 시작하면 점.
        {edited && " 고친 뒤에 위 칸(날짜·시급 등)을 바꾸면 본문엔 안 들어가요 — '틀대로 다시 채우기'를 누르세요."}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <textarea value={text} onChange={(e) => onChange(e.target.value)} rows={18} className={F + " text-[13px] leading-relaxed"} aria-label="계약서 본문" />
        <div className="max-h-[28rem] overflow-y-auto rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <ContractText terms={{ title, text }} />
        </div>
      </div>
      {edited && (
        <button type="button" onClick={onReset} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500 hover:text-rose-700">
          틀대로 다시 채우기
        </button>
      )}
    </div>
  );
}

// 서명 전 계약서 고치기 — 본문만(링크는 그대로라 모델이 다시 열면 고친 내용이 보인다)
function EditBox({ c, online, onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(c.terms?.text || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800">
        <Pencil size={12} /> 이 계약서 내용 고치기
      </button>
    );
  return (
    <div className="rounded-xl border border-rose-200">
      <TextEditor text={text} title={c.terms?.title} edited={false} onChange={setText} onReset={() => {}} />
      <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-3 py-2">
        {msg && <span className="mr-auto text-xs text-rose-700">{msg}</span>}
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs text-stone-600">
          그만두기
        </button>
        <button
          type="button"
          disabled={busy || !text.trim() || text === c.terms?.text}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              const r = await updateContract(online, c.id, { ...c.terms, text, editedAt: new Date().toISOString() });
              onSaved(r);
              setOpen(false);
            } catch (e) {
              setMsg(e.message || String(e));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-stone-300"
        >
          저장
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 만든 뒤 · 보기

function LinkBox({ c }) {
  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="text-xs font-semibold text-stone-500">모델에게 보낼 링크</div>
      <div className="truncate rounded-lg bg-white px-2.5 py-2 font-mono text-xs text-stone-700 ring-1 ring-stone-200">{signLink(c.token)}</div>
      <div className="flex flex-wrap gap-1.5">
        <CopyBtn text={dmText(c.terms, c.token)} primary>
          DM 문구 복사
        </CopyBtn>
        <CopyBtn text={signLink(c.token)}>링크만 복사</CopyBtn>
        <a href={signLink(c.token)} target="_blank" rel="noreferrer" className="flex items-center rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300">
          모델 화면 열어 보기
        </a>
      </div>
      <div className="rounded-lg bg-white p-2.5 text-xs leading-relaxed break-all whitespace-pre-wrap text-stone-600 ring-1 ring-stone-200" data-dm>
        {dmText(c.terms, c.token)}
      </div>
    </div>
  );
}

// 주민등록번호 — 평소엔 가린 번호, '신고용 보기'를 누르면 1분 동안만 전체(누를 때마다 서버에 누가·언제 남음)
// compact = 파트타이머 관리에서 — 보기 전 설명 줄을 뺀다
const SHOW_SEC = 60;
export function RrnBox({ c, online, compact }) {
  const [shown, setShown] = useState(null); // {rrn, log}
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => (left <= 1 ? setShown(null) : setLeft(left - 1)), 1000);
    return () => clearTimeout(t);
  }, [shown, left]);
  if (!c.signed_at) return null;
  if (!c.hasRrn)
    return <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">주민등록번호 없이 서명한 계약서예요 — 원천징수 신고 전에 따로 받아야 해요.</p>;
  const reveal = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await revealRrn(online, c.id);
      if (!r?.rrn) return setErr("저장된 번호를 못 읽었어요");
      setShown(r);
      setLeft(SHOW_SEC);
    } catch (e) {
      setErr(e instanceof ContractError ? e.message : "못 읽었어요: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1 text-sm font-semibold text-stone-800">
          <Lock size={14} className="text-stone-400" /> 주민등록번호
        </span>
        <span className="font-mono text-sm tracking-wider text-stone-900 tabular-nums" data-rrn>
          {shown ? shown.rrn : c.signed?.rrnMask || "******-*******"}
        </span>
        <span className="ml-auto flex gap-1.5">
          {shown ? (
            <>
              <CopyBtn text={shown.rrn}>번호 복사</CopyBtn>
              <button type="button" onClick={() => setShown(null)} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-stone-300">
                <EyeOff size={12} /> 가리기
              </button>
            </>
          ) : (
            <button type="button" onClick={reveal} disabled={busy} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-800 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} 신고용 보기
            </button>
          )}
        </span>
      </div>
      {(shown || !compact) && (
      <p className="mt-1.5 text-[11px] leading-relaxed text-stone-400">
        {shown
          ? `${left}초 뒤 다시 가려져요 · 원천징수 신고에만 써 주세요. 본 기록: ${(shown.log || []).map((x) => `${whoOf(x.who)} ${signedAtText(x.at).replace(/^\d{4}년 /, "")}`).join(" · ")}`
          : "암호화해 저장돼 있어요. '신고용 보기'를 누르면 1분 동안 전체가 보이고, 누가 언제 봤는지 남아요."}
      </p>
      )}
      {err && <p className="mt-1 text-xs text-rose-700">{err}</p>}
    </section>
  );
}

function ViewSheet({ c, online, onClose, onRemove, onSaved }) {
  const t = c.terms || {};
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead
        title={`${t.name || "이름 없음"} · ${c.signed_at ? "서명 완료" : "서명 전"}`}
        onClose={onClose}
        right={
          <button type="button" onClick={() => printContract({ terms: t, signed: c.signed, signedAt: c.signed_at })} className="flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700">
            <Printer size={13} /> 인쇄
          </button>
        }
      />
      <div className="space-y-4 overflow-y-auto p-4">
        {!c.signed_at && <LinkBox c={c} />}
        {!c.signed_at && <EditBox key={c.id + (t.editedAt || "")} c={c} online={online} onSaved={onSaved} />}
        {t.memo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">메모: {t.memo}</p>}
        <RrnBox key={"rrn" + c.id} c={c} online={online} />
        <ContractText terms={t} />
        <SignedBlock signed={c.signed} signedAt={c.signed_at} />
        <div className="flex justify-end">
          <button type="button" onClick={() => onRemove(c)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-stone-400 hover:text-rose-700">
            <Trash2 size={13} /> 이 계약서 지우기
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------ 문구 틀

// 계약서 종류마다 이름·제목·본문. 종류 더하기(지금 고르고 있는 것을 베껴 시작)·지우기·순서는 앞에 더한 순서 그대로. 저장은 전부 한 번에.
function TemplateSheet({ tpls, onClose, onSave }) {
  const [items, setItems] = useState(tpls);
  const [cur, setCur] = useState(tpls[0]?.id);
  const [busy, setBusy] = useState(false);
  const x = items.find((i) => i.id === cur) || items[0];
  const put = (patch) => setItems((l) => l.map((i) => (i.id === x.id ? { ...i, ...patch } : i)));
  const add = () => {
    const name = window.prompt("새 계약서 종류 이름 (예: 릴스 촬영 계약서)\n지금 보고 있는 '" + x.name + "' 내용을 베껴서 시작해요.");
    if (!name?.trim()) return;
    const id = "k" + Date.now().toString(36);
    setItems((l) => [...l, { ...x, id, name: name.trim() }]);
    setCur(id);
  };
  const drop = () => {
    if (items.length < 2) return;
    if (!window.confirm(`'${x.name}' 종류를 지울까요? 이미 만든 계약서는 그대로예요.`)) return;
    const rest = items.filter((i) => i.id !== x.id);
    setItems(rest);
    setCur(rest[0].id);
  };
  const bad = items.some((i) => !i.name.trim() || !i.title.trim() || !i.body.trim());
  const need = needsOf(x.body);
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="계약서 문구 틀" onClose={onClose} />
      <div className="space-y-3 overflow-y-auto p-4">
        <p className="text-xs text-stone-400">계약서 종류마다 따로 고쳐요. 고친 틀은 새로 만드는 계약서부터 들어가요(이미 보낸 계약서는 그대로).</p>
        <div className="flex flex-wrap items-center gap-1.5" data-tpl-tabs>
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setCur(i.id)}
              className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (i.id === x.id ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300")}
            >
              {i.name || "이름 없음"}
            </button>
          ))}
          <button type="button" onClick={add} className="flex items-center gap-0.5 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-500 hover:border-rose-300 hover:text-rose-700">
            <Plus size={12} /> 종류 더하기
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">종류 이름 (만들기 창에서 고르는 이름)</span>
            <input value={x.name} onChange={(e) => put({ name: e.target.value })} className={F} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">계약서 제목 (모델에게 보이는 제목)</span>
            <input value={x.title} onChange={(e) => put({ title: e.target.value })} className={F} />
          </label>
        </div>
        {need.place && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">기본 장소</span>
            <input value={x.place} onChange={(e) => put({ place: e.target.value })} className={F} />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">본문 — '제N조' 로 시작하는 줄은 제목, '·' 로 시작하면 점</span>
          <textarea value={x.body} onChange={(e) => put({ body: e.target.value })} rows={22} className={F + " font-mono text-[13px] leading-relaxed"} />
        </label>
        <p className="text-xs leading-relaxed text-stone-500">
          채워지는 자리: {HOLES.join(" ")} — {"{얼굴}"}은 노출이면 &apos;{faceText("on")}&apos;, 비노출이면 &apos;{faceText("off")}&apos;. 본문에 {"{촬영일}"}이 있으면 만들기 창에 촬영일·시각·시간 칸이, {"{계약일}"}이 있으면 계약 시작일 칸이 나와요.
        </p>
      </div>
      <footer className="flex shrink-0 justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <span className="flex gap-1">
          {STOCK[x.id] && (
            <button type="button" onClick={() => put({ title: STOCK[x.id].title, place: STOCK[x.id].place, body: STOCK[x.id].body })} className="rounded-lg px-3 py-2 text-xs text-stone-500 hover:text-stone-800">
              처음 초안으로
            </button>
          )}
          {items.length > 1 && (
            <button type="button" onClick={drop} className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-stone-400 hover:text-rose-700">
              <Trash2 size={12} /> 이 종류 지우기
            </button>
          )}
        </span>
        <span className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600">
            닫기
          </button>
          <button
            type="button"
            disabled={busy || bad}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(items);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            저장
          </button>
        </span>
      </footer>
    </Sheet>
  );
}

function MissingSql({ rrn }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">
        {rrn ? "주민등록번호 칸(암호화 저장)을 쓰려면 SQL 을 한 번 더 실행해 주세요 — 그 전엔 새 계약서를 만들 수 없어요" : "계약서를 담을 표가 아직 없어요 — SQL 을 한 번 실행해 주세요"}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
        <li>
          <a href={SQL_URL} target="_blank" rel="noreferrer" className="font-semibold text-rose-800 underline">
            Supabase SQL Editor
          </a>{" "}
          를 열어요(포클로 프로젝트).
        </li>
        <li>
          poclo-ledger 폴더의 <b>supabase/contracts.sql</b> 내용을 전부 복사해 붙여넣어요.
        </li>
        <li>오른쪽 아래 <b>Run</b> 을 눌러요 → 'Success' 가 나오면 이 화면을 새로고침해요.</li>
      </ol>
    </div>
  );
}

// ------------------------------------------------------------ 화면

export default function ContractPage({ online, onPage }) {
  const [list, setList] = useState(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("wait");
  const [tpls, setTpls] = useState(() => templateList(null, null));
  const [biz, setBiz] = useState({});
  const [making, setMaking] = useState(false);
  const [view, setView] = useState(null);
  const [editTpl, setEditTpl] = useState(false);
  const [rrnOk, setRrnOk] = useState(true);

  const load = async () => {
    try {
      setList(await listContracts(online));
      setMissing(false);
    } catch (e) {
      if (e instanceof ContractError && e.code === "missing") setMissing(true);
      else setErr(e.message || String(e));
      setList([]);
    }
  };
  useEffect(() => {
    load();
    rrnReady(online).then(setRrnOk);
    // 계약서 종류 — 새 키(contract_templates)가 없으면 예전 촬영 틀(contract_template) + 정식 모델 계약서
    Promise.all([loadKey(TEMPLATES_KEY, online, null).catch(() => null), loadKey(TEMPLATE_KEY, online, null).catch(() => null)])
      .then(([many, old]) => setTpls(templateList(many, old)))
      .catch(() => {});
    loadKey("biz_info", online, {})
      .then((v) => setBiz(v || {}))
      .catch(() => {});
    // 모델이 서명하면 — 탭을 다시 볼 때, 그리고 화면이 떠 있는 동안 30초마다 새로 읽는다
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(vis, 30000);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const wait = useMemo(() => (list || []).filter((c) => !c.signed_at), [list]);
  const done = useMemo(() => (list || []).filter((c) => c.signed_at).sort((a, b) => (b.signed_at || "").localeCompare(a.signed_at || "")), [list]);
  const shown = tab === "wait" ? wait : done;

  const remove = async (c) => {
    if (!window.confirm(`${c.terms?.name || "이"} 계약서를 지울까요?${c.signed_at ? " 서명한 계약서예요 — 지우면 되돌릴 수 없어요." : " 보낸 링크도 더는 안 열려요."}`)) return;
    await removeContract(online, c.id);
    setView(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-xl font-bold text-stone-900">
            <FileSignature size={20} /> 모델 계약서
          </h2>
          <p className="mt-0.5 text-sm text-stone-500">계약서를 만들어 링크를 DM 으로 보내면, 모델이 폰에서 읽고 서명해요. 주민등록번호(3.3% 신고용)는 암호화해 저장하고 &apos;신고용 보기&apos;에서만 전체가 보여요.</p>
          {onPage && (
            <button type="button" onClick={() => onPage("parttime")} className="mt-1 text-xs font-semibold text-rose-700 hover:text-rose-900">
              서명한 사람은 파트타이머 관리에 저절로 들어가요 — 근무 시간 · 시급 · 3.3% 지급은 거기서 ›
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditTpl(true)} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300">
            <Pencil size={14} /> 문구 틀
          </button>
          <button type="button" onClick={() => setMaking(true)} disabled={missing || !rrnOk} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
            <Plus size={15} /> 계약서 만들기
          </button>
        </div>
      </div>

      {!isRemote || !online ? <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">이 기기에만 저장하는 모드예요 — 시험용. 모델 링크는 이 브라우저에서만 열려요.</p> : null}
      {missing ? <MissingSql /> : !rrnOk && <MissingSql rrn />}
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-full bg-stone-100 p-1">
          <Tab on={tab === "wait"} onClick={() => setTab("wait")}>
            서명 전 {wait.length}
          </Tab>
          <Tab on={tab === "done"} onClick={() => setTab("done")}>
            서명 완료 {done.length}
          </Tab>
        </div>
        <button type="button" onClick={load} title="모델이 서명했는지 새로 읽기" className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800">
          <RefreshCw size={12} /> 새로 읽기
        </button>
      </div>

      {list === null ? (
        <div className="flex h-40 items-center justify-center text-stone-300">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : !shown.length ? (
        <Empty title={tab === "wait" ? "서명 기다리는 계약서가 없어요" : "아직 서명한 계약서가 없어요"} hint={tab === "wait" ? "'계약서 만들기'로 모델 이름·촬영일·시급을 넣으면 보낼 링크가 생겨요." : "모델이 서명하면 여기로 와요. 화면을 다시 보면 새로 읽어요."} />
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => {
            const t = c.terms || {};
            return (
              <li key={c.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => setView(c)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-900">{t.name || "이름 없음"}</span>
                      {c.signed_at ? (
                        <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                          <Check size={11} /> 서명 완료 · {signedAtText(c.signed_at).replace(/^\d{4}년 /, "")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">서명 전</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      <span className="mr-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-600">{kindName(t)}</span>
                      {t.date ? `${dateText(t.date)} ${t.time || ""}` : t.startOn ? `${dateText(t.startOn)}부터` : ""} · {wonText(t.wage)}/시간 · 얼굴 {t.face === "off" ? "비노출" : "노출 가능"}
                    </div>
                    <div className="truncate text-[11px] text-stone-400">
                      {c.signed?.rrnMask ? `주민 ${c.signed.rrnMask} · ` : ""}
                      {usesText(t)}
                      {t.memo ? ` · ${t.memo}` : ""}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {!c.signed_at && (
                      <>
                        <CopyBtn text={dmText(t, c.token)} primary>
                          DM 문구 복사
                        </CopyBtn>
                        <CopyBtn text={signLink(c.token)}>링크</CopyBtn>
                      </>
                    )}
                    <button type="button" onClick={() => setView(c)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300">
                      {c.signed_at ? "계약서 보기" : "보기"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {making && (
        <NewSheet
          online={online}
          tpls={tpls}
          biz={biz}
          onClose={() => setMaking(false)}
          onMade={(c) => {
            setMaking(false);
            setTab("wait");
            setList((l) => [c, ...(l || [])]);
            setView(c);
          }}
        />
      )}
      {view && (
        <ViewSheet
          c={view}
          online={online}
          onClose={() => setView(null)}
          onRemove={remove}
          onSaved={(r) => {
            setView(r);
            setList((l) => (l || []).map((x) => (x.id === r.id ? r : x)));
          }}
        />
      )}
      {editTpl && (
        <TemplateSheet
          tpls={tpls}
          onClose={() => setEditTpl(false)}
          onSave={async (items) => {
            const v = await changeKey(TEMPLATES_KEY, online, () => ({ items: items.map(({ id, name, title, place, body }) => ({ id, name: name.trim(), title: title.trim(), place: place || "", body })), at: new Date().toISOString() }), {});
            setTpls(templateList(v, null));
          }}
        />
      )}
    </div>
  );
}
