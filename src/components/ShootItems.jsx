import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Loader2, ImagePlus, Link2, Trash2, Check, ExternalLink, PackageCheck, Undo2, MousePointerClick, Send, AlertTriangle, X, Pencil, MessageCircle, Copy } from "lucide-react";
import { FIELD, md, won, upsert, remove, putPhoto } from "../lib/shoot";
import { STAGES, CHANNELS, RETURN_DAYS, stageName, normalize, closed, dueOf, daysLeft, dueLabel, paidLabel, moveTo, bookmarklet, cleanName, vendorName, findVendor, vendorFill, contactLines, contactOf, MSG_SLOT, requestText, friendName, REFUSE_REASONS, refusalText, refusalsOf } from "../lib/sinsang";
import { dayKey, shiftDay, dayTitle } from "../lib/journal";
import { newId } from "../lib/id";
import { Sheet, SheetHead, Chips, Photo } from "./ShootBits";
import VendorPicker from "./VendorPicker";
import VendorEditor from "./VendorEditor";

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
        "flex min-w-0 items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] font-medium whitespace-nowrap " +
        (wide ? "w-full " : "flex-1 ") +
        (on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-500")
      }
    >
      <Check size={10} className={"shrink-0 " + (on ? "" : "opacity-0")} />
      {children}
    </button>
  );
}

