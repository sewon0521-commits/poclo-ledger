import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Pencil, X } from "lucide-react";
import { FIELD, md, codiName, codiItems, loadKey, changeKey, upsert, putPhoto, wearPart } from "../lib/shoot";
import { normalize } from "../lib/sinsang";
import { newId } from "../lib/id";
import { clipImages, filesOf } from "../lib/pasteImages";
import { Sheet, SheetHead, Photo } from "./ShootBits";
import { BigSlides } from "./ContentBits";
import RefPick from "./RefPick";
import { OPTS_KEY, DEFAULT_OPTS, EMPTY_STYLING } from "../lib/styling";

/**
 * 코디 스타일링 (10/25) — 세원: "이날 코디에 해당 칸이 뜨면 눌러서 이 코디에 헤어는 어떻게 할지, 신발, 악세서리(반지, 목걸이 등)는
 * 어떤 걸 할지 등등 고를 수 있게."
 * 코디에 styling {hair:[..], shoes:[{itemId}|{text}], bag:[…], acc:[..], memo, refIds:[촬영 레퍼런스 id]}.
 * 헤어·악세서리 칩 목록은 settings styling_opts {hair, acc} — 칩 줄 끝 '고치기'에서 더하고 뺀다.
 * 촬영 관리(그날 코디) · 소싱 관리(이날 코디) 둘 다 여기로 연다. 모델에게 가는 촬영 시트에도 이 내용이 들어간다(lib/shootSheet.js).
 */

const chipCls = (on) =>
  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-rose-300");

/** 칩 여러 개 + 직접 적기 (목록에 없는 건 점선 칩) */
function ChipPick({ opts, value, onChange, placeholder, onEditOpts }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setTyped("");
  };
  const extra = value.filter((v) => !opts.includes(v));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((t) => (
        <button key={t} type="button" aria-pressed={value.includes(t)} onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])} className={chipCls(value.includes(t))}>
          {value.includes(t) && <Check size={11} className="mr-0.5 inline" />}
          {t}
        </button>
      ))}
      {extra.map((t) => (
        <button key={t} type="button" onClick={() => onChange(value.filter((x) => x !== t))} title="눌러서 빼기" className="flex items-center gap-1 rounded-full border border-dashed border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
          {t} <X size={11} />
        </button>
      ))}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
        onBlur={add}
        placeholder={placeholder}
        className="w-32 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
      />
      {onEditOpts && (
        <button type="button" onClick={onEditOpts} className="flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-rose-700">
          <Pencil size={11} /> 칩 고치기
        </button>
      )}
    </div>
  );
}

