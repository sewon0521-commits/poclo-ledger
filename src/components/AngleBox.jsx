import { useState } from "react";
import { Compass, Loader2, RotateCw } from "lucide-react";

/**
 * 어떻게 맞춰갈까요? — 레퍼 핵심 · 맞춰갈 방향 고르기
 * (10/9 세원: "소슬 레퍼 후킹은 트렌드에 민감한 사람 + 퍼플코어 무드를 겨냥했는데 나온 대본은 공포 후킹이잖아? 문맥의 제일 중요한 점을
 *  내가 집든 처음 만들 때 집어 주든 — 쇼필공 레퍼런스랩처럼 어떻게 맞춰 갈지 내가 고르는 란")
 *
 * state = { res: {chosen, core{point,target,mood,hook}, angles[…], _cost}, key, pick: "auto" | 0..2 | "custom", custom }
 * key = 방향을 뽑을 때의 상품·레퍼런스 — 지금 것(keyNow)과 다르면 지난 방향은 안 보낸다(stale).
 * 'AI가 알아서'면 만들 때 서버가 레퍼 핵심을 잡아 지킨다(api/reels.js BASE_REMIX).
 */
function Row({ on, onPick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={
        "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left " +
        (on ? "border-rose-400 bg-rose-50/60" : "border-stone-200 bg-white hover:border-stone-300")
      }
    >
      <span className={"mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border " + (on ? "border-rose-600" : "border-stone-300")}>
        {on && <span className="size-2 rounded-full bg-rose-600" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export default function AngleBox({ state, onChange, fetcher, keyNow, disabled }) {
  const st = state || { pick: "auto", custom: "" };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const res = st.res;
  const stale = !!res && st.key !== keyNow;
  const set = (patch) => onChange({ ...st, ...patch });

  const load = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetcher();
    setBusy(false);
    if (!r?.ok) return setMsg(r?.message || "방향을 못 뽑았어요.");
    const { _cost, ...data } = r.data;
    onChange({ ...st, res: { ...data, cost: _cost?.won || null }, key: keyNow, pick: 0 });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
          <Compass size={13} /> 어떻게 맞춰갈까요?
        </span>
        {res && !stale && (
          <button type="button" disabled={busy || disabled} onClick={load} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />} 방향 다시 보기
          </button>
        )}
      </div>

      {res && !stale && res.core && (
        <div className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
          <div className="text-[11px] font-semibold text-stone-500">레퍼런스의 제일 중요한 점</div>
          <p className="mt-0.5 font-medium text-stone-900">{res.core.point}</p>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
            {[
              ["누구", res.core.target],
              ["무드", res.core.mood],
              ["훅", res.core.hook],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className="rounded-md bg-white px-1.5 py-0.5 text-stone-600 ring-1 ring-stone-200">
                  <span className="text-stone-400">{k}</span> {v}
                </span>
              ))}
          </div>
        </div>
      )}

      <div role="radiogroup" className="space-y-1.5">
        {res && !stale
          ? (res.angles || []).map((a, i) => (
              <Row key={i} on={st.pick === i} onPick={() => set({ pick: i })}>
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-900">
                  {a.title}
                  {a.same && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700">레퍼 핵심 그대로</span>}
                </span>
                {a.hook && <span className="mt-0.5 block text-sm text-stone-700">“{a.hook}”</span>}
                <span className="mt-1 block text-[11px] leading-relaxed text-stone-500">
                  {a.keep && <>지킴 · {a.keep}</>}
                  {a.keep && a.change && <br />}
                  {a.change && <>바꿈 · {a.change}</>}
                </span>
                {a.fit && <span className="mt-0.5 block text-[11px] text-stone-400">근거 · {a.fit}</span>}
              </Row>
            ))
          : null}
        <Row on={st.pick === "auto"} onPick={() => set({ pick: "auto" })}>
          <span className="block text-sm font-semibold text-stone-900">AI가 알아서</span>
          <span className="block text-[11px] text-stone-500">만들 때 레퍼의 제일 중요한 점(누구 · 무드 · 훅 방식)을 잡아 지키면서 우리 상품에 이어요</span>
        </Row>
        <Row on={st.pick === "custom"} onPick={() => set({ pick: "custom" })}>
          <span className="block text-sm font-semibold text-stone-900">직접 적기</span>
          <span className="block text-[11px] text-stone-500">겨냥할 사람 · 무드 · 훅을 한 줄로</span>
        </Row>
        {st.pick === "custom" && (
          <input
            value={st.custom || ""}
            autoFocus
            onChange={(e) => set({ custom: e.target.value })}
            placeholder="예: 레퍼처럼 플럼코어 트렌드로 — 우리 퍼플 컬러로 잇기"
            className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500"
          />
        )}
      </div>

      {(!res || stale) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || disabled}
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:border-rose-300 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Compass size={13} />}
            {busy ? "레퍼 핵심 잡는 중… (20~40초)" : "레퍼 핵심 · 방향 3개 먼저 보기 · 약 30~60원"}
          </button>
          {stale && <span className="text-[11px] text-amber-700">상품이나 레퍼런스를 바꿨어요 — 방향을 다시 보세요</span>}
        </div>
      )}
      {res?.cost && !stale && <p className="text-[11px] text-stone-400">방향 뽑기 약 {res.cost}원</p>}
      {msg && <p className="text-xs text-rose-700">{msg}</p>}
    </div>
  );
}
