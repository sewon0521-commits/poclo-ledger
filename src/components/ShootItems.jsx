import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Loader2, ImagePlus, Link2, Trash2, Check, ExternalLink, PackageCheck, Undo2, MousePointerClick, Send, AlertTriangle, X } from "lucide-react";
import { FIELD, md, won, upsert, remove, putPhoto } from "../lib/shoot";
import { STAGES, CHANNELS, RETURN_DAYS, stageName, normalize, dueOf, daysLeft, dueLabel, moveTo, bookmarklet } from "../lib/sinsang";
import { dayKey, shiftDay, dayTitle } from "../lib/journal";
import { newId } from "../lib/id";
import { Sheet, SheetHead, Chips, Photo } from "./ShootBits";

/**
 * 신상 관리 — 상품 한 장이 요청 → 입고·픽 → 촬영 → 등록 → 완료로 옮겨 다닌다 (lib/sinsang.js 머리말).
 * 노션에서는 단계마다 다른 쪽을 열어 같은 상품을 다시 찾았다. 여기서는 탭만 바꾸고, 다음 단계로 넘기는 단추가 카드에 바로 있다.
 * 반납 기한(입고일 + 14일)은 저절로 계산해 어느 단계에서든 카드에 보여 주고, '반납·결제' 탭에 날짜순으로 모은다.
 */

const who = () => {
  try {
    return { sewon: "세원", jiwon: "지원" }[localStorage.getItem("poclo_journal_me")] || "";
  } catch {
    return "";
  }
};

const srcOf = (x, urls) => urls[x.photo] || x.photoUrl || "";

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

function Toggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={"flex flex-1 items-center justify-center gap-1 rounded-lg border py-1 text-[11px] font-medium " + (on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-500")}
    >
      {on && <Check size={11} />} {children}
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
            tab !== x.stage && tab !== "returns" && <span className="absolute top-1.5 right-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-600">{stageName(x.stage)}</span>
          )}
          <span className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
            <DueBadge x={x} today={today} />
            {x.returning && !x.settle && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">반납 예정</span>}
            {x.packed && !x.settle && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white">포장 완료</span>}
            {x.settle && <span className="rounded-full bg-stone-800/85 px-2 py-0.5 text-[10px] font-medium text-white">{x.settle === "paid" ? "결제함" : "반납함"}</span>}
          </span>
        </span>
        <span className="block px-2.5 pt-2 pb-1.5">
          <span className="block truncate text-sm font-medium text-stone-900">
            {x.name || "이름 없음"}
            {x.vendor && <span className="font-normal text-stone-500"> / {x.vendor}</span>}
          </span>
          <span className="block truncate text-[11px] text-stone-400">{[x.place, won(x.price), x.kind].filter(Boolean).join(" · ") || "정보 없음"}</span>
          {retryDue && <span className="mt-0.5 block truncate text-[11px] font-medium text-rose-700">재요청 {md(x.retryOn)} — {x.memo || "다시 요청할 날이에요"}</span>}
          {!retryDue && x.retryOn && x.stage === "request" && <span className="mt-0.5 block truncate text-[11px] text-stone-500">재요청 {md(x.retryOn)}</span>}
          {(x.notes || []).length > 0 && <span className="mt-0.5 block truncate text-[11px] text-stone-400">💬 {x.notes[x.notes.length - 1].text}</span>}
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
              <div className="grid grid-cols-2 gap-1">
                {CHANNELS.map(([k, label]) => (
                  <Toggle key={k} on={x.channels?.[k]} onClick={act({ channels: { ...(x.channels || {}), [k]: !x.channels?.[k] } })}>
                    {label}
                  </Toggle>
                ))}
              </div>
              <button type="button" onClick={go("done")} className={MAIN + " w-full"}>
                업데이트 완료
              </button>
            </>
          )}
          {tab === "returns" && (
            <>
              <Toggle
                on={x.packed}
                onClick={act(
                  x.packed
                    ? { packed: false }
                    : { packed: true, notes: [...(x.notes || []), { by: who(), text: "포장 완료", at: new Date().toISOString() }] },
                )}
              >
                <PackageCheck size={12} /> 포장 완료
              </Toggle>
              <div className="flex gap-1">
                <button type="button" onClick={act({ settle: "returned", settledOn: today })} className={MAIN}>
                  거래처 반납
                </button>
                <button type="button" onClick={act({ settle: "paid", settledOn: today, returning: false })} className={SUB}>
                  샘플 결제
                </button>
              </div>
            </>
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

export function ItemSheet({ item, d, online, vendors, today, onClose }) {
  const [x, setX] = useState({ ...EMPTY, ...item });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const set = (patch) => setX((p) => ({ ...p, ...patch }));
  const sample = x.type !== "buy";
  const due = dueOf(x);

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
  const save = async (extra = {}) => {
    await d.saveItems(upsert({ ...x, ...extra, id: x.id || newId("i"), createdAt: x.createdAt || new Date().toISOString() }));
    onClose();
  };
  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    setNote("");
    const notes = [...(x.notes || []), { by: who(), text, at: new Date().toISOString() }];
    set({ notes });
    if (x.id) d.saveItems(upsert({ id: x.id, notes }));
  };

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
            <div className="grid gap-2 sm:grid-cols-2">
              <Label title="상품명 (거래처 상품명)">
                <input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 코듀로이반팬츠" className={FIELD} />
              </Label>
              <Label title="거래처">
                <input value={x.vendor} onChange={(e) => set({ vendor: e.target.value })} list="sinsang-vendors" placeholder="예: 플랫유" className={FIELD} />
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
            <div className="space-y-1">
              <span className="text-xs font-semibold text-stone-500">종류</span>
              <Chips list={d.tags.clothes} value={x.kind} onChange={(v) => set({ kind: v })} />
            </div>

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
                  <input value={x.arrivedOpts || ""} onChange={(e) => set({ arrivedOpts: e.target.value })} placeholder="예: S 진청, 흑청" className={FIELD} />
                </Label>
                {sample && (
                  <Label title={`반납까지 며칠 (기본 ${RETURN_DAYS}일)`}>
                    <input value={x.returnDays || ""} onChange={(e) => set({ returnDays: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder={String(RETURN_DAYS)} className={FIELD} />
                  </Label>
                )}
                <Label title="촬영 예정일">
                  <input type="date" value={x.shootDate || ""} onChange={(e) => set({ shootDate: e.target.value })} className={FIELD} />
                </Label>
                <Label title="사입가">
                  <input value={x.buyPrice || ""} onChange={(e) => set({ buyPrice: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="비우면 도매가" className={FIELD} />
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
                <div className="flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
                  <Toggle on={x.returning} onClick={() => set({ returning: !x.returning })}>
                    반납 등록
                  </Toggle>
                  <Toggle on={x.packed} onClick={() => set({ packed: !x.packed })}>
                    포장 완료
                  </Toggle>
                  <Toggle on={x.settle === "returned"} onClick={() => set(x.settle === "returned" ? { settle: null } : { settle: "returned", settledOn: today })}>
                    거래처 반납함
                  </Toggle>
                  <Toggle on={x.settle === "paid"} onClick={() => set(x.settle === "paid" ? { settle: null } : { settle: "paid", settledOn: today })}>
                    샘플 결제함
                  </Toggle>
                </div>
              )}
            </div>

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

            {x.id && (
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="mb-1.5 text-xs font-semibold text-stone-500">댓글</div>
                <ul className="space-y-1">
                  {(x.notes || []).map((n, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="shrink-0 text-xs font-semibold text-stone-700">{n.by || "—"}</span>
                      <span className="min-w-0 flex-1 text-stone-700">{n.text}</span>
                      <span className="shrink-0 text-[11px] text-stone-400">{md(String(n.at).slice(0, 10))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-1.5">
                  <input value={note} onChange={(e) => setNote(e.target.value)} onKeyUp={(e) => e.key === "Enter" && addNote()} placeholder="댓글 (엔터) — 예: 포장 완료" className={FIELD} />
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
        <button type="button" disabled={busy || !(x.name.trim() || x.photo || x.url.trim())} onClick={() => save()} className="rounded-xl bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-stone-300">
          저장
        </button>
      </footer>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 신상마켓에서 담기 안내

function ClipGuide({ onClose }) {
  const link = useRef(null);
  // React 는 javascript: 주소를 막는다 — 그린 뒤에 직접 넣는다
  useEffect(() => {
    link.current?.setAttribute("href", bookmarklet(window.location.origin));
  }, []);
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="신상마켓에서 한 번에 담기" onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed text-stone-700">
        <p>
          신상마켓은 밖에서 자동으로 읽어 오는 걸 막아 둬서, <b>세원님이 보고 있는 상품 화면에서 단추를 한 번 누르면</b> 그 화면의 사진·상품명·거래처·위치·가격·색상·사이즈·혼용률을 그대로 담아 오게 했어요. (캡처해서 붙이던 걸 대신해요)
        </p>
        <ol className="space-y-3">
          <li className="rounded-xl border border-stone-200 p-3">
            <b className="text-stone-900">① 처음 한 번 — 아래 단추를 즐겨찾기 막대로 끌어다 놓기</b>
            <p className="mt-1 text-xs text-stone-500">즐겨찾기 막대가 안 보이면 크롬에서 Ctrl + Shift + B.</p>
            <a
              ref={link}
              onClick={(e) => e.preventDefault()}
              className="mt-2 inline-flex cursor-grab items-center gap-1.5 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow active:cursor-grabbing"
            >
              <MousePointerClick size={15} /> 포클로에 담기
            </a>
          </li>
          <li className="rounded-xl border border-stone-200 p-3">
            <b className="text-stone-900">② 신상마켓에서 상품을 연 채로 그 즐겨찾기 누르기</b>
            <p className="mt-1 text-xs text-stone-500">작은 창이 뜨면서 '요청' 단계에 바로 담겨요. 샘플/사입, 종류가 다르면 그 창에서 고치면 돼요. 창은 그대로 두고 다음 상품에서 또 누르세요.</p>
          </li>
        </ol>
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          폰에서는 이 단추를 쓸 수 없어요. 폰에서는 '직접 넣기'에 링크를 붙이고 캡처를 넣어 주세요. 처음 담아 보고 상품명·거래처가 엉뚱하게 들어가면 알려 주세요 — 신상마켓 화면에 맞춰 고칠게요.
        </p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 한 화면 흐름

const TABS = [...STAGES.map(([k, label]) => [k, label]), ["returns", "반납·결제"], ["drop", "보류·드랍"]];

export default function Pipeline({ d, online, vendors }) {
  const today = dayKey();
  const items = useMemo(() => d.items.map(normalize), [d.items]);
  const [tab, setTab] = useState("request");
  const [type, setType] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [weekOnly, setWeekOnly] = useState(false);
  const [edit, setEdit] = useState(null);
  const [guide, setGuide] = useState(false);

  const inTab = (x, t) => (t === "returns" ? !!dueOf(x) : x.stage === t);
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

  // 묶음 — 요청은 거래처별(카톡을 거래처마다 보내니까), 반납·결제는 기한 날짜별, 나머지는 한 덩어리
  const groups = useMemo(() => {
    if (tab === "request") {
      const m = new Map();
      for (const x of shown) m.set(x.vendor || "거래처 없음", [...(m.get(x.vendor || "거래처 없음") || []), x]);
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko")).map(([title, list]) => ({ title: `${title} · ${list.length}`, list }));
    }
    if (tab === "returns") {
      const m = new Map();
      for (const x of [...shown].sort((a, b) => dueOf(a).localeCompare(dueOf(b)))) m.set(dueOf(x), [...(m.get(dueOf(x)) || []), x]);
      return [...m.entries()].map(([due, list]) => {
        const n = daysLeft(due, today);
        return { title: `${dayTitle(due)} · ${dueLabel(n)} · ${list.length}개`, tone: n < 0 ? "text-rose-700" : n <= 3 ? "text-amber-700" : "text-stone-600", list };
      });
    }
    return [{ title: "", list: shown }];
  }, [shown, tab, today]);

  const patch = (x) => (p) => d.saveItems(upsert({ id: x.id, ...p }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGuide(true)} className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2.5 text-sm font-semibold text-white">
          <MousePointerClick size={16} /> 신상마켓에서 담기
        </button>
        <button type="button" onClick={() => setEdit({})} className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700">
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
          ? `입고일 + ${RETURN_DAYS}일로 반납 기한을 저절로 계산해요. 포장하면 '포장 완료', 보냈으면 '거래처 반납', 사기로 했으면 '샘플 결제'.`
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
          {items.length === 0 ? "'신상마켓에서 담기'로 샘플 요청한 상품을 모아 보세요. 담으면 '요청'에 들어오고, 단추를 누를 때마다 다음 단계로 넘어가요." : "이 단계에는 상품이 없어요."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.title || "all"}>
              {g.title && <h3 className={"mb-1.5 px-1 text-sm font-semibold " + (g.tone || "text-stone-700")}>{g.title}</h3>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {g.list.map((x) => (
                  <ItemCard key={x.id} x={x} url={srcOf(x, d.urls)} today={today} tab={tab} onOpen={() => setEdit(x)} onPatch={patch(x)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {edit && <ItemSheet item={edit} d={d} online={online} vendors={vendors} today={today} onClose={() => setEdit(null)} />}
      {guide && <ClipGuide onClose={() => setGuide(false)} />}
    </div>
  );
}
