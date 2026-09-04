import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

/**
 * 사장님과 지원님이 같은 장부를 보려면 누구인지 확인이 필요하다.
 * 계정은 Supabase에서 미리 만들어 두므로 여기서는 로그인만 한다.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message?.includes("Invalid login")
          ? "이메일이나 비밀번호가 맞지 않아요."
          : "로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
    }
  };

  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-3 outline-none focus:border-rose-600";

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-stone-900">포클로 매입 장부</h1>
          <p className="mt-1 text-sm text-stone-500">로그인하면 같은 장부를 함께 봐요.</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
          <label className="block text-sm">
            <span className="mb-1 block text-stone-500">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className={field}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-stone-500">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={field}
            />
          </label>

          {error && <p className="text-sm text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 py-3.5 font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
          >
            {busy && <Loader2 size={17} className="animate-spin" />}
            로그인
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-stone-400">
          계정이 없으면 사장님께 만들어 달라고 하세요.
        </p>
      </form>
    </div>
  );
}