/** 칩 목록 고치기 — 더하기(엔터) · × 빼기 */
function OptsEditor({ title, list, onSave, onClose }) {
  const [xs, setXs] = useState(list);
  const [typed, setTyped] = useState("");
  const add = () => {
    const v = typed.trim();
    if (v && !xs.includes(v)) setXs([...xs, v]);
    setTyped("");
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="mb-2 text-xs font-semibold text-stone-600">{title} 칩 고치기</div>
      <div className="flex flex-wrap gap-1.5">
        {xs.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700">
            {t}
            <button type="button" onClick={() => setXs(xs.filter((x) => x !== t))} aria-label={`${t} 빼기`} className="text-stone-400 hover:text-rose-700">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
          placeholder="+ 새 칩 (엔터)"
          className="w-28 rounded-full border border-dashed border-stone-300 bg-white px-2.5 py-1 text-xs outline-none focus:border-rose-400"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-stone-500">
          그만두기
        </button>
        <button type="button" onClick={() => onSave(xs)} className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white">
          칩 저장
        </button>
      </div>
    </div>
  );
}

/** 신발·가방 — 신상 관리 상품에서 고르기(사진 동그라미) + 직접 적기 */
function WearPick({ d, value, onChange, part, placeholder }) {
  const [typed, setTyped] = useState("");
  const [more, setMore] = useState(false);
  const pool = d.items
    .map(normalize)
    .filter((x) => x.stage !== "trash" && (part === "신발" ? wearPart(x) === "신발" : x.kind === "신발·잡화" ? wearPart(x) !== "신발" : wearPart(x) === "가방"));
  const ids = value.map((s) => s.itemId).filter(Boolean);
  const shown = [...pool.filter((x) => ids.includes(x.id)), ...pool.filter((x) => !ids.includes(x.id))].slice(0, more ? 60 : 12);
  const flip = (id) => onChange(ids.includes(id) ? value.filter((s) => s.itemId !== id) : [...value, { itemId: id }]);
  const add = () => {
    const v = typed.trim();
    if (v && !value.some((s) => s.text === v)) onChange([...value, { text: v }]);
    setTyped("");
  };
  return (
    <div className="space-y-2">
      {pool.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {shown.map((x) => {
            const on = ids.includes(x.id);
            return (
              <button key={x.id} type="button" onClick={() => flip(x.id)} title={x.name} className="w-16 shrink-0 text-left">
                <span className={"relative block aspect-square overflow-hidden rounded-full bg-stone-100 " + (on ? "ring-[3px] ring-rose-600" : "ring-1 ring-stone-200")}>
                  {d.urls[x.photo] || x.photoUrl ? <img src={d.urls[x.photo] || x.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                  {on && (
                    <span className="absolute inset-0 flex items-center justify-center bg-rose-700/35 text-white">
                      <Check size={18} strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[10px] text-stone-600">{x.name}</span>
              </button>
            );
          })}
          {pool.length > 12 && !more && (
            <button type="button" onClick={() => setMore(true)} className="w-16 shrink-0 self-start rounded-full border border-dashed border-stone-300 py-5 text-[10px] text-stone-500">
              더 보기
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {value
          .filter((s) => s.text)
          .map((s) => (
            <button key={s.text} type="button" onClick={() => onChange(value.filter((v) => v !== s))} title="눌러서 빼기" className="flex items-center gap-1 rounded-full border border-dashed border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
              {s.text} <X size={11} />
            </button>
          ))}
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), add())}
          onBlur={add}
          placeholder={placeholder}
          className="w-44 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs outline-none focus:border-rose-400"
        />
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-semibold text-stone-800">{title}</h4>
        {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** 스타일링 고르기 창 */
export default function StylingSheet({ codi, d, online, onClose }) {
  const [st, setSt] = useState(() => ({ ...EMPTY_STYLING, ...(codi.styling || {}) }));
  const [opts, setOpts] = useState(DEFAULT_OPTS);
  const [editOpts, setEditOpts] = useState(""); // "hair" | "acc"
  const [pick, setPick] = useState(false);
  const [big, setBig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState([]);
  useEffect(() => {
    let alive = true;
    loadKey(OPTS_KEY, online, {})
      .then((v) => alive && setOpts({ hair: v.hair?.length ? v.hair : DEFAULT_OPTS.hair, acc: v.acc?.length ? v.acc : DEFAULT_OPTS.acc }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [online]);
  const set = (k) => (v) => setSt((x) => ({ ...x, [k]: v }));
  const saveOpts = async (k, list) => {
    try {
      const next = await changeKey(OPTS_KEY, online, (v) => ({ ...DEFAULT_OPTS, ...v, [k]: list }), {});
      setOpts({ hair: next.hair, acc: next.acc });
      setEditOpts("");
    } catch (e) {
      setMsg(e.message || "칩을 저장하지 못했어요.");
    }
  };
  // 참고 사진 붙여넣기 · 끌어다 놓기 → 촬영 레퍼런스에도 담기고 이 코디에 들어간다
  const addFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const previews = imgs.map((f) => URL.createObjectURL(f));
    setPending((p) => [...p, ...previews]);
    try {
      const made = [];
      for (const f of imgs) {
        const photo = await putPhoto(f, online);
        if (!photo) {
          setMsg("이 기기에만 저장하는 모드라 사진은 '레퍼런스에서 고르기'로 넣어 주세요.");
          break;
        }
        made.push({ id: newId("r"), photo, folderId: null, cuts: [], place: "", memo: "스타일링 참고", createdAt: new Date().toISOString() });
      }
      if (made.length) {
        await d.saveRefs((v) => ({ ...v, items: [...made, ...(v.items || [])] }));
        setSt((x) => ({ ...x, refIds: [...(x.refIds || []), ...made.map((r) => r.id)] }));
      }
    } catch (e) {
      setMsg(e.message || "사진을 넣지 못했어요.");
    } finally {
      setPending((p) => p.filter((u) => !previews.includes(u)));
    }
  };
  const addRef = useRef(null);
  useEffect(() => {
    addRef.current = addFiles;
  });
  useEffect(() => {
    const onPaste = (e) => {
      const c = clipImages(e.clipboardData);
      if (!c.files.length && !c.urls.length) return; // 글은 칸에 그대로
      e.preventDefault();
      filesOf(c).then((fs) => addRef.current(fs));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      const clean = { ...st, memo: (st.memo || "").trim() };
      await d.saveCodis(upsert({ ...codi, styling: clean }));
      onClose();
    } catch (e) {
      setMsg(e.message || "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  const its = codiItems(codi, d.items);
  const refs = (st.refIds || []).map((id) => d.refs.find((r) => r.id === id)).filter(Boolean);
  return (
    <Sheet onClose={onClose} wide>
      <SheetHead title="스타일링" onClose={onClose} />
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const c = clipImages(e.dataTransfer);
          if (c.files.length || c.urls.length) filesOf(c).then(addFiles);
        }}
      >
        <div className="flex gap-3">
          <div className="flex shrink-0 gap-1">
            {its.slice(0, 4).map((x) => (
              <Photo key={x.id} url={d.urls[x.photo] || x.photoUrl} className="aspect-[3/4] w-12 rounded-lg" />
            ))}
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-semibold text-stone-900">{codiName(codi, d.items)}</div>
            <div className="mt-0.5 text-[11px] text-stone-500">{codi.shootDate ? `${md(codi.shootDate)} 촬영` : "촬영일 미정"}{codi.uploadOn ? ` · ${md(codi.uploadOn)} 업로드` : ""}</div>
          </div>
        </div>

        <Section title="헤어" hint="여러 개 골라도 돼요">
          {editOpts === "hair" ? (
            <OptsEditor title="헤어" list={opts.hair} onSave={(l) => saveOpts("hair", l)} onClose={() => setEditOpts("")} />
          ) : (
            <ChipPick opts={opts.hair} value={st.hair || []} onChange={set("hair")} placeholder="직접 (예: 앞머리 내림)" onEditOpts={() => setEditOpts("hair")} />
          )}
        </Section>
        <Section title="신발" hint="신상 관리 신발에서 고르거나 직접 적기">
          <WearPick d={d} part="신발" value={st.shoes || []} onChange={set("shoes")} placeholder="직접 (예: 모델 개인 검정 로퍼)" />
        </Section>
        <Section title="가방" hint="신상 관리 잡화에서 고르거나 직접 적기">
          <WearPick d={d} part="가방" value={st.bag || []} onChange={set("bag")} placeholder="직접 (예: 가방 없이)" />
        </Section>
        <Section title="악세서리" hint="반지 · 목걸이 · 양말 …">
          {editOpts === "acc" ? (
            <OptsEditor title="악세서리" list={opts.acc} onSave={(l) => saveOpts("acc", l)} onClose={() => setEditOpts("")} />
          ) : (
            <ChipPick opts={opts.acc} value={st.acc || []} onChange={set("acc")} placeholder="직접 (예: 은색 얇은 반지)" onEditOpts={() => setEditOpts("acc")} />
          )}
        </Section>
        <Section title="메모" hint="모델에게 보내는 촬영 시트에도 같이 가요">
          <textarea value={st.memo || ""} onChange={(e) => set("memo")(e.target.value)} placeholder="예: 셔츠 단추 두 개 풀기 · 소매 한 번 걷기" className={FIELD + " h-20 resize-y"} />
        </Section>
        <Section title="참고 사진" hint="레퍼런스에서 고르기 · 캡처 Ctrl+V · 끌어다 놓기">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {refs.map((r, i) => (
              <span key={r.id} className="group relative">
                <button type="button" onClick={() => setBig(i)} className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-stone-100">
                  {d.urls[r.photo] && <img src={d.urls[r.photo]} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </button>
                <button
                  type="button"
                  onClick={() => set("refIds")((st.refIds || []).filter((x) => x !== r.id))}
                  aria-label="사진 빼기"
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 max-sm:opacity-80"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {pending.map((u) => (
              <span key={u} className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-stone-100">
                <img src={u} alt="" className="h-full w-full object-cover opacity-60" />
                <Loader2 size={16} className="absolute inset-0 m-auto animate-spin text-white" />
              </span>
            ))}
            <button type="button" onClick={() => setPick(true)} className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
              <ImagePlus size={16} /> 레퍼런스에서
            </button>
            <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-rose-300 hover:text-rose-700">
              <ImagePlus size={16} /> 사진 고르기
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            </label>
          </div>
        </Section>
        {msg && (
          <p className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {msg}
            <button type="button" onClick={() => setMsg("")} aria-label="닫기">
              <X size={12} />
            </button>
          </p>
        )}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-stone-200 p-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600">
          그만두기
        </button>
        <button type="button" disabled={busy} onClick={save} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
          {busy && <Loader2 size={14} className="animate-spin" />} 스타일링 저장
        </button>
      </footer>
      {pick && (
        <RefPick
          d={d}
          picked={st.refIds || []}
          onClose={() => setPick(false)}
          onDone={(ids) => {
            set("refIds")(ids);
            setPick(false);
          }}
        />
      )}
      {big != null && <BigSlides urls={refs.map((r) => d.urls[r.photo] || "")} start={big} onClose={() => setBig(null)} />}
    </Sheet>
  );
}
