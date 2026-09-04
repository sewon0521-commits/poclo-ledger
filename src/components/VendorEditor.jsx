import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { makeAccount } from "../lib/store";

const FIELD =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-rose-600";

/** 거래처 직접 등록 / 수정. 계좌는 사업자·일반이 따로 있을 수 있어 행으로 넣는다. */
export default function VendorEditor({ seed, onSubmit, onCancel }) {
  const [name, setName] = useState(seed.name || "");
  const [address, setAddress] = useState(seed.address || "");
  const [phone, setPhone] = useState(seed.phone || "");
  const [bizNo, setBizNo] = useState(seed.bizNo || "");
  const [memo, setMemo] = useState(seed.memo || "");
  const [accounts, setAccounts] = useState(
    seed.accounts?.length ? seed.accounts.map(makeAccount) : [makeAccount()],
  );
  const [touched, setTouched] = useState(false);

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    onSubmit({
      id: seed.id,
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      bizNo: bizNo.trim(),
      memo: memo.trim(),
      accounts: accounts.filter((a) => a.number.trim()),
    });
  };

  const patch = (id, key, value) =>
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, [key]: value } : a)));

  return (
    <div className="mb-5 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="font-semibold text-stone-900">
          {seed.id ? "거래처 수정" : "거래처 추가"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="-m-1 p-1 text-stone-400 hover:text-stone-700"
        >
          <X size={20} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">거래처명</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 몽구스" className={FIELD} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-stone-500">위치 / 주소</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 디오트 지하1층 J13"
            className={FIELD}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">전화번호</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={FIELD} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-500">사업자번호</span>
          <input value={bizNo} onChange={(e) => setBizNo(e.target.value)} inputMode="numeric" className={FIELD} />
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-stone-500">계좌 (사업자·일반 따로 있으면 각각)</span>
          <button
            type="button"
            onClick={() => setAccounts([...accounts, makeAccount()])}
            className="flex items-center gap-1 text-sm font-medium text-rose-700"
          >
            <Plus size={14} /> 행 추가
          </button>
        </div>
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-1.5">
              <input
                value={a.bank}
                onChange={(e) => patch(a.id, "bank", e.target.value)}
                placeholder="은행"
                className={FIELD + " w-24 text-sm"}
              />
              <input
                value={a.number}
                onChange={(e) => patch(a.id, "number", e.target.value)}
                placeholder="계좌번호"
                inputMode="numeric"
                className={FIELD + " min-w-0 flex-1 text-sm tabular-nums"}
              />
              <input
                value={a.holder}
                onChange={(e) => patch(a.id, "holder", e.target.value)}
                placeholder="예금주"
                className={FIELD + " w-24 text-sm"}
              />
              <button
                type="button"
                onClick={() => setAccounts(accounts.filter((x) => x.id !== a.id))}
                aria-label="계좌 줄 삭제"
                className="shrink-0 p-1.5 text-stone-300 hover:text-rose-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모"
        className={FIELD + " mt-3 text-sm"}
      />

      {touched && !name.trim() && <p className="mt-3 text-sm text-rose-700">거래처명을 채워주세요.</p>}

      <button
        type="button"
        onClick={submit}
        className="mt-3 w-full rounded-xl bg-rose-700 py-3.5 font-semibold text-white transition hover:bg-rose-800"
      >
        저장
      </button>
    </div>
  );
}
