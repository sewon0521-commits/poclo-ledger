import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCw, Search, Trash2, X, ChevronDown, AlertTriangle } from "lucide-react";
import { useLookFinds, startFind, retryFind, removeFind, stateOf, cardOf, hotOf, whenText, remoteOn, HOT, MAX_PHOTOS } from "../lib/lookFind";
import { clipImages, filesOf } from "../lib/pasteImages";
import { countText } from "../lib/sourcing";
import { ReelCard, useSigned, useReelPlan, putReel, sameFrom } from "./SourcingFeed";
import { Viewer } from "./ShootBits";
import { Empty } from "./ui";

/**
 * 촬영 › 소싱 관리 › 코디로 찾기 (2026-10-26) — 코디 사진을 넣으면 비슷한 '괜찮은 릴스'.
 * 찾는 건 사무실 PC(poclo-cafe24/look_find.py), 데이터·규칙은 lib/lookFind.js 머리말.
 * 결과 카드는 뜨는 릴스와 같은 카드(ReelCard) — '왜 닮았는지' 한 줄 + 소싱에 담기 · 릴스 기획.
 */

const CRITERIA = ["최근 60일", "조회 1만↑", "경품 이벤트 뺌", "닮은 정도 × 댓글÷조회", "3%↑ 맨 위"];