/** 상품 카드 — tab 에 따라 다음 단계로 넘기는 단추가 달라진다. onPatch(바뀐 칸) */
export function ItemCard({ x, url, today, tab, onOpen, onPatch, onRefuse, selectable, selected }) {
  const sample = x.type !== "buy";
  const act = (patch) => (e) => {
    e.stopPropagation();
    onPatch(patch);
  };
  const go = (stage, extra = {}) => act({ ...moveTo(x, stage, today), ...extra });
  const retryDue = x.stage === "request" && x.retryOn && x.retryOn <= today;
  // 카드 아래 한 줄 — 늘 한 줄을 차지해서 눌러도 카드 높이가 안 바뀐다
  const line = x.refused && x.stage === "drop"
    ? { text: `샘플 안 됨${x.refusedOn ? ` ${md(x.refusedOn)}` : ""}${x.refusedWhy ? ` · ${x.refusedWhy}` : ""}`, tone: "text-rose-700" }
    : retryDue
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
          {/* 메모는 사진 아래쪽에 어둡게 깔아서 (세원 10/1: "썸네일 밑에 살짝 검정 음영 주고 메모 내용") — 배지는 그 위 */}
          <span className={"absolute inset-x-0 bottom-0 flex flex-col gap-1 px-1.5 pb-1.5 " + (x.memo ? "bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-10" : "")}>
          <span className="flex flex-wrap gap-1">
            <DueBadge x={x} today={today} />
            {x.returning && !closed(x) && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">반납 예정</span>}
            {x.refused && x.stage === "drop" && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">샘플 안 됨</span>}
            {x.packed && !x.returnedOn && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white">포장 완료</span>}
            {x.paid && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">결제함</span>}
            {x.returnedOn && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">반납함</span>}
          </span>
          {x.memo && <span className="line-clamp-3 text-[11px] leading-snug font-medium whitespace-pre-line text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{x.memo}</span>}
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
              <div className="flex gap-1">
                <button type="button" onClick={go("arrived")} className={MAIN}>
                  입고 완료
                </button>
                <button
                  type="button"
                  onClick={
                    onRefuse
                      ? (e) => {
                          e.stopPropagation();
                          onRefuse();
                        }
                      : act({ stage: "drop", refused: true, refusedOn: today })
                  }
                  title="거래처가 샘플이 안 된다고 했어요 — 보류·드랍으로"
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50"
                >
                  안 됨
                </button>
              </div>
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
            <button type="button" onClick={x.refused ? act({ stage: "request", refused: false, refusedOn: "", refusedWhy: "" }) : go("arrived")} className={SUB + " flex w-full items-center justify-center gap-1"}>
              <Undo2 size={12} /> {x.refused ? "요청으로 되돌리기" : "되살리기"}
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

export function ItemSheet({ item, d, online, vendors, onVendor, today, onClose, startPay }) {
  const [x, setX] = useState(() => {
    const base = { ...EMPTY, ...item };
    // 카드에서 '샘플 결제'로 들어왔으면 결제 칸을 열어 둔다
    return startPay && !base.paid ? { ...base, paid: { on: today, colors: "", sizes: "", qty: "", amount: "" } } : base;
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState(-1);
  const [vendorEdit, setVendorEdit] = useState(false);
  const set = (patch) => setX((p) => ({ ...p, ...patch }));
  // 돈 › 거래처의 그 거래처 (vendorId 로 잇는다 — 이름은 바뀔 수 있다)
  const linked = vendors.find((v) => v.id === x.vendorId) || null;
  // 거래처 정보를 고치면 돈 › 거래처 기록이 바뀌고, 신상 관리의 같은 거래처 상품도 새 이름·위치로 (세원 10/1)
  const saveVendor = async (data) => {
    const old = linked;
    const rec = onVendor(data);
    const place = (p) => (!p || p === old.address ? rec.address : p);
    await d.saveItems((val) => ({ ...val, items: (val.items || []).map((it) => (it.vendorId === rec.id ? { ...it, vendor: rec.name, place: place(it.place) } : it)) }));
    set({ vendor: rec.name, place: place(x.place) });
    setVendorEdit(false);
  };
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
              <ExternalLink size={13} /> 신마에서 열기
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
              {/* label 로 감싸면 제목을 누를 때 목록 단추가 같이 눌린다 — div 로 */}
              <div className="block space-y-1 text-sm">
                <span className="text-xs font-semibold text-stone-500">거래처 (돈 › 거래처)</span>
                <VendorPicker
                  vendors={vendors}
                  value={x.vendorId}
                  name={x.vendor}
                  hint={!linked && x.vendor ? "돈 › 거래처와 아직 안 이어졌어요. 눌러서 고르거나 새로 등록하세요." : ""}
                  onPick={(v) => {
                    set({ vendor: v.name, vendorId: v.id, place: x.place || v.address });
                    setVendorEdit(false);
                  }}
                  onNewName={
                    onVendor
                      ? (name) => {
                          const v = onVendor({ name: vendorName(name), address: x.place || "", memo: "신상 관리에서 등록" });
                          set({ vendor: v.name, vendorId: v.id });
                        }
                      : undefined
                  }
                />
              </div>
              <Label title="위치">
                <input value={x.place} onChange={(e) => set({ place: e.target.value })} placeholder="예: 디오트 3층 E18" className={FIELD} />
              </Label>
              <Label title="도매가">
                <input value={x.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="14000" className={FIELD} />
              </Label>
            </div>
            {linked &&
              onVendor &&
              (vendorEdit ? (
                <VendorEditor seed={linked} onSubmit={saveVendor} onCancel={() => setVendorEdit(false)} submitLabel="거래처 저장 (돈 › 거래처에도)" />
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  <span className="min-w-0">
                    <b className="text-stone-800">{linked.name}</b>
                    {[linked.address, linked.phone].filter(Boolean).map((t) => ` · ${t}`)}
                    {linked.memo && <span className="block truncate text-stone-400">{linked.memo}</span>}
                  </span>
                  <button type="button" onClick={() => setVendorEdit(true)} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-medium text-stone-700 hover:bg-stone-50">
                    <Pencil size={11} /> 거래처 정보 고치기
                  </button>
                </div>
              ))}
            <RefusalNote list={refusalsOf(d.refusals, x.vendorId, x.vendor)} />
            {(contactLines(x.contact).length > 0 || x.desc) && (
              <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
                <span className="font-semibold text-stone-500">거래처가 제품 설명에 적어 둔 것</span>
                {contactLines(x.contact).length > 0 && <p className="mt-0.5 text-stone-800 select-all">{contactLines(x.contact).join(" · ")}</p>}
                {x.desc && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-stone-500">전체 글 보기</summary>
                    <p className="mt-1 whitespace-pre-line">{x.desc}</p>
                  </details>
                )}
              </div>
            )}
            <Label title="신마 링크">
              <span className="relative block">
                <Link2 size={14} className="absolute top-2.5 left-3 text-stone-400" />
                <input value={x.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://sinsangmarket.kr/…" className={FIELD + " pl-8" + (x.url ? " pr-20" : "")} />
                {/^https?:\/\//.test(x.url || "") && (
                  <a href={x.url} target="_blank" rel="noreferrer" className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100">
                    <ExternalLink size={12} /> 열기
                  </a>
                )}
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

// ---------------------------------------------------------------- 거래처에 보낼 샘플 요청 글

const copy = async (text) => {
  try {
    // 브라우저가 대답을 안 하고 붙잡고 있는 경우가 있다(폰 등) — 1.5초 넘으면 예전 방식으로
    await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(() => no(new Error("복사 시간 초과")), 1500))]);
    return true;
  } catch {
    // 브라우저가 새 방식을 막으면 예전 방식으로 (안 보이는 칸에 넣고 복사)
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

/**
 * 거래처 한 곳에 보낼 요청 글 — 단추를 누를 때 이미 복사돼 있고, 여기서는 확인·고치기·다시 복사.
 * 카톡은 밖에서 대신 보낼 수 없어서(lib/sinsang.js) 여기까지가 자동이다: 글 만들기 → 복사 → 보낸 뒤 '요청함' 한 번에.
 * m = {vendor, list(그 거래처의 요청 단계 상품), picks(글에 넣을 상품 id), kind, kakao, phone, copied}
 */
function MsgSheet({ m, msgs, onSaveMsgs, onAsked, onClose, refusals = [], onDropRefusal }) {
  // 연락처 — 담을 때 제품 설명에서 읽은 것 먼저, 없으면 돈 › 거래처의 전화·메모
  const memo = contactOf(m.memo);
  const pick = (k) => m.list.map((x) => x.contact?.[k]).find(Boolean) || "";
  const kakao = pick("kakao") || memo.kakao;
  const phone = pick("mobile") || m.phone || pick("tel") || memo.mobile || memo.tel;
  const [kind, setKind] = useState(m.kind);
  const [picks, setPicks] = useState(m.picks);
  const [custom, setCustom] = useState(null); // 이번 글만 손으로 고친 것
  const [tpl, setTpl] = useState(null); // 틀을 고치는 중이면 그 글
  const [note, setNote] = useState("글을 복사하는 중…");
  // 단추를 누를 때 시작한 복사(m.copied, Promise)가 끝나면 알려 준다
  useEffect(() => {
    let alive = true;
    Promise.resolve(m.copied).then((ok) => alive && setNote(ok ? "글을 복사했어요. 카톡에서 거래처 방을 열고 붙여넣기(Ctrl+V) 하세요." : "복사가 막혔어요. 아래 '글 복사'를 눌러 주세요."));
    return () => {
      alive = false;
    };
  }, [m.copied]);
  const names = m.list.filter((x) => picks.includes(x.id)).map((x) => x.name || x.fullName).filter(Boolean);
  const text = custom ?? requestText(msgs[kind], names);
  const say = async (what, okText) => setNote((await copy(what)) ? okText : "복사하지 못했어요. 글을 끌어서 직접 복사해 주세요.");
  const TAB = "flex-1 rounded-md py-1.5 font-medium ";
  const friend = friendName(m.vendor, m.place);

  return (
    <Sheet onClose={onClose}>
      {/* 맨 위는 카톡 친구 이름 그대로 — 친구 추가하고 이름 바꿀 때 붙여넣는다 */}
      <SheetHead
        title={friend}
        onClose={onClose}
        right={
          <button type="button" onClick={() => say(friend, `'${friend}' 를 복사했어요. 카톡 친구 이름에 붙여넣으세요.`)} className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50">
            <Copy size={12} /> 이름 복사
          </button>
        }
      />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <RefusalNote list={refusals} onDrop={onDropRefusal} />
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
          {[
            ["first", "처음 거래하는 곳"],
            ["again", "거래해 본 곳"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCustom(null);
                setTpl(null);
              }}
              className={TAB + (kind === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "first" && (
          <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <span className="text-xs font-semibold text-amber-900">처음 거래하는 곳 — 먼저 카톡 친구 추가</span>
            {kakao || phone ? (
              <>
                {kakao && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      카톡 아이디 <b className="select-all">{kakao}</b>
                    </span>
                    <button type="button" onClick={() => say(kakao, `카톡 아이디 ${kakao} 를 복사했어요. 카톡 › 친구 추가 › ID 로 찾기에 붙여넣으세요.`)} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium">
                      <Copy size={12} /> 복사
                    </button>
                  </div>
                )}
                {phone && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      전화 <b className="select-all">{phone}</b>
                    </span>
                    <button type="button" onClick={() => say(phone, `전화번호 ${phone} 를 복사했어요. 카톡 › 친구 추가 › 연락처로 찾기에 쓰세요.`)} className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium">
                      <Copy size={12} /> 복사
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-amber-900">제품 설명에 카톡 아이디·전화가 없어요. 신마에서 거래처 연락처를 확인하세요.</p>
                {m.list
                  .filter((x) => /^https?:\/\//.test(x.url || ""))
                  .slice(0, 3)
                  .map((x) => (
                    <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                      <ExternalLink size={12} /> 신마에서 열기 · {x.name}
                    </a>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1">
          <span className="text-xs font-semibold text-stone-500">글에 넣을 상품 {names.length}개</span>
          <div className="flex flex-wrap gap-1">
            {m.list.map((x) => {
              const on = picks.includes(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPicks(on ? picks.filter((id) => id !== x.id) : [...picks, x.id]);
                    setCustom(null);
                  }}
                  className={"flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " + (on ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-500")}
                >
                  {on && <Check size={11} />} {x.name || "이름 없음"}
                  {x.asked && <span className={on ? "text-rose-200" : "text-stone-400"}>(요청함)</span>}
                </button>
              );
            })}
          </div>
        </div>

        {tpl === null ? (
          <div className="space-y-1">
            <textarea value={text} onChange={(e) => setCustom(e.target.value)} className={FIELD + " min-h-[13rem] leading-relaxed [field-sizing:content]"} />
            <button type="button" onClick={() => setTpl(msgs[kind])} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800">
              <Pencil size={11} /> 이 문구 틀 고치기 (다음에도 이 글로)
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 rounded-xl border border-stone-200 p-3">
            <p className="text-xs text-stone-500">
              <b className="text-stone-700">{MSG_SLOT}</b> 자리에 상품 이름이 들어가요. 그 글자는 그대로 두고 나머지를 고치세요.
            </p>
            <textarea value={tpl} onChange={(e) => setTpl(e.target.value)} className={FIELD + " min-h-[13rem] leading-relaxed [field-sizing:content]"} />
            <div className="flex justify-end gap-2 text-sm">
              <button type="button" onClick={() => setTpl(null)} className="rounded-lg px-3 py-1.5 text-stone-500">
                취소
              </button>
              <button
                type="button"
                disabled={!tpl.includes(MSG_SLOT)}
                onClick={async () => {
                  await onSaveMsgs({ ...msgs, [kind]: tpl.trim() });
                  setTpl(null);
                  setCustom(null);
                  setNote("문구 틀을 저장했어요. '글 복사'를 다시 눌러 주세요.");
                }}
                className="rounded-lg bg-stone-800 px-3 py-1.5 font-medium text-white disabled:bg-stone-300"
              >
                틀 저장
              </button>
            </div>
          </div>
        )}
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">{note}</p>
      </div>
      <footer className="shrink-0 space-y-2 border-t border-stone-200 p-3">
        <div className="flex gap-2">
          <button type="button" disabled={!names.length || tpl !== null} onClick={() => say(text, "글을 복사했어요. 카톡에서 거래처 방을 열고 붙여넣기(Ctrl+V) 하세요.")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-700 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
            <Copy size={14} /> 글 복사
          </button>
        </div>
        <button
          type="button"
          disabled={!picks.length}
          onClick={() => {
            onAsked(picks);
            onClose();
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
        >
          <Check size={14} /> 보냈어요 — {picks.length}개 '요청함'으로
        </button>
      </footer>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 샘플 거절

/** 그 거래처가 샘플을 거절한 기록 — 다음에 담을 때 "아 여기 안 되지" 하고 보게 */
export function RefusalNote({ list, onDrop }) {
  if (!list?.length) return null;
  return (
    <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
      <span className="flex items-center gap-1 font-semibold">
        <AlertTriangle size={12} /> 이 거래처는 샘플을 거절한 적이 있어요
      </span>
      {list.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <b>{md(r.on)}</b> {refusalText(r)}
            {r.item && <span className="text-rose-700/70"> ({r.item})</span>}
          </span>
          {onDrop && (
            <button type="button" onClick={() => window.confirm("이 거절 기록을 지울까요?") && onDrop(r.id)} aria-label="기록 지우기" className="shrink-0 text-rose-400 hover:text-rose-700">
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** '안 됨' — 왜 안 된대요? (이유 여러 개 + 한 줄). 이 거래처의 다른 요청 상품도 같이 옮길 수 있다 */
function RefuseSheet({ x, others, onSave, onClose }) {
  const [reasons, setReasons] = useState([]);
  const [note, setNote] = useState("");
  const [scope, setScope] = useState("item"); // item: 이 상품만 · vendor: 거래처가 샘플 자체를 안 해 줌
  const [picked, setPicked] = useState(false); // 사람이 직접 고르면 이유 칩이 바꾸지 않는다
  const [all, setAll] = useState(others.length > 0);
  const [busy, setBusy] = useState(false);
  const flip = (t) => {
    setReasons(reasons.includes(t) ? reasons.filter((r) => r !== t) : [...reasons, t]);
    // 이유 칩은 다 거래처 방침이라 — 고르면 '거래처 전체'로 (직접 고른 적이 없을 때만)
    if (!picked && !reasons.includes(t)) setScope("vendor");
  };
  const SCOPE = "flex-1 rounded-md px-2 py-2 text-left text-xs leading-snug ";
  return (
    <Sheet onClose={onClose}>
      <SheetHead title={`샘플 안 됨 · ${x.vendor || "거래처 없음"}`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <p className="text-stone-600">
          <b className="text-stone-900">{x.name}</b> — 왜 안 된대요?
        </p>
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
          {[
            ["item", "이 상품만 안 됨", "품절·이 상품만 샘플 불가 — 거래처 경고는 안 띄워요"],
            ["vendor", "거래처가 샘플 자체를 안 해 줌", "다음에 이 거래처 상품을 담거나 요청할 때 경고해요"],
          ].map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              aria-pressed={scope === k}
              onClick={() => {
                setScope(k);
                setPicked(true);
              }}
              className={SCOPE + (scope === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}
            >
              <b className="block text-[13px]">{label}</b>
              <span className="text-[11px] text-stone-400">{hint}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REFUSE_REASONS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={reasons.includes(t)}
              onClick={() => flip(t)}
              className={"rounded-full border px-3 py-1.5 text-xs font-medium " + (reasons.includes(t) ? "border-rose-700 bg-rose-700 text-white" : "border-stone-200 bg-white text-stone-600")}
            >
              {t}
            </button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="다른 이유·조건 (예: 월 100만원 이상 거래처만)" className={FIELD} />
        {scope === "vendor" && others.length > 0 && (
          <label className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-700">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="mt-0.5" />
            <span>
              이 거래처에 요청한 다른 상품 {others.length}개도 같이 '안 됨'으로 <span className="text-stone-400">({others.map((y) => y.name).join(", ")})</span>
            </span>
          </label>
        )}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-stone-200 p-3">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-stone-500">
          취소
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave({ reasons, note: note.trim(), all: scope === "vendor" && all, scope });
          }}
          className="rounded-xl bg-stone-800 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300"
        >
          안 됨으로 옮기기
        </button>
      </footer>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 옷 종류 비율

// 세원 10/1: "상의·하의 샘플 요청 비율을 알고 싶어. 상의 70% 하의 30%로 소싱되면 상품이 와도 코디하기 어려워지니까."
// **요청 단계 상품**('안 됨' 빼고 — 지금 소싱에 넣어 둔 것)을 옷 종류별로 센다. 처음엔 촬영 전 전체와 고르게 했는데
// 세원: "오늘 소싱에 얼만큼의 비율을 넣어놨는지가 관건이라 그냥 요청만 보여주면 될 것 같아." 코디는 상의 한 벌에 하의 한 벌이라 **상의:하의 = 1:1** 을 기준으로,
// 한쪽이 60%를 넘으면 몇 개 더 요청하면 맞는지 알려 준다. 원피스·세트는 혼자서 한 벌, 아우터·신발·잡화는 걸치는 것이라 기준에서 뺀다.
const MIX_TONE = { 상의: "bg-rose-600", 하의: "bg-stone-700", "원피스·세트": "bg-rose-300", 아우터: "bg-stone-400", "신발·잡화": "bg-amber-300" };
function KindMix({ items, kinds, kind, onKind }) {
  const pool = items.filter((x) => x.stage === "request" && !x.refused);
  const count = (k) => pool.filter((x) => (k ? x.kind === k : !kinds.includes(x.kind))).length;
  const rows = [...kinds.map((k) => ({ k, label: k, n: count(k) })), { k: "", label: "종류 없음", n: count("") }].filter((r) => r.n);
  const pct = (n) => Math.round((n / pool.length) * 100);
  const top = count("상의");
  const bottom = count("하의");
  const pair = top + bottom;
  const gap = Math.abs(top - bottom);
  const lean = pair >= 4 && Math.max(top, bottom) / pair > 0.6;
  const advice = !pair
    ? ""
    : lean
      ? `${top > bottom ? "상의" : "하의"}가 ${gap}개 많아요 — ${top > bottom ? "하의" : "상의"}를 ${gap}개 더 요청하면 1:1이에요.`
      : `상의 ${top} : 하의 ${bottom} — 코디하기 괜찮은 비율이에요.`;

  return (
    <div className="mb-3 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-stone-800">
          요청한 옷 종류 비율 <span className="font-normal text-stone-400">{pool.length}개</span>
        </span>
      </div>
      {pool.length ? (
        <>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-stone-100">
            {rows.map((r) => (
              <span key={r.label} title={`${r.label} ${r.n}개 · ${pct(r.n)}%`} style={{ width: `${(r.n / pool.length) * 100}%` }} className={(MIX_TONE[r.k] || "bg-stone-200") + " border-r border-white last:border-r-0"} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-xs">
            {rows.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => r.k && onKind(kind === r.k ? "" : r.k)}
                className={"flex items-center gap-1.5 rounded-full px-2 py-0.5 " + (kind && kind === r.k ? "bg-stone-800 text-white" : "text-stone-700 hover:bg-stone-100")}
              >
                <span className={"h-2 w-2 rounded-full " + (MIX_TONE[r.k] || "bg-stone-200")} />
                {r.label} <b className="tabular-nums">{r.n}</b>
                <span className={"tabular-nums " + (kind && kind === r.k ? "text-stone-300" : "text-stone-400")}>{pct(r.n)}%</span>
              </button>
            ))}
          </div>
          {advice && <p className={"mt-2 rounded-lg px-2.5 py-1.5 text-xs " + (lean ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>{advice}</p>}
        </>
      ) : (
        <p className="mt-2 text-xs text-stone-400">요청 단계 상품이 없어요.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 재요청 달력

// 세원 10/1: "재요청 모아보기 누르면 위에 캘린더 뜨고 언제 어딜 요청해야 되는지 — 살짝 날짜별로."
// 한 달 달력에 재요청 날짜마다 거래처 이름(두 곳까지 + 외 N). 날짜를 누르면 그날 것만, 다시 누르면 전부. 아래 목록은 날짜별 묶음.
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function RetryCalendar({ items, today, day, onDay }) {
  const [ym, setYm] = useState(() => today.slice(0, 7)); // 늘 이번 달부터 — 지난 달에 밀린 건 아래 줄로 알려 준다
  const behind = items.filter((x) => x.retryOn < `${ym}-01`).length;
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map();
  for (const x of items) byDay.set(x.retryOn, [...(byDay.get(x.retryOn) || []), x]);
  const move = (d) => {
    const t = new Date(y, m - 1 + d, 1);
    setYm(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
  };
  const cells = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="mb-3 rounded-xl border border-stone-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100" aria-label="이전 달">
          ‹
        </button>
        <span className="text-sm font-semibold text-stone-800">
          {y}년 {m}월 재요청 <span className="font-normal text-stone-400">· 날짜를 누르면 그날 것만</span>
        </span>
        <button type="button" onClick={() => move(1)} className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100" aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-stone-400">
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((k, i) => {
          if (!k) return <span key={"e" + i} />;
          const list = byDay.get(k) || [];
          const names = [...new Set(list.map((x) => x.vendor || x.name))];
          const past = k < today;
          const tone = !list.length ? "" : past ? "border-rose-300 bg-rose-50" : k === today ? "border-amber-300 bg-amber-50" : "border-stone-300 bg-stone-50";
          return (
            <button
              key={k}
              type="button"
              disabled={!list.length}
              onClick={() => onDay(day === k ? "" : k)}
              className={
                "flex min-h-[3.1rem] flex-col items-start rounded-lg border p-1 text-left " +
                (list.length ? tone + " hover:border-stone-500" : "border-transparent") +
                (day === k ? " ring-2 ring-rose-600" : "")
              }
            >
              <span className={"text-[11px] tabular-nums " + (k === today ? "rounded-full bg-stone-800 px-1.5 font-semibold text-white" : "text-stone-500")}>{Number(k.slice(8))}</span>
              {names.slice(0, 2).map((n) => (
                <span key={n} className={"w-full truncate text-[10px] leading-tight font-medium " + (past ? "text-rose-800" : "text-stone-700")}>
                  {n}
                </span>
              ))}
              {names.length > 2 && <span className="text-[10px] text-stone-400">외 {names.length - 2}</span>}
            </button>
          );
        })}
      </div>
      {behind > 0 && <p className="mt-2 text-xs font-medium text-rose-700">이전 달에 재요청 날짜가 지난 것 {behind}개 — 아래 목록 맨 위에 있어요.</p>}
      {day && (
        <button type="button" onClick={() => onDay("")} className="mt-2 text-xs text-stone-500 underline">
          {dayTitle(day)}만 보는 중 — 전부 보기
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 삼촌에게 보낼 픽업 목록

// 세원 10/1: "픽업 요청 모아보기 누르면 오늘 받을 상품들이 나오잖아? 삼촌한테 '그랑블루/디오트 1층 J24' 이렇게 보내거든. 쫙 정리한 내용이 딱 나왔으면."
// 거래처마다 한 줄(같은 거래처 상품이 여럿이어도 한 번), 건물·층 순서로. 위치는 상품에 적힌 것, 없으면 돈 › 거래처 주소.
function PickupList({ items, vendors }) {
  const [note, setNote] = useState("");
  const seen = new Map();
  for (const x of items) {
    const v = vendors.find((y) => y.id === x.vendorId);
    const name = v?.name || x.vendor || "거래처 없음";
    if (!seen.has(name)) seen.set(name, (x.place || v?.address || "").trim());
  }
  const lines = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko", { numeric: true })).map(([n, pl]) => (pl ? `${n}/${pl}` : n));
  const text = lines.join("\n");
  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-emerald-900">삼촌에게 보낼 픽업 목록 · 거래처 {lines.length}곳</span>
        <button type="button" onClick={async () => setNote((await copy(text)) ? "복사했어요" : "복사가 막혔어요 — 글을 끌어서 복사해 주세요")} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">
          <Copy size={12} /> 복사
        </button>
      </div>
      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-stone-800 select-all">{text}</pre>
      {note && <p className="mt-1 text-xs text-emerald-800">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 신상마켓에서 담기 안내

function ClipGuide({ onClose }) {
  const link = useRef(null);
  const [ready, setReady] = useState(false);
  // React 는 javascript: 주소를 막는다 — 그린 뒤에 직접 넣는다. 읽는 코드(clip.js)도 단추 안에 같이 넣어 둔다(불러오기가 막힐 때 쓸 것)
  useEffect(() => {
    let alive = true;
    fetch("/clip.js?t=" + Date.now(), { cache: "no-store" })
      .catch(() => fetch("/clip.js"))
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
      <SheetHead title="신마에서 한 번에 담기" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed text-stone-700">
        <p>
          신마는 밖에서 자동으로 읽어 오는 걸 막아 둬서, <b>세원님이 보고 있는 상품 화면에서 단추를 한 번 누르면</b> 그 화면의 사진·상품명·거래처·위치·가격·색상·사이즈·혼용률을 그대로 담아 오게 했어요.
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
            <b className="text-stone-900">② 신마에서 상품을 연 채로 그 즐겨찾기 누르기</b>
            <p className="mt-1 text-xs text-stone-500">
              작은 창이 뜨면서 '요청' 단계에 바로 담기고, 거래처도 돈 › 거래처와 이어져요(없으면 새로 등록). 제품 설명에 적힌 전화·카톡·인스타도 같이 넣어요 — 접혀 있으면 단추가 알아서 펼쳐서 읽어요. 창은 그대로 두고 다음 상품에서 또
              누르세요.
            </p>
          </li>
        </ol>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">폰에서는 이 단추를 쓸 수 없어요. 폰에서는 '직접 넣기'에 링크를 붙이고 캡처를 넣어 주세요.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 한 화면 흐름

const TABS = [...STAGES.map(([k, label]) => [k, label]), ["drop", "보류·드랍"], ["returns", "반납·결제 예정"], ["returned", "반납 완료"]];

export default function Pipeline({ d, online, vendors, onVendor, dealt }) {
  const today = dayKey();
  const vmap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const items = useMemo(
    () =>
      d.items.map(normalize).map((x) => {
        const v = x.vendorId && vmap.get(x.vendorId);
        return v && v.name !== x.vendor ? { ...x, vendor: v.name } : x;
      }),
    [d.items, vmap],
  );
  const [tab, setTab] = useState("request");
  const [type, setType] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [weekOnly, setWeekOnly] = useState(false);
  const [reqOnly, setReqOnly] = useState(""); // 요청 탭 모아보기: "" | "asked"(요청함) | "pickup"(픽업 요청) | "retryOn"(재요청)
  const [retryDay, setRetryDay] = useState(""); // 재요청 달력에서 고른 날 (비우면 전부)
  const [edit, setEdit] = useState(null); // {item, pay?}
  const [guide, setGuide] = useState(false);
  const [msgFor, setMsgFor] = useState(null);
  const [refuseFor, setRefuseFor] = useState(null);

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
        let v = findVendor(x.vendor, x.place, known, x.contact);
        if (!v) {
          const fill = vendorFill({ phone: "", memo: "" }, x.contact) || { phone: "", memo: "" };
          v = onVendor({ name: vendorName(x.vendor), address: x.place || "", phone: fill.phone, memo: [fill.memo, "신상 관리에서 등록"].filter(Boolean).join(" / ") });
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
        (!reqOnly || tab !== "request" || !!x[reqOnly]) &&
        (!retryDay || reqOnly !== "retryOn" || x.retryOn === retryDay) &&
        (!n || `${x.name} ${x.vendor} ${x.place} ${x.memo || ""}`.toLowerCase().includes(n)),
    );
  }, [items, tab, type, kind, q, weekOnly, weekAgo, reqOnly, retryDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // 묶음 — 요청은 거래처별(카톡을 거래처마다 보내니까), 반납·결제 예정은 기한 날짜별, 반납 완료는 반납한 날짜별
  const groups = useMemo(() => {
    const by = (keyOf, sort) => {
      const m = new Map();
      for (const x of shown) m.set(keyOf(x), [...(m.get(keyOf(x)) || []), x]);
      return [...m.entries()].sort(sort);
    };
    // 재요청 모아보기 — 재요청할 날짜별로 (지난 날짜는 빨갛게)
    if (tab === "request" && reqOnly === "retryOn")
      return by((x) => x.retryOn, (a, b) => a[0].localeCompare(b[0])).map(([day, l]) => {
        const n = daysLeft(day, today);
        const when = n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : n === 1 ? "내일" : `${n}일 뒤`;
        return { title: `${dayTitle(day)} · ${when} · ${l.length}개`, sub: [...new Set(l.map((x) => x.vendor).filter(Boolean))].join(", "), tone: n < 0 ? "text-rose-700" : n === 0 ? "text-amber-700" : "text-stone-700", list: l };
      });
    if (tab === "request")
      return by((x) => x.vendor || "거래처 없음", (a, b) => a[0].localeCompare(b[0], "ko")).map(([t, l]) => {
        const c = l.find((x) => contactLines(x.contact).length)?.contact;
        const v = vendors.find((v) => v.id === l[0].vendorId);
        const vid = l[0].vendorId;
        // 거래해 본 곳 — 매입 장부에 장끼가 있거나, 샘플이 요청 다음 단계까지 간 적이 있다
        const known = !!vid && (dealt?.has(vid) || items.some((x) => x.vendorId === vid && x.stage !== "request" && !x.refused));
        return { title: `${t} · ${l.length}`, sub: [c?.kakao && `카톡 ${c.kakao}`, c?.mobile || v?.phone || c?.tel].filter(Boolean).join(" · "), list: l, refusals: refusalsOf(d.refusals, vid, t), req: { vendorId: vid, vendor: t, place: l.find((x) => x.place)?.place || v?.address || "", phone: v?.phone || "", memo: v?.memo || "", kind: known ? "again" : "first" } };
      });
    if (tab === "returns")
      return by(dueOf, (a, b) => a[0].localeCompare(b[0])).map(([due, l]) => {
        const n = daysLeft(due, today);
        return { title: `${dayTitle(due)} · ${dueLabel(n)} · ${l.length}개`, tone: n < 0 ? "text-rose-700" : n <= 3 ? "text-amber-700" : "text-stone-600", list: l };
      });
    if (tab === "returned")
      return by((x) => x.returnedOn || x.paid?.on || "", (a, b) => b[0].localeCompare(a[0])).map(([day, l]) => ({ title: day ? `${dayTitle(day)} · ${l.length}개` : `날짜 없음 · ${l.length}개`, list: l }));
    return [{ title: "", list: shown }];
  }, [shown, tab, today, vendors, dealt, items, d.refusals, reqOnly]);

  const patch = (x) => (p) => {
    // '요청으로 되돌리기' — 잘못 누른 것이니 그 거절 기록도 지운다
    if (x.refused && p.refused === false) d.saveRefusals((v) => ({ ...v, items: (v.items || []).filter((r) => !(r.itemIds || []).includes(x.id)) }));
    return d.saveItems(upsert({ id: x.id, ...p }));
  };

  // '안 됨' — 상품(과 고르면 같은 거래처의 다른 요청 상품)을 보류·드랍으로, 이유는 거래처 기록으로
  const refuse = async ({ reasons, note, all, scope }) => {
    const x = refuseFor;
    const same = (y) => y.stage === "request" && (x.vendorId ? y.vendorId === x.vendorId : !!x.vendor && y.vendor === x.vendor);
    const targets = [x, ...(all ? items.filter((y) => y.id !== x.id && same(y)) : [])];
    const ids = targets.map((t) => t.id);
    const why = reasons.length || note ? refusalText({ reasons, note }) : "";
    await d.saveItems((val) => ({ ...val, items: (val.items || []).map((it) => (ids.includes(it.id) ? { ...it, stage: "drop", refused: true, refusedOn: today, refusedWhy: why } : it)) }));
    await d.saveRefusals((v) => ({
      ...v,
      items: [{ id: newId("r"), itemIds: ids, vendorId: x.vendorId || "", vendor: x.vendor || "", scope, reasons, note, on: today, item: targets.map((t) => t.name).join(", ") }, ...(v.items || [])],
    }));
    setRefuseFor(null);
  };

  // '카톡 글 복사' — 누르는 그 자리에서 복사를 시작하고(브라우저는 누른 순간에만 복사를 허락한다) 확인 창을 연다
  const openMsg = (g) => {
    const fresh = g.list.filter((x) => !x.asked);
    const picks = (fresh.length ? fresh : g.list).map((x) => x.id);
    const names = g.list.filter((x) => picks.includes(x.id)).map((x) => x.name || x.fullName).filter(Boolean);
    // 복사는 누른 이 순간에 시작하고(그래야 허락된다), 창은 기다리지 않고 바로 연다
    const copied = copy(requestText(d.msgs[g.req.kind], names));
    setMsgFor({ ...g.req, list: g.list, picks, copied });
  };
  const markAsked = (ids) => d.saveItems((val) => ({ ...val, items: (val.items || []).map((it) => (ids.includes(it.id) ? { ...it, asked: true, askedOn: today } : it)) }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <MousePointerClick size={16} /> 신마에서 담기
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
              <button
                type="button"
                onClick={() => {
                  setTab("request");
                  setReqOnly("retryOn");
                }}
                className="rounded-full bg-stone-800 px-2.5 py-1.5 font-semibold text-white">
                재요청할 것 {retry}
              </button>
            )}
          </span>
        )}
      </div>

      <KindMix items={items} kinds={d.tags.clothes} kind={kind} onKind={setKind} />

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
        {tab === "request" &&
          [
            ["asked", "요청함"],
            ["pickup", "픽업 요청"],
            ["retryOn", "재요청"], // 세원 10/1: "재요청 따로 모아볼 수 있는 칸" — 재요청 날짜를 적은 상품
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setReqOnly(reqOnly === k ? "" : k);
                setRetryDay("");
              }}
              aria-pressed={reqOnly === k}
              className={"rounded-full border px-3 py-1 text-xs font-medium " + (reqOnly === k ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-200 bg-white text-stone-600")}
            >
              {label} 모아보기 <span className={reqOnly === k ? "text-emerald-100" : "text-stone-400"}>{items.filter((x) => x.stage === "request" && x[k]).length}</span>
            </button>
          ))}
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

      {tab === "request" && reqOnly === "pickup" && shown.length > 0 && <PickupList items={shown} vendors={vendors} />}
      {tab === "request" && reqOnly === "retryOn" && <RetryCalendar items={items.filter((x) => x.stage === "request" && x.retryOn)} today={today} day={retryDay} onDay={setRetryDay} />}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-sm text-stone-400">
          {items.length === 0 ? "'신마에서 담기'로 샘플 요청한 상품을 모아 보세요. 담으면 '요청'에 들어오고, 단추를 누를 때마다 다음 단계로 넘어가요." : "여기에는 상품이 없어요."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.title || "all"}>
              {g.title && (
                <h3 className={"mb-1.5 flex flex-wrap items-baseline gap-x-2 px-1 text-sm font-semibold " + (g.tone || "text-stone-700")}>
                  {g.title}
                  {g.sub && <span className="text-xs font-normal text-stone-500 select-all">{g.sub}</span>}
                  {g.refusals?.length > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-rose-700">
                      <AlertTriangle size={12} /> 샘플 거절 {md(g.refusals[0].on)} · {refusalText(g.refusals[0])}
                      {g.refusals.length > 1 && ` 외 ${g.refusals.length - 1}번`}
                    </span>
                  )}
                  {g.req && (
                    <button type="button" onClick={() => openMsg(g)} className="ml-auto flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50">
                      <MessageCircle size={12} /> 카톡 글 복사
                    </button>
                  )}
                </h3>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {g.list.map((x) => (
                  <ItemCard key={x.id} x={x} url={srcOf(x, d.urls)} today={today} tab={tab} onOpen={(o) => setEdit({ item: x, pay: !!o?.pay })} onPatch={patch(x)} onRefuse={() => setRefuseFor(x)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && <ItemSheet key={edit.item.id || "new"} item={edit.item} startPay={edit.pay} d={d} online={online} vendors={vendors} onVendor={onVendor} today={today} onClose={() => setEdit(null)} />}
      {guide && <ClipGuide onClose={() => setGuide(false)} />}
      {msgFor && (
        <MsgSheet
          m={msgFor}
          msgs={d.msgs}
          onSaveMsgs={d.saveMsgs}
          onAsked={markAsked}
          onClose={() => setMsgFor(null)}
          refusals={refusalsOf(d.refusals, msgFor.vendorId, msgFor.vendor)}
          onDropRefusal={(id) => d.saveRefusals((v) => ({ ...v, items: (v.items || []).filter((r) => r.id !== id) }))}
        />
      )}
      {refuseFor && (
        <RefuseSheet
          x={refuseFor}
          others={items.filter((y) => y.id !== refuseFor.id && y.stage === "request" && (refuseFor.vendorId ? y.vendorId === refuseFor.vendorId : !!refuseFor.vendor && y.vendor === refuseFor.vendor))}
          onClose={() => setRefuseFor(null)}
          onSave={refuse}
        />
      )}
    </div>
  );
}
