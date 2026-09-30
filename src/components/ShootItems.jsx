import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Loader2, ImagePlus, Link2, Trash2, Check, ExternalLink, PackageCheck, Undo2, MousePointerClick, Send, AlertTriangle, X, Pencil } from "lucide-react";
import { FIELD, md, won, upsert, remove, putPhoto } from "../lib/shoot";
import { STAGES, CHANNELS, RETURN_DAYS, stageName, normalize, closed, dueOf, daysLeft, dueLabel, paidLabel, moveTo, bookmarklet, cleanName, vendorName, findVendor } from "../lib/sinsang";
import { dayKey, shiftDay, dayTitle } from "../lib/journal";
import { newId } from "../lib/id";
import { Sheet, SheetHead, Chips, Photo } from "./ShootBits";

/**
 * 신상 관리 — 상품 한 장이 요청 → 입고·픽 → 촬영 → 등록 → 업데이트 완료로 옮겨 다닌다 (lib/sinsang.js 머리말).
 * 노션에서는 단계마다 다른 쪽을 열어 같은 상품을 다시 찾았다. 여기서는 탭만 바꾸고, 다음 단계로 넘기는 단추가 카드에 바로 있다.
 * 반납 기한(입고일 + 14일)은 저절로 계산해 어느 단계에서든 카드에 보여 주고, '반납·결제 예정' 탭에 날짜순으로 모은다.
 * 결제와 반납은 같이 된다(일부만 결제하고 나머지는 반납). 반납하면 '반납 완료' 탭으로 간다.
 */

const who = () => {
  try {
    return { sewon: "세원", jiwon: "지원" }[localStorage.getItem("poclo_journal_me")] || "";
  } catch {
    return "";
  }
};

const srcOf = (x, urls) => urls[x.photo] || x.photoUrl || "";
const list = (s) =>
  String(s || "")
    .split(/[,/·]/)
    .map((t) => t.trim())
    .filter(Boolean);

function DueBadge({ x, today, className = "" }) {
  const due = dueOf(x);
  if (!due) return null;
  const n = daysLeft(due, today);
  const tone = n < 0 ? "bg-rose-600 text-white" : n <= 3 ? "bg-amber-400 text-amber-950" : "bg-white/90 text-stone-600";
  return <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + tone + " " + className}>{dueLabel(n)}</span>;
}

const BTN = "flex-1 rounded-lg py-1.5 text-xs font-semibold ";
const MAIN = BTN + "bg-rose-700 text-white hover:bg-rose-800";
const SUB = BTN + "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50";

/** 켜고 끄는 단추 — 켜져도 크기가 안 바뀌게 체크 자리는 늘 잡아 둔다 */
function Toggle({ on, onClick, children, wide }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!on}
      className={
        "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium " +
        (wide ? "w-full " : "flex-1 ") +
        (on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-500")
      }
    >
      <Check size={11} className={on ? "" : "opacity-0"} /> {children}
    </button>
  );
}

