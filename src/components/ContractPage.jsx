import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileSignature, Loader2, Pencil, Plus, Printer, RefreshCw, Trash2 } from "lucide-react";
import {
  DEFAULT_TEMPLATE,
  HOLES,
  PLACE,
  TEMPLATE_KEY,
  USES,
  ContractError,
  createContract,
  dateText,
  dmText,
  faceText,
  fillText,
  listContracts,
  removeContract,
  signLink,
  usesText,
  wonText,
} from "../lib/contract";
import { changeKey, loadKey } from "../lib/shoot";
import { isRemote } from "../lib/supabase";
import { ContractText, SignedBlock, printContract, signedAtText } from "./ContractDoc";
import { Sheet, SheetHead } from "./ShootBits";
import { Empty } from "./ui";

// 촬영 › 모델 계약서 (10/25) — 계약 만들기 → 링크·DM 문구 복사 → 모델이 폰에서 서명 → '서명 완료'. 설명은 lib/contract.js 머리말.

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

function NewSheet({ online, tpl, biz, onClose, onMade }) {
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
    memo: "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [peek, setPeek] = useState(false);
  const set = (k) => (v) => setT((x) => ({ ...x, [k]: v }));
  const full = { ...t, title: tpl.title, bizName: biz.name || "포클로 POCLO", ceo: biz.ceo || "최지원" };
  const text = fillText(tpl.body, full);
  const ok = t.name.trim() && t.date && t.time && Number(t.wage) > 0;

  const make = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await createContract(online, { ...full, name: t.name.trim(), hours: Number(t.hours) || 0, wage: Number(t.wage) || 0, text, madeAt: new Date().toISOString() });
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">모델 이름</span>
          <input value={t.name} onChange={(e) => set("name")(e.target.value)} placeholder="예: 이주현" className={F} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-500">시급(원)</span>
            <input type="number" min="0" step="1000" inputMode="numeric" value={t.wage} onChange={(e) => set("wage")(e.target.value)} className={F} />
          </label>
        </div>
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">장소</span>
          <input value={t.place} onChange={(e) => set("place")(e.target.value)} className={F} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">메모 (모델에겐 안 보여요)</span>
          <input value={t.memo} onChange={(e) => set("memo")(e.target.value)} placeholder="예: 스레드 @soyepie · 테스트 촬영" className={F} />
        </label>
        <div className="rounded-xl border border-stone-200">
          <button type="button" onClick={() => setPeek(!peek)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-stone-700">
            모델에게 보일 계약서 미리 보기 <span className="text-xs font-normal text-stone-400">{peek ? "접기" : "펼치기"}</span>
          </button>
          {peek && (
            <div className="border-t border-stone-100 p-4">
              <ContractText terms={{ title: tpl.title, text }} />
            </div>
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

// ------------------------------------------------------------ 만든 뒤 · 보기

function LinkBox({ c }) {
  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="text-xs font-semibold text-stone-500">모델에게 보낼 링크</div>
      <div className="truncate rounded-lg bg-white px-2.5 py-2 font-mono text-xs text-stone-700 ring-1 ring-stone-200">{signLink(c.token)}</div>
      <div className="flex flex-wrap gap-1.5">
        <CopyBtn text={dmText(c.terms?.name, c.token)} primary>
          DM 문구 복사
        </CopyBtn>
        <CopyBtn text={signLink(c.token)}>링크만 복사</CopyBtn>
        <a href={signLink(c.token)} target="_blank" rel="noreferrer" className="flex items-center rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-rose-300">
          모델 화면 열어 보기
        </a>
      </div>
      <div className="rounded-lg bg-white p-2.5 text-xs leading-relaxed break-all whitespace-pre-wrap text-stone-600 ring-1 ring-stone-200" data-dm>
        {dmText(c.terms?.name, c.token)}
      </div>
    </div>
  );
}

function ViewSheet({ c, onClose, onRemove }) {
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
        {t.memo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">메모: {t.memo}</p>}
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

function TemplateSheet({ tpl, onClose, onSave }) {
  const [x, setX] = useState(tpl);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="계약서 문구 틀" onClose={onClose} />
      <div className="space-y-3 overflow-y-auto p-4">
        <p className="text-xs text-stone-400">초안 — 세원이 고칠 수 있어요. 고친 틀은 새로 만드는 계약서부터 들어가요(이미 보낸 계약서는 그대로).</p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">제목</span>
          <input value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} className={F} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">기본 장소</span>
          <input value={x.place} onChange={(e) => setX({ ...x, place: e.target.value })} className={F} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-500">본문 — '제N조' 로 시작하는 줄은 제목, '·' 로 시작하면 점</span>
          <textarea value={x.body} onChange={(e) => setX({ ...x, body: e.target.value })} rows={22} className={F + " font-mono text-[13px] leading-relaxed"} />
        </label>
        <p className="text-xs leading-relaxed text-stone-500">
          채워지는 자리: {HOLES.join(" ")} — {"{얼굴}"}은 노출이면 '{faceText("on")}', 비노출이면 '{faceText("off")}'
        </p>
      </div>
      <footer className="flex shrink-0 justify-between gap-2 border-t border-stone-200 px-4 py-3">
        <button type="button" onClick={() => setX(DEFAULT_TEMPLATE)} className="rounded-lg px-3 py-2 text-xs text-stone-500 hover:text-stone-800">
          처음 초안으로
        </button>
        <span className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-stone-600">
            닫기
          </button>
          <button
            type="button"
            disabled={busy || !x.title.trim() || !x.body.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(x);
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

function MissingSql() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">계약서를 담을 표가 아직 없어요 — SQL 을 한 번 실행해 주세요</p>
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

export default function ContractPage({ online }) {
  const [list, setList] = useState(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("wait");
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE);
  const [biz, setBiz] = useState({});
  const [making, setMaking] = useState(false);
  const [view, setView] = useState(null);
  const [editTpl, setEditTpl] = useState(false);

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
    loadKey(TEMPLATE_KEY, online, null)
      .then((v) => v?.body && setTpl({ ...DEFAULT_TEMPLATE, ...v }))
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
          <p className="mt-0.5 text-sm text-stone-500">계약서를 만들어 링크를 DM 으로 보내면, 모델이 폰에서 읽고 서명해요. 주민등록번호는 받지 않아요.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditTpl(true)} className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-stone-300">
            <Pencil size={14} /> 문구 틀
          </button>
          <button type="button" onClick={() => setMaking(true)} disabled={missing} className="flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300">
            <Plus size={15} /> 계약서 만들기
          </button>
        </div>
      </div>

      {!isRemote || !online ? <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-500">이 기기에만 저장하는 모드예요 — 시험용. 모델 링크는 이 브라우저에서만 열려요.</p> : null}
      {missing && <MissingSql />}
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
                      {dateText(t.date)} {t.time} · {wonText(t.wage)}/시간 · 얼굴 {t.face === "off" ? "비노출" : "노출 가능"}
                    </div>
                    <div className="truncate text-[11px] text-stone-400">
                      {usesText(t)}
                      {t.memo ? ` · ${t.memo}` : ""}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {!c.signed_at && (
                      <>
                        <CopyBtn text={dmText(t.name, c.token)} primary>
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
          tpl={tpl}
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
      {view && <ViewSheet c={view} onClose={() => setView(null)} onRemove={remove} />}
      {editTpl && (
        <TemplateSheet
          tpl={tpl}
          onClose={() => setEditTpl(false)}
          onSave={async (x) => {
            const v = await changeKey(TEMPLATE_KEY, online, () => ({ ...x, at: new Date().toISOString() }), {});
            setTpl({ ...DEFAULT_TEMPLATE, ...v });
          }}
        />
      )}
    </div>
  );
}