export function LookFindTab({ d, online, onPut, reelKit }) {
  const lf = useLookFinds(online);
  const [picked, setPicked] = useState([]); // [{file, url}]
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [shut, setShut] = useState(() => new Set()); // 접은 검색(맨 위 것)
  const [open, setOpen] = useState(() => new Set()); // 펼친 지난 검색
  const [big, setBig] = useState(null);
  const fileRef = useRef(null);
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const add = (files) => {
    const imgs = [...files].filter((f) => f.type?.startsWith("image/"));
    if (!imgs.length) return;
    setErr("");
    setPicked((cur) => {
      const room = MAX_PHOTOS - cur.length;
      if (imgs.length > room) setErr(`사진은 ${MAX_PHOTOS}장까지예요 — 앞의 ${Math.max(room, 0)}장만 넣었어요.`);
      return [...cur, ...imgs.slice(0, Math.max(room, 0)).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  };
  const drop = (i) =>
    setPicked((cur) => {
      URL.revokeObjectURL(cur[i].url);
      return cur.filter((_, k) => k !== i);
    });

  // 화면 어디서든 Ctrl+V — 글 칸에서 글만 붙일 땐 그대로
  useEffect(() => {
    const onPaste = (e) => {
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return;
      e.preventDefault();
      filesOf(c).then(add);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const go = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    setErr("");
    try {
      const id = await startFind(
        picked.map((p) => p.file),
        note,
        online,
      );
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPicked([]);
      setNote("");
      setShut((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      lf.reload();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const items = lf.items;
  const sign = useSigned(
    items.flatMap((it, i) => [...(it.photos || []), ...(i === 0 || open.has(it.id) ? (it.results || []).map((x) => x.thumb) : [])]),
    online,
  );
  const { plannedOf, plan } = useReelPlan(reelKit, "소싱 관리 코디로 찾기");
  const doneOf = (x) => d.refs.some((r) => sameFrom(r.from, { type: "reel", code: x.code, url: x.url }));
  const busyN = items.filter((it) => ["queued", "working"].includes(it.job?.status)).length;

  const act = async (fn) => {
    try {
      await fn();
      lf.reload();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          filesOf(clipImages(e.dataTransfer)).then(add);
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="shrink-0 sm:w-56">
            {picked.length ? (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2">
                {picked.map((p, i) => (
                  <div key={p.url} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => drop(i)}
                      aria-label="이 사진 빼기"
                      className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5 text-stone-600 shadow-sm hover:text-stone-900"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {picked.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-xs text-stone-500 hover:border-rose-300 hover:text-rose-800"
                  >
                    <Camera size={16} />
                    사진 더
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 text-center text-sm text-stone-500 hover:border-rose-300 hover:text-rose-800 sm:aspect-[3/4] sm:h-auto"
              >
                <Camera size={22} />
                <span className="font-semibold text-stone-700">코디 사진 넣기</span>
                <span className="text-xs leading-snug text-stone-400">끌어다 놓기 · Ctrl+V · 눌러서 고르기 (3장까지)</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                add(e.target.files || []);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div>
              <h3 className="font-semibold text-stone-900">이 코디와 비슷한 괜찮은 릴스</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                모아 둔 경쟁사·크리에이터 릴스 표지와 코디 사진을 비교해요. 반응 좋은 것만 골라 위 10개를 보여 주고, 하나마다 왜 닮았는지 한 줄씩 적어 드려요.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CRITERIA.map((c) => (
                <span key={c} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
                  {c}
                </span>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="메모 (선택) — 예: 하의 실루엣 위주로"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-600"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                onClick={go}
                disabled={!picked.length || busy || !remoteOn(online)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:bg-stone-300"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                {busy ? "맡기는 중…" : "비슷한 릴스 찾기"}
              </button>
              <span className="text-xs text-stone-400">사무실 PC 가 찾아요 · 2~4분 · 추가 비용 없음</span>
            </div>
            {!remoteOn(online) && <p className="text-xs text-amber-700">공유 장부에 로그인한 상태에서만 돼요 — 찾는 건 사무실 PC 가 해요.</p>}
            {remoteOn(online) && !lf.alive && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle size={13} className="shrink-0" /> 사무실 PC 분석기가 꺼져 있어요 — 맡겨 두면 켜질 때 찾아요.
              </p>
            )}
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}
          </div>
        </div>
      </section>

      {!lf.loaded && !items.length ? (
        <div className="flex h-40 items-center justify-center text-stone-300">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : !items.length ? (
        <Empty title="아직 찾은 코디가 없어요" hint="촬영한 코디나 입어 본 사진을 위에 넣으면, 지금 반응 좋은 릴스 중 닮은 것을 찾아 드려요." />
      ) : (
        <div className="space-y-3">
          {busyN > 0 && <p className="text-xs text-stone-500">찾는 중 {busyN}개 — 끝나면 저절로 떠요. 다른 화면에 가 있어도 돼요.</p>}
          {items.map((it, i) => {
            const expanded = i === 0 ? !shut.has(it.id) : open.has(it.id);
            const toggle = () =>
              (i === 0 ? setShut : setOpen)((s) => {
                const n = new Set(s);
                if (n.has(it.id)) n.delete(it.id);
                else n.add(it.id);
                return n;
              });
            return (
              <FindBlock
                key={it.id}
                it={it}
                alive={lf.alive}
                expanded={expanded}
                onToggle={toggle}
                sign={sign}
                onBig={(slides, start) => setBig({ slides, start })}
                onRetry={() => act(() => retryFind(it, online))}
                onRemove={() => window.confirm("이 검색 기록을 지울까요? (코디 사진도 같이)") && act(() => removeFind(it, online))}
                card={(x) => {
                  const c = cardOf(x);
                  const src = sign(x.thumb);
                  return (
                    <ReelCard
                      key={x.code}
                      x={c}
                      src={src}
                      done={doneOf(x)}
                      onPut={() => putReel(c, src, online, onPut, x.why ? `코디로 찾기 · ${x.why}` : "")}
                      planned={plannedOf(c)}
                      onPlan={plan && plan(c)}
                      badge={
                        (c.r ?? 0) >= HOT && (
                          <span title="댓글 ÷ 조회 3% 이상" className="absolute top-1.5 left-1.5 rounded bg-rose-700 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                            3%↑
                          </span>
                        )
                      }
                    />
                  );
                }}
              />
            );
          })}
        </div>
      )}
      {big && <Viewer slides={big.slides} start={big.start} onClose={() => setBig(null)} />}
    </div>
  );
}

function FindBlock({ it, alive, expanded, onToggle, sign, onBig, onRetry, onRemove, card }) {
  const st = stateOf(it, alive);
  const photos = (it.photos || []).map((k) => sign(k));
  const res = it.results || [];
  const hot = hotOf(it);
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-3 p-3">
        <div className="flex shrink-0 gap-1">
          {(it.photos || []).slice(0, 3).map((k, n) => (
            <button
              key={k}
              type="button"
              onClick={() => photos[n] && onBig(photos.filter(Boolean).map((url) => ({ url })), n)}
              aria-label="코디 사진 크게 보기"
              className={"h-16 w-12 overflow-hidden rounded-lg bg-stone-100 " + (n > 0 ? "hidden sm:block" : "")}
            >
              {photos[n] && <img src={photos[n]} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={st.kind === "done" ? onToggle : undefined} className="min-w-0 flex-1 text-left">
          <div className="line-clamp-2 text-sm leading-snug font-semibold text-stone-900">{it.look ||(st.kind === "done" ? "코디 사진" : "코디 사진 — 찾는 중")}</div>
          <div className="mt-0.5 text-xs text-stone-500">
            {whenText(it.createdAt)}
            {it.note && <span className="text-stone-400"> · 메모 {it.note}</span>}
          </div>
          {st.kind === "done" ? (
            <div className="mt-0.5 text-xs text-stone-500 tabular-nums">
              결과 {res.length}개{hot > 0 && <b className="text-rose-700"> · 3%↑ {hot}개</b>}
              {it.eligible != null && <span className="text-stone-400"> · 릴스 {countText(it.eligible)}개 중</span>}
            </div>
          ) : st.kind === "error" ? (
            <div className="mt-0.5 text-xs text-rose-700">{st.text}</div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-600">
              <Loader2 size={12} className="animate-spin text-rose-700" /> {st.text}
            </div>
          )}
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          {(st.kind === "done" || st.kind === "error") && (
            <button type="button" onClick={onRetry} title="같은 사진으로 다시 찾기" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <RotateCw size={15} />
            </button>
          )}
          <button type="button" onClick={onRemove} title="이 검색 지우기" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-rose-700">
            <Trash2 size={15} />
          </button>
          {st.kind === "done" && (
            <button type="button" onClick={onToggle} aria-label={expanded ? "접기" : "펼치기"} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <ChevronDown size={16} className={"transition-transform " + (expanded ? "rotate-180" : "")} />
            </button>
          )}
        </span>
      </div>
      {st.kind === "done" && expanded && (
        <div className="border-t border-stone-100 p-3">
          {res.length ? (
            <div className="space-y-3">
              {hot > 0 && <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{res.filter((x) => (x.ratio ?? 0) >= HOT).map(card)}</div>}
              {res.length > hot && (
                <>
                  {hot > 0 && <div className="border-b border-stone-200 pb-1 text-xs font-semibold text-stone-400">댓글 3% 아래 — 닮은 정도 × 반응 순</div>}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{res.filter((x) => (x.ratio ?? 0) < HOT).map(card)}</div>
                </>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-stone-500">닮은 릴스를 못 찾았어요. 옷이 잘 보이는 전신 사진으로 다시 해 보세요.</p>
          )}
          {it.cc && it.cc !== "ok" && <p className="mt-2 text-[11px] text-stone-400">이번엔 '왜 닮았는지'를 못 적었어요 ({it.cc}) — 순서는 그대로예요.</p>}
        </div>
      )}
    </section>
  );
}
