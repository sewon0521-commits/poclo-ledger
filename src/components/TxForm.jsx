import { useState } from "react";
import { X, Check, ChevronDown } from "lucide-react";
import { won, VAT_RATE } from "../lib/calc";

const digits = (s) => String(s).replace(/[^0-9]/g, "");
const comma = (s) => {
  const d = digits(s);
  return d ? Number(d).toLocaleString("ko-KR") : "";
};

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

function Text({ label, value, onChange, ...rest }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-stone-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} {...rest} />
    </label>
  );
}

/**
 * 거래 추가/수정 폼.
 * 결제방식은 장끼로 알 수 없으므로 기본값을 두지 않고 반드시 고르게 한다.
 * 새 seed(장끼 인식/수정 진입)마다 호출부가 key={seed._k}로 다시 마운트시키므로
 * 폼 상태는 초기값만 잡아주면 된다.
 */
export default function TxForm({ seed, vendorList = [], onSubmit, onCancel }) {
  const [date, setDate] = useState(seed.date || "");
  const [vendor, setVendor] = useState(seed.vendor || "");
  const [supply, setSupply] = useState(comma(seed.supply ?? ""));
  const [items, setItems] = useState(seed.items || "");
  const [method, setMethod] = useState(seed.method || null);
  const [invoice, setInvoice] = useState(!!seed.invoice);
  const [memo, setMemo] = useState(seed.memo || "");
  const [address, setAddress] = useState(seed.address || "");
  const [phone, setPhone] = useState(seed.phone || "");
  const [account, setAccount] = useState(seed.account || "");
  const [bizNo, setBizNo] = useState(seed.bizNo || "");
  const [touched, setTouched] = useState(false);

  // 장끼에서 거래처 정보를 읽어왔으면 확인할 수 있게 펼친 채로 연다
  const [openInfo, setOpenInfo] = useState(
    !!(seed.address || seed.phone || seed.account || seed.bizNo),
  );

  const amount = Number(digits(supply) || 0);
  const missing = [];
  if (!vendor.trim()) missing.push("거래처");
  if (!amount) missing.push("금액");
  if (!date) missing.push("날짜");
  if (!method) missing.push("결제방식");

  const submit = () => {
    setTouched(true);
    if (missing.length) return;
    onSubmit({
      date,
      vendor: vendor.trim(),
      supply: amount,
      items: items.trim(),
      method,
      invoice,
      memo: memo.trim(),
      address: address.trim(),
      phone: phone.trim(),
      account: account.trim(),
      bizNo: bizNo.trim(),
    });
  };

  const title = seed.id
    ? "거래 수정"
    : seed.fromReceipt
      ? seed.failed
        ? "장끼를 못 읽었어요 · 직접 채워주세요"
        : "장끼에서 읽었어요 · 확인 후 저장"
      : "거래 추가";

  const infoCount = [address, phone, account, bizNo].filter(Boolean).length;

  return (
    <div className="mb-5 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="font-semibold text-stone-900">{title}</span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="-m-1 p-1 text-stone-400 hover:text-stone-700"
        >
          <X size={20} />
        </button>
      </div>

      {seed.fromReceipt && !seed.failed && (
        <p className="mb-3 rounded-lg bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-600">
          장끼에서 읽은 값이에요. 금액과 거래처를 눈으로 한 번 확인하고 저장하세요.
          {seed.vatSeparate === false && " 부가세 별도 표기가 없어 적힌 금액을 그대로 넣었어요."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">금액 (부가세 별도)</span>
          <input
            value={supply}
            onChange={(e) => setSupply(comma(e.target.value))}
            inputMode="numeric"
            placeholder="14,000"
            className={FIELD + " text-right tabular-nums"}
          />
        </label>
        <label className="col-span-2 text-sm">
          <span className="mb-1 block text-stone-500">거래처 (물건 판 가게)</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            list="poclo-vendors"
            placeholder="예: ONE PICK"
            className={FIELD}
          />
          <datalist id="poclo-vendors">
            {vendorList.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <div className="col-span-2">
          <Text label="상품명" value={items} onChange={setItems} placeholder="예: 절개근왕와이드팬츠/화이트S" />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-stone-200">
        <button
          type="button"
          onClick={() => setOpenInfo(!openInfo)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-stone-600"
        >
          <span>
            거래처 정보
            {infoCount > 0 && <span className="ml-1.5 text-xs text-stone-400">{infoCount}개 채움</span>}
          </span>
          <ChevronDown size={16} className={"transition " + (openInfo ? "rotate-180" : "")} />
        </button>
        {openInfo && (
          <div className="grid gap-3 border-t border-stone-200 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Text label="위치 / 주소" value={address} onChange={setAddress} placeholder="예: 스투디오W 1층 특7호" />
            </div>
            <Text label="전화번호" value={phone} onChange={setPhone} inputMode="tel" placeholder="010-0000-0000" />
            <Text label="사업자번호" value={bizNo} onChange={setBizNo} inputMode="numeric" placeholder="000-00-00000" />
            <div className="sm:col-span-2">
              <Text label="계좌번호" value={account} onChange={setAccount} placeholder="은행 000-0000-0000" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-sm">
        <span className="mb-1.5 block text-stone-500">
          결제방식 <span className="text-rose-600">· 장끼로는 알 수 없어요. 꼭 골라주세요</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("samchon")}
            className={
              "rounded-lg border py-3 font-medium transition " +
              (method === "samchon"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-stone-300 bg-white text-stone-600")
            }
          >
            삼촌 대납 <span className="text-xs opacity-80">부가세 X</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod("transfer")}
            className={
              "rounded-lg border py-3 font-medium transition " +
              (method === "transfer"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-stone-300 bg-white text-stone-600")
            }
          >
            이체 <span className="text-xs opacity-80">부가세 O</span>
          </button>
        </div>
        {amount > 0 && (
          <p className="mt-2 text-xs tabular-nums text-stone-500">
            {method === "transfer"
              ? `실제 지출 ${won(amount + amount * VAT_RATE)} (금액 ${won(amount)} + 부가세 ${won(amount * VAT_RATE)})`
              : method === "samchon"
                ? `실제 지출 ${won(amount)} · 미증빙 부가세 ${won(amount * VAT_RATE)}`
                : `부가세 ${won(amount * VAT_RATE)}`}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setInvoice(!invoice)}
          className={
            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition " +
            (invoice
              ? "border-rose-700 bg-rose-50 text-rose-800"
              : "border-stone-300 bg-white text-stone-600")
          }
        >
          <span
            className={
              "flex h-5 w-5 items-center justify-center rounded border " +
              (invoice ? "border-rose-700 bg-rose-700 text-white" : "border-stone-300 text-transparent")
            }
          >
            <Check size={13} />
          </span>
          세금계산서 받음
        </button>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모"
          className={FIELD + " min-w-0 flex-1 text-sm"}
        />
      </div>

      {touched && missing.length > 0 && (
        <p className="mt-3 text-sm text-rose-700">{missing.join(", ")}을(를) 채워주세요.</p>
      )}

      <button
        type="button"
        onClick={submit}
        className="mt-3 w-full rounded-xl bg-rose-700 py-3.5 font-semibold text-white transition hover:bg-rose-800 active:scale-[0.99]"
      >
        저장
      </button>
    </div>
  );
}
