import { useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { supabase } from "../lib/supabase";

/**
 * 비밀번호 바꾸기 (9/30 — 지원 계정 ppoclo0601 비밀번호를 아무도 몰라서).
 * 로그인한 채로 새 비밀번호를 두 번 넣으면 바뀐다. 메일의 '비밀번호 재설정' 링크로 들어오면 저절로 이 창이 뜬다.
 */
export default function PasswordBox({ email, reason, onClose }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  const save = async () => {
    setMsg("");
    if (a.length < 6) return setMsg("6자 이상으로 적어 주세요.");
    if (a !== b) return setMsg("두 칸이 서로 달라요.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: a });
    setBusy(false);
    if (error) return setMsg(`바꾸지 못했어요 (${error.message}).`);
    setDone(true);
  };

  return (
    <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4">
      <div className="sheet w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h3 className="flex items-center gap-1.5 font-semibold text-stone-900">
            <KeyRound size={16} /> 비밀번호 바꾸기
          </h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-1 p-1 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </header>
        {done ? (
          <div className="space-y-3 p-4 text-sm">
            <p className="text-stone-700">
              <b>{email}</b> 비밀번호를 바꿨어요. 다음부터 새 비밀번호로 로그인하면 돼요.
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-rose-700 py-2.5 font-semibold text-white">
              확인
            </button>
          </div>
        ) : (
          <form
            className="space-y-2.5 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {reason && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{reason}</p>}
            <p className="text-xs text-stone-500">{email}</p>
            <input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} placeholder="새 비밀번호 (6자 이상)" className="w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-rose-600" />
            <input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} placeholder="한 번 더" className="w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-rose-600" />
            {msg && <p className="text-xs text-rose-700">{msg}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 font-semibold text-white disabled:bg-stone-300">
              {busy && <Loader2 size={15} className="animate-spin" />} 바꾸기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