/** 상품 카드 — tab 에 따라 다음 단계로 넘기는 단추가 달라진다. onPatch(바뀐 칸) */
export function ItemCard({ x, url, today, tab, onOpen, onPatch, selectable, selected }) {
  const sample = x.type !== "buy";
  const act = (patch) => (e) => {
    e.stopPropagation();
    onPatch(patch);
  };
  const go = (stage, extra = {}) => act({ ...moveTo(x, stage, today), ...extra });
  const retryDue = x.stage === "request" && x.retryOn && x.retryOn <= today;
  // 카드 아래 한 줄 — 늘 한 줄을 차지해서 눌러도 카드 높이가 안 바뀐다
  const line = retryDue
    ? { text: `재요청 ${md(x.retryOn)} — ${x.memo || "다시 요청할 날이에요"}`, tone: "font-medium text-rose-700" }
    : x.returnedOn
      ? { text: `반납 ${md(x.returnedOn)}${x.paid ? ` · 결제 ${paidLabel(x.paid)}` : ""}`, tone: "text-stone-600" }
      : x.paid
        ? { text: `결제 ${paidLabel(x.paid)}${x.paid.all ? " (전부)" : ""}`, tone: "text-teal-700" }
        : x.packed
          ? { text: `포장 ${md(x.packedOn) || "완료"}`, tone: "text-sky-700" }
          : x.retryOn && x.stage === "request"
            ? { text: `재요청 ${md(x.retryOn)}`, tone: "text-stone-500" }
            : (x.notes || []).length
              ? { text: `💬 ${x.notes[x.notes.length - 1].text}`, tone: "text-stone-400" }
              : { text: " ", tone: "" };

  return (
    <div className={"overflow-hidden rounded-xl border bg-white " + (selected ? "border-rose-600 ring-2 ring-rose-600" : "border-stone-200")}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="relative block">
          <Photo url={url} className="aspect-[3/4] w-full" />
          <span className={"absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold " + (sample ? "bg-amber-100 text-amber-900" : "bg-teal-100 text-teal-900")}>
            {sample ? "샘플" : "사입"}
          </span>
          {selectable ? (
            <span className={"absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 " + (selected ? "border-rose-700 bg-rose-700 text-white" : "border-white bg-black/20 text-transparent")}>
              <Check size={14} />
            </span>
          ) : (
            tab !== x.stage && <span className="absolute top-1.5 right-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-600">{stageName(x.stage)}</span>
          )}
          <span className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
            <DueBadge x={x} today={today} />
            {x.returning && !closed(x) && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">반납 예정</span>}
            {x.packed && !x.returnedOn && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white">포장 완료</span>}
            {x.paid && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">결제함</span>}
            {x.returnedOn && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">반납함</span>}
          </span>
        </span>
        <span className="block px-2.5 pt-2 pb-1.5">
          <span className="block truncate text-sm font-medium text-stone-900">
            {x.name || "이름 없음"}
            {x.vendor && <span className="font-normal text-stone-500"> / {x.vendor}</span>}
          </span>
          <span className="block truncate text-[11px] text-stone-400">{[x.place, won(x.price), x.kind].filter(Boolean).join(" · ") || "정보 없음"}</span>
          <span className={"block truncate text-[11px] " + line.tone}>{line.text}</span>
        </span>
      </button>

      {!selectable && (
        <div className="space-y-1 px-2 pb-2">
          {tab === "request" && (
            <>
              <div className="flex gap-1">
                <Toggle on={x.asked} onClick={act({ asked: !x.asked })}>
                  요청함
                </Toggle>
                <Toggle on={x.pickup} onClick={act({ pickup: !x.pickup })}>
                  픽업 요청
                </Toggle>
              </div>
              <button type="button" onClick={go("arrived")} className={MAIN + " w-full"}>
                입고 완료
              </button>
            </>
          )}
          {tab === "arrived" && (
            <div className="flex gap-1">
              <button type="button" onClick={go("pick")} className={MAIN}>
                {sample ? "샘플 픽" : "사입 픽"}
              </button>
              <button type="button" onClick={act(sample ? { stage: "drop", returning: true } : { stage: "drop", hold: true })} className={SUB}>
                {sample ? "반납 등록" : "보류"}
              </button>
            </div>
          )}
          {tab === "pick" && (
            <button type="button" onClick={go("shot")} className={MAIN + " w-full"}>
              촬영 완료
            </button>
          )}
          {tab === "shot" && (
            <>
              {CHANNELS.map(([k, label]) => (
                <Toggle key={k} wide on={x.channels?.[k]} onClick={act({ channels: { ...(x.channels || {}), [k]: !x.channels?.[k] } })}>
                  {label} 업로드
                </Toggle>
              ))}
              <button type="button" onClick={go("done")} className={MAIN + " w-full"}>
                업데이트 완료
              </button>
            </>
          )}
          {tab === "returns" && (
            <>
              <Toggle wide on={x.packed} onClick={act(x.packed ? { packed: false, packedOn: "" } : { packed: true, packedOn: today })}>
                <PackageCheck size={12} /> 포장 완료{x.packed && x.packedOn ? ` · ${md(x.packedOn)}` : ""}
              </Toggle>
              <div className="flex gap-1">
                <button type="button" onClick={act({ returnedOn: today, settle: null, ...(x.paid ? { paid: x.paid } : {}) })} className={MAIN}>
                  거래처 반납
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen({ pay: true });
                  }}
                  className={SUB}
                >
                  {x.paid ? "결제 고치기" : "샘플 결제"}
                </button>
              </div>
            </>
          )}
          {tab === "returned" && (
            <button type="button" onClick={act({ returnedOn: "", settle: null, ...(x.paid ? { paid: { ...x.paid, all: false } } : {}) })} className={SUB + " flex w-full items-center justify-center gap-1"}>
              <Undo2 size={12} /> 예정으로 되돌리기
            </button>
          )}
          {tab === "drop" && (
            <button type="button" onClick={go("arrived")} className={SUB + " flex w-full items-center justify-center gap-1"}>
              <Undo2 size={12} /> 되살리기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 상품 한 장 자세히 · 고치기

const EMPTY = { type: "sample", stage: "request", name: "", vendor: "", place: "", kind: "", price: "", url: "", photo: "", colors: "", sizes: "", fabric: "", origin: "", memo: "" };

function Label({ children, title }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-stone-500">{title}</span>
      {children}
    </label>
  );
}

/** 적어도 되고, 아래 칩(이 상품의 색상·사이즈)을 눌러 넣어도 되는 칸 */
function OptInput({ value, onChange, options, placeholder }) {
  const have = list(value);
  const flip = (t) => onChange((have.includes(t) ? have.filter((x) => x !== t) : [...have, t]).join(", "));
  return (
    <span className="block space-y-1">
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={FIELD} />
      {options.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {options.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => flip(t)}
              className={"rounded-full border px-2 py-0.5 text-[11px] " + (have.includes(t) ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}
            >
              {t}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function ItemSheet({ item, d, online, vendors, today, onClose, startPay }) {
  const [x, setX] = useState(() => {
    const base = { ...EMPTY, ...item };
    // 카드에서 '샘플 결제'로 들어왔으면 결제 칸을 열어 둔다
    return startPay && !base.paid ? { ...base, paid: { on: today, colors: "", sizes: "", qty: "", amount: "" } } : base;
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState(-1);
  const set = (patch) => setX((p) => ({ ...p, ...patch }));
  const sample = x.type !== "buy";
  const due = dueOf(x);
  const colorList = list(x.colors);
  const sizeList = list(x.sizes);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      set({ photo: await putPhoto(file, online), photoUrl: "" });
    } catch (e) {
      d.setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    await d.saveItems(upsert({ ...x, settle: null, id: x.id || newId("i"), createdAt: x.createdAt || new Date().toISOString() }));
    onClose();
  };
  const putNotes = (notes) => {
    set({ notes });
    if (x.id) d.saveItems(upsert({ id: x.id, notes }));
  };
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    setNote("");
    putNotes([...(x.notes || []), { by: who(), text, at: new Date().toISOString() }]);
  };
  const pay = (p) => set({ paid: { ...(x.paid || {}), ...p } });

  return (
    <Sheet onClose={onClose} wide>
      <SheetHead
        title={x.id ? `${x.name || "이름 없음"}${x.vendor ? ` / ${x.vendor}` : ""}` : "상품 직접 넣기"}
        onClose={onClose}
        right={
          x.url && (
            <a href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
              <ExternalLink size={13} /> 신상마켓
            </a>
          )
        }
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onPaste={(e) => {
          const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
          if (f) upload(f);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
          <div className="space-y-2">
            <label className="relative block aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 hover:border-rose-300">
              {preview || srcOf(x, d.urls) ? (
                <img src={preview || srcOf(x, d.urls)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-stone-400">
                  <ImagePlus size={18} /> 사진 고르기 · 캡처 붙여넣기(Ctrl+V)
                </span>
              )}
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 size={18} className="animate-spin" />
                </span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-xs">
              {[
                ["sample", "샘플"],
                ["buy", "사입"],
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => set({ type: k })} className={"flex-1 rounded-md py-1.5 font-medium " + ((x.type || "sample") === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                  {label}
                </button>
              ))}
            </div>
            {due && (
              <p className="rounded-lg bg-stone-50 px-2.5 py-2 text-[11px] leading-relaxed text-stone-600">
                반납 기한 <b className="text-stone-900">{dayTitle(due)}</b>
                <br />
                <DueBadge x={x} today={today} className="mt-1 inline-block ring-1 ring-stone-200" />
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-stone-500">종류</span>
              <Chips list={d.tags.clothes} value={x.kind} onChange={(v) => set({ kind: v })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label title="상품명 (거래처 상품명)">
                <input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 코듀로이반팬츠" className={FIELD} />
              </Label>
              <Label title="거래처 (돈 › 거래처와 같은 이름)">
                <input value={x.vendor} onChange={(e) => set({ vendor: e.target.value, vendorId: vendors.find((v) => v.name === e.target.value)?.id || "" })} list="sinsang-vendors" placeholder="예: 플랫유 flatyou" className={FIELD} />
                <datalist id="sinsang-vendors">
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name} />
                  ))}
                </datalist>
              </Label>
              <Label title="위치">
                <input value={x.place} onChange={(e) => set({ place: e.target.value })} placeholder="예: 디오트 3층 E18" className={FIELD} />
              </Label>
              <Label title="도매가">
                <input value={x.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="14000" className={FIELD} />
              </Label>
            </div>
            <Label title="신상마켓 링크">
              <span className="relative block">
                <Link2 size={14} className="absolute top-2.5 left-3 text-stone-400" />
                <input value={x.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://sinsangmarket.kr/…" className={FIELD + " pl-8"} />
              </span>
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Label title="색상">
                <input value={x.colors || ""} onChange={(e) => set({ colors: e.target.value })} className={FIELD} />
              </Label>
              <Label title="사이즈">
                <input value={x.sizes || ""} onChange={(e) => set({ sizes: e.target.value })} className={FIELD} />
              </Label>
              <Label title="혼용률">
                <input value={x.fabric || ""} onChange={(e) => set({ fabric: e.target.value })} className={FIELD} />
              </Label>
              <Label title="제조국">
                <input value={x.origin || ""} onChange={(e) => set({ origin: e.target.value })} className={FIELD} />
              </Label>
            </div>
            <Label title="메모">
              <textarea value={x.memo || ""} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 깔깨져서 목~일밤 재요청" className={FIELD + " min-h-[3.5rem] [field-sizing:content]"} />
            </Label>

            <div className="space-y-2 rounded-xl border border-stone-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-stone-500">단계</span>
                <select value={x.stage} onChange={(e) => set(moveTo(x, e.target.value, today))} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
                  {STAGES.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                  <option value="drop">보류·드랍</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Toggle on={x.asked} onClick={() => set({ asked: !x.asked })}>
                  거래처 샘플 요청
                </Toggle>
                <Toggle on={x.pickup} onClick={() => set({ pickup: !x.pickup })}>
                  샘플 픽업 요청
                </Toggle>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Label title="샘플 재요청 날짜">
                  <input type="date" value={x.retryOn || ""} onChange={(e) => set({ retryOn: e.target.value })} className={FIELD} />
                </Label>
                <Label title="입고일 (반납 기한이 여기서 계산돼요)">
                  <input type="date" value={x.arrivedOn || ""} onChange={(e) => set({ arrivedOn: e.target.value })} className={FIELD} />
                </Label>
                <Label title="입고된 색상·사이즈">
                  <OptInput value={x.arrivedOpts} onChange={(v) => set({ arrivedOpts: v })} options={[...colorList, ...sizeList]} placeholder="예: 블랙, 진베이지 / M" />
                </Label>
                {sample && (
                  <Label title={`반납까지 며칠 (기본 ${RETURN_DAYS}일)`}>
                    <input value={x.returnDays || ""} onChange={(e) => set({ returnDays: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder={String(RETURN_DAYS)} className={FIELD} />
                  </Label>
                )}
                <Label title="촬영 날짜">
                  <input type="date" value={x.shootDate || ""} onChange={(e) => set({ shootDate: e.target.value })} className={FIELD} />
                </Label>
                <Label title="촬영 색상 및 사이즈">
                  <OptInput value={x.shootOpts} onChange={(v) => set({ shootOpts: v })} options={[...colorList, ...sizeList]} placeholder="예: 블랙 / Free" />
                </Label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(([k, label]) => (
                  <Toggle key={k} on={x.channels?.[k]} onClick={() => set({ channels: { ...(x.channels || {}), [k]: !x.channels?.[k] } })}>
                    {label} 업로드
                  </Toggle>
                ))}
              </div>

              {sample && (
                <div className="space-y-2 border-t border-stone-100 pt-2">
                  <div className="text-xs font-semibold text-stone-500">반납 · 결제</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Toggle on={x.returning} onClick={() => set({ returning: !x.returning })}>
                      반납 등록
                    </Toggle>
                    <Toggle on={x.packed} onClick={() => set(x.packed ? { packed: false, packedOn: "" } : { packed: true, packedOn: today })}>
                      포장 완료
                    </Toggle>
                    <Toggle on={!!x.paid} onClick={() => set({ paid: x.paid ? null : { on: today, colors: "", sizes: "", qty: "", amount: "" }, settle: null })}>
                      샘플 결제함
                    </Toggle>
                    <Toggle on={!!x.returnedOn} onClick={() => set({ returnedOn: x.returnedOn ? "" : today, settle: null })}>
                      거래처 반납함
                    </Toggle>
                  </div>
                  {x.packed && (
                    <Label title="포장한 날">
                      <input type="date" value={x.packedOn || ""} onChange={(e) => set({ packedOn: e.target.value })} className={FIELD} />
                    </Label>
                  )}
                  {x.paid && (
                    <div className="space-y-2 rounded-lg bg-teal-50/70 p-2.5">
                      <div className="text-xs font-semibold text-teal-900">샘플 결제 — 무엇을 얼마에 샀나요</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Label title="결제한 색상">
                          <OptInput value={x.paid.colors} onChange={(v) => pay({ colors: v })} options={colorList} placeholder="예: 블랙" />
                        </Label>
                        <Label title="결제한 사이즈">
                          <OptInput value={x.paid.sizes} onChange={(v) => pay({ sizes: v })} options={sizeList} placeholder="예: M" />
                        </Label>
                        <Label title="몇 장">
                          <input value={x.paid.qty || ""} onChange={(e) => pay({ qty: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="1" className={FIELD} />
                        </Label>
                        <Label title="결제 금액 (원)">
                          <input value={x.paid.amount || ""} onChange={(e) => pay({ amount: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder={x.price ? String(x.price) : "0"} className={FIELD} />
                        </Label>
                        <Label title="결제한 날">
                          <input type="date" value={x.paid.on || ""} onChange={(e) => pay({ on: e.target.value })} className={FIELD} />
                        </Label>
                      </div>
                      <Toggle wide on={x.paid.all} onClick={() => pay({ all: !x.paid.all })}>
                        받은 걸 전부 결제했어요 (반납할 것 없음)
                      </Toggle>
                    </div>
                  )}
                  {x.returnedOn && (
                    <div className="space-y-1 rounded-lg bg-stone-50 p-2.5">
                      <Label title="거래처에 반납한 날">
                        <input type="date" value={x.returnedOn} onChange={(e) => set({ returnedOn: e.target.value })} className={FIELD} />
                      </Label>
                      {x.paid && !x.paid.all && (
                        <p className="text-[11px] text-stone-500">
                          결제한 <b className="text-stone-700">{paidLabel({ colors: x.paid.colors, sizes: x.paid.sizes, qty: x.paid.qty }) || "것"}</b> 을 빼고 나머지를 반납했어요.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {x.id && (
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="mb-1.5 text-xs font-semibold text-stone-500">댓글</div>
                <ul className="space-y-1">
                  {(x.notes || []).map((n, i) => (
                    <li key={i} className="group flex items-center gap-2 text-sm">
                      <span className="shrink-0 text-xs font-semibold text-stone-700">{n.by || "—"}</span>
                      {editNote === i ? (
                        <input
                          autoFocus
                          defaultValue={n.text}
                          onBlur={(e) => {
                            const t = e.target.value.trim();
                            putNotes(t ? x.notes.map((m, k) => (k === i ? { ...m, text: t } : m)) : x.notes.filter((_, k) => k !== i));
                            setEditNote(-1);
                          }}
                          onKeyUp={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="min-w-0 flex-1 rounded-md border border-rose-400 px-2 py-0.5 text-sm outline-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 text-stone-700">{n.text}</span>
                      )}
                      <span className="shrink-0 text-[11px] text-stone-400">{md(String(n.at).slice(0, 10))}</span>
                      <button type="button" onClick={() => setEditNote(i)} aria-label="댓글 고치기" className="shrink-0 p-0.5 text-stone-400 hover:text-stone-700">
                        <Pencil size={12} />
                      </button>
                      <button type="button" onClick={() => putNotes(x.notes.filter((_, k) => k !== i))} aria-label="댓글 지우기" className="shrink-0 p-0.5 text-stone-400 hover:text-rose-600">
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-1.5">
                  <input value={note} onChange={(e) => setNote(e.target.value)} onKeyUp={(e) => e.key === "Enter" && addNote()} placeholder="댓글 (엔터)" className={FIELD} />
                  <button type="button" onClick={addNote} aria-label="댓글 달기" className="rounded-lg bg-stone-800 px-3 text-white">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 p-3">
        {x.id ? (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("이 상품을 지울까요?")) return;
              await d.saveItems(remove(x.id));
              onClose();
            }}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
          >
            <Trash2 size={13} /> 지우기
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={busy || !(x.name.trim() || x.photo || x.url.trim())} onClick={save} className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
          저장
        </button>
      </footer>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 신상마켓에서 담기 안내

function ClipGuide({ onClose }) {
  const link = useRef(null);
  const [ready, setReady] = useState(false);
  // React 는 javascript: 주소를 막는다 — 그린 뒤에 직접 넣는다. 읽는 코드(clip.js)도 단추 안에 같이 넣어 둔다(불러오기가 막힐 때 쓸 것)
  useEffect(() => {
    let alive = true;
    fetch("/clip.js")
      .then((r) => r.text())
      .then((core) => {
        if (!alive) return;
        link.current?.setAttribute("href", bookmarklet(window.location.origin, core));
        setReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="신상마켓에서 한 번에 담기" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed text-stone-700">
        <p>
          신상마켓은 밖에서 자동으로 읽어 오는 걸 막아 둬서, <b>세원님이 보고 있는 상품 화면에서 단추를 한 번 누르면</b> 그 화면의 사진·상품명·거래처·위치·가격·색상·사이즈·혼용률을 그대로 담아 오게 했어요.
        </p>
        <ol className="space-y-3">
          <li className="rounded-xl border border-stone-200 p-3">
            <b className="text-stone-900">① 아래 단추를 즐겨찾기 막대로 끌어다 놓기</b>
            <p className="mt-1 text-xs text-stone-500">막대가 안 보이면 크롬에서 Ctrl + Shift + B. 예전에 끌어다 놓은 '포클로에 담기'가 있으면 지우고 다시 놓아 주세요.</p>
            <a
              ref={link}
              onClick={(e) => e.preventDefault()}
              className={"mt-2 inline-flex cursor-grab items-center gap-1.5 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow active:cursor-grabbing " + (ready ? "" : "opacity-50")}
            >
              <MousePointerClick size={15} /> 포클로에 담기
            </a>
          </li>
          <li className="rounded-xl border border-stone-200 p-3">
            <b className="text-stone-900">② 신상마켓에서 상품을 연 채로 그 즐겨찾기 누르기</b>
            <p className="mt-1 text-xs text-stone-500">작은 창이 뜨면서 '요청' 단계에 바로 담기고, 거래처도 돈 › 거래처와 이어져요(없으면 새로 등록). 창은 그대로 두고 다음 상품에서 또 누르세요.</p>
          </li>
        </ol>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">폰에서는 이 단추를 쓸 수 없어요. 폰에서는 '직접 넣기'에 링크를 붙이고 캡처를 넣어 주세요.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 한 화면 흐름

const TABS = [...STAGES.map(([k, label]) => [k, label]), ["drop", "보류·드랍"], ["returns", "반납·결제 예정"], ["returned", "반납 완료"]];

export default function Pipeline({ d, online, vendors, onVendor }) {
  const today = dayKey();
  const items = useMemo(() => d.items.map(normalize), [d.items]);
  const [tab, setTab] = useState("request");
  const [type, setType] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [weekOnly, setWeekOnly] = useState(false);
  const [edit, setEdit] = useState(null); // {item, pay?}
  const [guide, setGuide] = useState(false);

  // 담아 둔 상품을 돈 › 거래처와 잇는다 (10/1 세원: "거래처에 어차피 등록해야 하는데 없으면 추가, 있으면 매칭")
  // 신상마켓에서 담은 것(goodsId 있음) 중 아직 안 이어진 것만 — 이름은 한글 먼저로 고치고, 상품명도 다듬는다.
  const linking = useRef(false);
  useEffect(() => {
    if (linking.current || !onVendor) return;
    const todo = items.filter((x) => x.goodsId && x.vendor && x.place && !x.vendorId);
    if (!todo.length) return;
    linking.current = true;
    (async () => {
      let known = [...vendors];
      const patches = [];
      for (const x of todo) {
        let v = findVendor(x.vendor, x.place, known);
        if (!v) {
          v = onVendor({ name: vendorName(x.vendor), address: x.place || "", memo: "신상 관리에서 등록" });
          known = [...known, v];
        }
        patches.push({ id: x.id, vendor: v.name, vendorId: v.id, name: cleanName(x.fullName || x.name) });
      }
      await d.saveItems((val) => ({ ...val, items: (val.items || []).map((it) => ({ ...it, ...(patches.find((p) => p.id === it.id) || {}) })) }));
      linking.current = false;
    })();
  }, [items, vendors, onVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  const inTab = (x, t) => (t === "returns" ? !!dueOf(x) : t === "returned" ? x.type !== "buy" && closed(x) : x.stage === t);
  const count = (t) => items.filter((x) => inTab(x, t)).length;
  const dues = items.filter((x) => dueOf(x)).map((x) => daysLeft(dueOf(x), today));
  const overdue = dues.filter((n) => n < 0).length;
  const soon = dues.filter((n) => n >= 0 && n <= 3).length;
  const retry = items.filter((x) => x.stage === "request" && x.retryOn && x.retryOn <= today).length;

  const weekAgo = shiftDay(today, -6);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter(
      (x) =>
        inTab(x, tab) &&
        (!type || (x.type || "sample") === type) &&
        (!kind || x.kind === kind) &&
        (!weekOnly || tab !== "pick" || (x.pickedOn || "") >= weekAgo) &&
        (!n || `${x.name} ${x.vendor} ${x.place} ${x.memo || ""}`.toLowerCase().includes(n)),
    );
  }, [items, tab, type, kind, q, weekOnly, weekAgo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 묶음 — 요청은 거래처별(카톡을 거래처마다 보내니까), 반납·결제 예정은 기한 날짜별, 반납 완료는 반납한 날짜별
  const groups = useMemo(() => {
    const by = (keyOf, sort) => {
      const m = new Map();
      for (const x of shown) m.set(keyOf(x), [...(m.get(keyOf(x)) || []), x]);
      return [...m.entries()].sort(sort);
    };
    if (tab === "request") return by((x) => x.vendor || "거래처 없음", (a, b) => a[0].localeCompare(b[0], "ko")).map(([t, l]) => ({ title: `${t} · ${l.length}`, list: l }));
    if (tab === "returns")
      return by(dueOf, (a, b) => a[0].localeCompare(b[0])).map(([due, l]) => {
        const n = daysLeft(due, today);
        return { title: `${dayTitle(due)} · ${dueLabel(n)} · ${l.length}개`, tone: n < 0 ? "text-rose-700" : n <= 3 ? "text-amber-700" : "text-stone-600", list: l };
      });
    if (tab === "returned")
      return by((x) => x.returnedOn || x.paid?.on || "", (a, b) => b[0].localeCompare(a[0])).map(([day, l]) => ({ title: day ? `${dayTitle(day)} · ${l.length}개` : `날짜 없음 · ${l.length}개`, list: l }));
    return [{ title: "", list: shown }];
  }, [shown, tab, today]);

  const patch = (x) => (p) => d.saveItems(upsert({ id: x.id, ...p }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <MousePointerClick size={16} /> 신상마켓에서 담기
        </button>
        <button type="button" onClick={() => setEdit({ item: {} })} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700">
          <Plus size={16} /> 직접 넣기
        </button>
        {(overdue > 0 || soon > 0 || retry > 0) && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs">
            {overdue > 0 && (
              <button type="button" onClick={() => setTab("returns")} className="flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1.5 font-semibold text-white">
                <AlertTriangle size={12} /> 반납 초과 {overdue}
              </button>
            )}
            {soon > 0 && (
              <button type="button" onClick={() => setTab("returns")} className="rounded-full bg-amber-400 px-2.5 py-1.5 font-semibold text-amber-950">
                3일 안 반납 {soon}
              </button>
            )}
            {retry > 0 && (
              <button type="button" onClick={() => setTab("request")} className="rounded-full bg-stone-800 px-2.5 py-1.5 font-semibold text-white">
                재요청할 것 {retry}
              </button>
            )}
          </span>
        )}
      </div>

      <div className="mb-2 flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1 text-sm [scrollbar-width:none]">
        {TABS.map(([k, label], i) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={"flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 font-medium " + (tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500") + (i === STAGES.length ? " ml-auto" : "")}
          >
            {i < STAGES.length && <span className="text-[11px] text-stone-400">{i + 1}</span>}
            {label}
            <span className={tab === k ? "text-rose-700" : "text-stone-400"}>{count(k)}</span>
          </button>
        ))}
      </div>
      <p className="mb-2 px-1 text-xs text-stone-500">
        {tab === "returns"
          ? `입고일 + ${RETURN_DAYS}일로 반납 기한을 저절로 계산해요. 일부만 사면 '샘플 결제'에 적고, 나머지를 보냈으면 '거래처 반납' → '반납 완료'로 넘어가요.`
          : tab === "returned"
            ? "거래처에 반납했거나 받은 걸 전부 결제한 샘플이에요. 반납한 날짜별로 모았어요."
            : tab === "drop"
              ? "반납 등록했거나 보류한 상품이에요."
              : STAGES.find(([k]) => k === tab)?.[2]}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5 text-xs">
          {[
            ["", "전체"],
            ["sample", "샘플"],
            ["buy", "사입"],
          ].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={"rounded-md px-2.5 py-1 font-medium " + (type === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "pick" && (
          <button type="button" onClick={() => setWeekOnly(!weekOnly)} className={"rounded-full border px-3 py-1 text-xs font-medium " + (weekOnly ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}>
            이번 주 픽만
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Chips list={d.tags.clothes} value={kind} onChange={setKind} all="종류 전체" />
        </div>
        <span className="relative w-full sm:w-52">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품·거래처 찾기" className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pr-7 pl-8 text-sm" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="지우기" className="absolute top-1/2 right-2 -translate-y-1/2 text-stone-400">
              <X size={14} />
            </button>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          {items.length === 0 ? "'신상마켓에서 담기'로 샘플 요청한 상품을 모아 보세요. 담으면 '요청'에 들어오고, 단추를 누를 때마다 다음 단계로 넘어가요." : "여기에는 상품이 없어요."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.title || "all"}>
              {g.title && <h3 className={"mb-1.5 px-1 text-sm font-semibold " + (g.tone || "text-stone-700")}>{g.title}</h3>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {g.list.map((x) => (
                  <ItemCard key={x.id} x={x} url={srcOf(x, d.urls)} today={today} tab={tab} onOpen={(o) => setEdit({ item: x, pay: !!o?.pay })} onPatch={patch(x)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && <ItemSheet key={edit.item.id || "new"} item={edit.item} startPay={edit.pay} d={d} online={online} vendors={vendors} today={today} onClose={() => setEdit(null)} />}
      {guide && <ClipGuide onClose={() => setGuide(false)} />}
    </div>
  );
}
