import { useEffect, useRef, useState } from "react";
import { Check, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { ContractError, PRIVACY, PRIVACY_OLD, getByToken, maskRrn, rrnFrontOf, rrnProblem, signByToken, tokenOfHash } from "../lib/contract";
import { ContractText, SignedBlock, drawContractImage, signedAtText } from "./ContractDoc";
import HangulInput from "./HangulInput";
import SignPad from "./SignPad";

// 모델이 폰으로 여는 서명 화면 — 로그인 없음. main.jsx 가 주소가 #sign=<토큰> 이면 App 대신 이것만 그린다.
// 읽기 → 정보(+주민등록번호 — 원천징수 신고용, 10/25) → 동의 3개 → 손가락 서명 → 제출(contract_sign, 한 번만) → 끝 화면 · 이미지로 저장.
// 주민번호는 화면 상태에만 잠깐 두고 contract_sign 의 p_rrn 으로만 보낸다(signed·사본 이미지엔 가린 번호만). 보낸 뒤 바로 지운다.
// 서버가 아직 준비 전(rrnReady 없음 — SQL 전)이면 예전처럼 주민번호 칸 없이.

const BANKS = ["국민", "신한", "우리", "하나", "농협", "기업", "카카오뱅크", "토스뱅크", "케이뱅크", "새마을금고", "우체국", "SC제일", "부산", "대구", "수협", "신협"];
const F = "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-base outline-none focus:border-rose-600";

const fmtBirth = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};
const fmtPhone = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.length > 7 ? `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};
const okBirth = (v) => /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
const okPhone = (v) => /^01\d-\d{3,4}-\d{4}$/.test(v);

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-700 text-sm font-bold text-white">P</span>
          <span className="font-semibold tracking-tight text-stone-900">포클로 POCLO</span>
          <span className="ml-auto text-xs text-stone-400">계약서</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">{children}</main>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <section className={"rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 " + className}>{children}</section>;
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-sm font-semibold text-stone-800">
        {label}
        {hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Agree({ on, onToggle, children }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-2.5 rounded-xl px-1 py-2 text-left">
      <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 bg-white")}>{on && <Check size={13} strokeWidth={3} />}</span>
      <span className="text-[15px] text-stone-800">{children}</span>
    </button>
  );
}

/** 이미지로 저장 — 그려서 바로 내려받고, 폰에서 안 받아지면 그림을 길게 눌러 저장하게 아래에 띄운다 */
function SaveImage({ terms, signed, signedAt }) {
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = `포클로_계약서_${(signed?.name || terms.name || "").replace(/\s/g, "")}.png`;
  const make = async () => {
    setBusy(true);
    try {
      const u = await drawContractImage({ terms, signed, signedAt });
      setImg(u);
      const a = document.createElement("a");
      a.href = u;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <button type="button" onClick={make} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white py-3 font-semibold text-stone-800 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 계약서 이미지로 저장
      </button>
      {img && (
        <div className="rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200">
          <p className="mb-1.5 text-center text-xs text-stone-500">저장이 안 됐으면 아래 그림을 길게 눌러 저장해 주세요</p>
          <img src={img} alt="서명한 계약서" data-contract-image className="w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

export default function SignPage() {
  const [token] = useState(() => tokenOfHash(window.location.hash));
  const [state, setState] = useState(token ? "loading" : "notfound");
  const [data, setData] = useState(null);
  const [f, setF] = useState({ name: "", birth: "", phone: "", bank: "", account: "", holder: "" });
  const [rrn, setRrn] = useState({ front: "", back: "" });
  const [showBack, setShowBack] = useState(false);
  const [agree, setAgree] = useState({ terms: false, use: false, privacy: false });
  const [hasSign, setHasSign] = useState(false);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const pad = useRef(null);
  const top = useRef(null);
  const backRef = useRef(null);

  useEffect(() => {
    document.title = "포클로 계약서";
    if (!token) return;
    let off = false;
    getByToken(token)
      .then((d) => {
        if (off) return;
        if (!d) return setState("notfound");
        setData(d);
        setF((x) => ({ ...x, name: d.terms?.name || "", holder: d.terms?.name || "" }));
        setState(d.signed_at ? "signed" : "ready");
      })
      .catch((e) => !off && setState(e instanceof ContractError && e.code === "missing" ? "missing" : "error"));
    return () => {
      off = true;
    };
  }, [token]);

  if (state === "loading")
    return (
      <Shell>
        <div className="flex h-60 items-center justify-center text-stone-300">
          <Loader2 size={22} className="animate-spin" />
        </div>
      </Shell>
    );
  if (state !== "ready" && state !== "signed")
    return (
      <Shell>
        <Card className="py-10 text-center">
          <p className="text-lg font-semibold text-stone-900">
            {state === "notfound" ? "계약서를 찾을 수 없어요" : state === "missing" ? "계약서 준비가 아직 안 됐어요" : "계약서를 불러오지 못했어요"}
          </p>
          <p className="mt-2 text-sm text-stone-500">
            {state === "notfound" ? "받은 링크를 끝까지 복사했는지 확인해 주세요. 그래도 안 되면 포클로 DM 으로 알려 주세요." : "잠시 뒤 다시 열어 주시고, 그래도 안 되면 포클로 DM 으로 알려 주세요."}
          </p>
        </Card>
      </Shell>
    );

  const { terms } = data;

  if (state === "signed")
    return (
      <Shell>
        <Card className="text-center">
          <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check size={26} strokeWidth={3} />
          </span>
          <p className="text-lg font-bold text-stone-900">{sent(data) ? "서명이 끝났어요!" : "이미 서명했어요"}</p>
          <p className="mt-1 text-sm text-stone-500">{signedAtText(data.signed_at)} 서명 · 포클로에도 같은 계약서가 저장됐어요</p>
          <div className="mt-4 text-left">
            <SaveImage terms={terms} signed={data.signed} signedAt={data.signed_at} />
          </div>
        </Card>
        <Card>
          <ContractText terms={terms} />
          <SignedBlock signed={data.signed} signedAt={data.signed_at} />
        </Card>
      </Shell>
    );

  const set = (k) => (v) => {
    setErr("");
    setF((x) => ({ ...x, [k]: v }));
  };
  // 생년월일을 다 적으면 주민번호 앞자리가 비어 있을 때만 채워 준다
  const setBirth = (v) => {
    set("birth")(v);
    const front = rrnFrontOf(v);
    if (front) setRrn((x) => (x.front ? x : { ...x, front }));
  };
  const setFront = (v) => {
    setErr("");
    const d = v.replace(/\D/g, "").slice(0, 6);
    setRrn((x) => ({ ...x, front: d }));
    if (d.length === 6 && rrn.front.length < 6) backRef.current?.focus();
  };
  const flip = (next) => {
    setErr("");
    setAgree(next);
  };
  const needRrn = !!data.rrnReady;
  const rrnD = rrn.front + rrn.back;
  const rrnErr = needRrn ? rrnProblem(rrnD, okBirth(f.birth) ? f.birth : "") : "";
  const allAgree = agree.terms && agree.use && agree.privacy;
  const missing = [
    !f.name.trim() && "이름",
    !okBirth(f.birth) && "생년월일",
    needRrn && rrnD.length < 13 && "주민등록번호",
    !okPhone(f.phone) && "연락처",
    !f.bank.trim() && "은행",
    f.account.replace(/\D/g, "").length < 8 && "계좌번호",
    !f.holder.trim() && "예금주",
  ].filter(Boolean);
  const ready = !missing.length && !rrnErr && allAgree && hasSign;

  const submit = async () => {
    setErr("");
    if (!ready) {
      setErr(missing.length ? `${missing.join(" · ")}을(를) 확인해 주세요` : rrnErr ? rrnErr : !allAgree ? "동의 세 가지를 모두 체크해 주세요" : "서명 칸에 서명해 주세요");
      return;
    }
    const sign = pad.current?.toPng();
    if (!sign) return setErr("서명 칸에 서명해 주세요");
    setSending(true);
    const signed = {
      name: f.name.trim(),
      birth: f.birth,
      phone: f.phone,
      bank: f.bank.trim(),
      account: f.account.trim(),
      holder: f.holder.trim(),
      agree: { terms: true, use: true, privacy: true },
      sign,
      ua: navigator.userAgent.slice(0, 160),
    };
    try {
      const r = await signByToken(token, signed, needRrn ? rrnD : null);
      const rrnMask = needRrn ? r?.rrnMask || maskRrn(rrnD) : undefined;
      setRrn({ front: "", back: "" });
      setData({ ...data, signed: { ...signed, ...(rrnMask ? { rrnMask } : {}), at: r?.signed_at }, signed_at: r?.signed_at || new Date().toISOString(), _sent: true });
      setState("signed");
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ContractError && e.code === "already") {
        const d = await getByToken(token).catch(() => null);
        if (d) {
          setData(d);
          setState("signed");
          return;
        }
      }
      setErr(e instanceof ContractError ? e.message : "저장하지 못했어요. 인터넷 연결을 확인하고 한 번 더 눌러 주세요.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Shell>
      <div ref={top} />
      <Card>
        <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {terms.name ? `${terms.name}님, ` : ""}포클로와 함께해 주셔서 감사해요 ☺️ 아래 내용을 읽어 보시고 맨 아래에서 서명해 주세요.
        </p>
        <ContractText terms={terms} />
      </Card>

      <Card className="space-y-3.5">
        <h3 className="font-semibold text-stone-900">보수 받을 정보</h3>
        <Field label="이름">
          <input value={f.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" className={F} />
        </Field>
        <Field label="생년월일" hint="예: 2002-05-21">
          <input value={f.birth} onChange={(e) => setBirth(fmtBirth(e.target.value))} inputMode="numeric" placeholder="YYYY-MM-DD" className={F} />
        </Field>
        {needRrn && (
          <div>
            <span className="mb-1 flex items-baseline justify-between text-sm font-semibold text-stone-800">
              주민등록번호
              <span className="text-xs font-normal text-stone-400">원천징수 신고용 · 암호화해 저장</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                value={rrn.front}
                onChange={(e) => setFront(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="앞 6자리"
                aria-label="주민등록번호 앞 6자리"
                className={F + " min-w-0 flex-1 tabular-nums tracking-wider"}
              />
              <span className="text-stone-400">-</span>
              <div className="relative min-w-0 flex-1">
                <input
                  ref={backRef}
                  type={showBack ? "text" : "password"}
                  value={rrn.back}
                  onChange={(e) => {
                    setErr("");
                    setRrn((x) => ({ ...x, back: e.target.value.replace(/\D/g, "").slice(0, 7) }));
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="뒤 7자리"
                  aria-label="주민등록번호 뒤 7자리"
                  className={F + " pr-10 tabular-nums tracking-wider"}
                />
                <button
                  type="button"
                  onClick={() => setShowBack(!showBack)}
                  aria-label={showBack ? "뒷자리 가리기" : "뒷자리 보기"}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 hover:text-stone-700"
                >
                  {showBack ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {rrnD.length === 13 && rrnErr && <p className="mt-1 text-xs font-medium text-rose-700">{rrnErr}</p>}
          </div>
        )}
        <Field label="연락처">
          <input value={f.phone} onChange={(e) => set("phone")(fmtPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" className={F} />
        </Field>
        <Field label="은행">
          <input value={f.bank} onChange={(e) => set("bank")(e.target.value)} list="sign-banks" placeholder="예: 국민" className={F} />
          <datalist id="sign-banks">
            {BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label="계좌번호">
          <input value={f.account} onChange={(e) => set("account")(e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric" placeholder="숫자만 적어도 돼요" className={F} />
        </Field>
        <Field label="예금주">
          <div className="[&>span]:flex [&>span]:w-full [&>span]:gap-1.5">
            <HangulInput value={f.holder} onChange={set("holder")} className={F} />
          </div>
        </Field>
        <p className="text-xs text-stone-500">
          {needRrn
            ? "주민등록번호는 보수의 3.3% 원천징수 신고에만 써요. 암호화해 저장하고, 포클로 담당자만 신고할 때 볼 수 있어요. 신분증 사진은 받지 않아요."
            : "주민등록번호는 여기서 받지 않아요. 보수를 보내 드릴 때 원천징수 신고에 필요한 만큼만 따로 안내드릴게요."}
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold text-stone-900">동의</h3>
        <Agree on={allAgree} onToggle={() => flip(allAgree ? { terms: false, use: false, privacy: false } : { terms: true, use: true, privacy: true })}>
          <b>전부 동의해요</b>
        </Agree>
        <div className="my-1 border-t border-stone-100" />
        <Agree on={agree.terms} onToggle={() => flip({ ...agree, terms: !agree.terms })}>
          위 계약 내용을 읽고 확인했어요 <span className="text-rose-700">(필수)</span>
        </Agree>
        <Agree on={agree.use} onToggle={() => flip({ ...agree, use: !agree.use })}>
          촬영물을 위 범위에서 쓰는 것에 동의해요 <span className="text-rose-700">(필수)</span>
        </Agree>
        <Agree on={agree.privacy} onToggle={() => flip({ ...agree, privacy: !agree.privacy })}>
          개인정보{needRrn ? "(주민등록번호 포함)" : ""} 수집·이용에 동의해요 <span className="text-rose-700">(필수)</span>
        </Agree>
        <dl className="mt-1 ml-8 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
          {(needRrn ? PRIVACY : PRIVACY_OLD).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-stone-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-stone-900">서명</h3>
        <SignPad
          ref={pad}
          onChange={(v) => {
            setErr("");
            setHasSign(v);
          }}
        />
      </Card>

      {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className={"flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold " + (ready ? "bg-rose-700 text-white" : "bg-stone-300 text-white")}
      >
        {sending && <Loader2 size={18} className="animate-spin" />} 서명하고 제출하기
      </button>
      <p className="pb-6 text-center text-xs text-stone-400">제출하면 고칠 수 없어요. 고칠 게 있으면 포클로 DM 으로 알려 주세요.</p>
    </Shell>
  );
}

const sent = (d) => !!d?._sent;
