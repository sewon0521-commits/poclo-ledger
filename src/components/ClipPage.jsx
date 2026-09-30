import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { DEFAULT_TAGS, FIELD, md, won, loadKey, changeKey, upsert, putPhoto } from "../lib/shoot";
import { parseClip, normalize, stageName, findVendor, vendorFill, contactLines, refusalsOf, refusalText } from "../lib/sinsang";
import { newId } from "../lib/id";
import { Chips, Photo } from "./ShootBits";

/**
 * 신상마켓 '포클로에 담기' 단추가 여는 작은 창 (#clip=…, lib/sinsang.js).
 * 넘어온 글·사진을 읽어 **바로 '요청' 단계에 담는다** — 세원이 한 번에 수십 개를 담으니 확인 단추를 두지 않는다.
 * 샘플/사입 · 종류 · 이름이 다르면 이 창에서 고치면 그 자리에서 저장된다. 같은 상품(상품번호)을 또 누르면 새로 담지 않는다.
 * 제품 설명에 거래처가 적어 둔 전화·카톡·인스타는 돈 › 거래처에 같이 넣는다(있는 거래처는 빈 칸만 채운다).
 */

// 예전 단추(9/30~10/1 첫 판)는 읽는 코드가 단추 안에 박혀 있어서 고친 게 안 닿는다 — 새 단추는 v 를 같이 보낸다
const OLD_BUTTON = "예전 '포클로에 담기' 단추예요. 즐겨찾기에서 그 단추를 지우고, 포클로ERP › 촬영 › 신상 관리 › '신마에서 담기'에서 새 단추를 다시 끌어다 놓아 주세요.";
export default function ClipPage({ payload, online, vendors = [], onVendor, ready = true }) {
  const [item, setItem] = useState(null);
  const [state, setState] = useState("saving"); // saving | saved | dup | error
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState([]);
  const [photo, setPhoto] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  const [refused, setRefused] = useState([]); // 그 거래처가 예전에 샘플을 거절한 기록
  const last = useRef("");
  const seq = useRef(0);

  useEffect(() => {
    if (!ready) return; // 거래처 목록을 다 읽은 뒤에 — 안 그러면 있는 거래처를 또 만든다
    const sig = JSON.stringify([payload.u, payload.t?.slice(0, 200)]);
    if (last.current === sig) return;
    last.current = sig;
    // 같은 상품으로 두 번 불려도(개발 모드) 한 번만 담고, 더 새 담기가 시작됐으면 옛 결과는 버린다
    const run = ++seq.current;
    const alive = () => seq.current === run;
    (async () => {
      setState("saving");
      setMsg("");
      const p = parseClip(payload);
      setPhoto(p.photoData || p.photoUrl);
      try {
        const cur = (await loadKey("shoot_items", online)).items || [];
        // 상품 화면을 못 읽었으면 담지 않는다 — 옆 칸(필터)을 상품으로 잘못 담은 적이 있다. 읽은 글은 남겨서 고칠 때 본다
        if (!p.ok) {
          const seenAs = { at: new Date().toISOString(), u: payload.u, v: payload.v || 1, g: payload.g, a: payload.a, hd: payload.hd, ds: payload.ds, t: payload.t };
          await changeKey("clip_debug", online, (v) => ({ items: [seenAs, ...(v.items || [])].slice(0, 5) })).catch(() => {});
          if (!alive()) return;
          setItem(null);
          setMsg(payload.v ? "상품 화면을 못 읽었어요. 신마에서 상품을 눌러 상세 화면(가격·상세정보)이 보이는 상태에서 다시 눌러 주세요." : OLD_BUTTON);
          setState("error");
          return;
        }
        const same = cur.map(normalize).find((x) => (p.goodsId ? x.goodsId === p.goodsId : p.url && x.url === p.url));
        const past = ((await loadKey("sample_refusals", online).catch(() => ({}))).items || []);
        const warn = (vid, name) => alive() && setRefused(refusalsOf(past, vid, name));
        if (same) {
          if (!alive()) return;
          warn(same.vendorId, same.vendor);
          setItem(same);
          setState("dup");
          return;
        }
        // 사진 — 담기 단추가 떠 온 게 있으면 우리 보관함에, 없으면 신상마켓 주소 그대로
        let key = "";
        if (p.photoData) {
          try {
            key = await putPhoto(await (await fetch(p.photoData)).blob(), online);
          } catch {
            key = "";
          }
        }
        // 돈 › 거래처와 잇기 — 같은 곳이 있으면 그 이름으로, 없으면 새로 등록 (한글 이름 먼저).
        // 제품 설명의 전화·카톡·인스타도 같이 — 새 거래처는 다 넣고, 있는 거래처는 빈 칸만 채운다
        const found = findVendor(p.vendor, p.place, vendors, p.contact);
        const told = contactLines(p.contact);
        let v = found;
        let filled = false;
        if (v && onVendor) {
          const fill = vendorFill(v, p.contact);
          if (fill) {
            v = onVendor({ id: v.id, ...fill });
            filled = true;
          }
        } else if (p.vendor && onVendor) {
          const fill = vendorFill({ phone: "", memo: "" }, p.contact) || { phone: "", memo: "" };
          v = onVendor({ name: p.vendor, address: p.place || "", phone: fill.phone, memo: [fill.memo, "신상 관리에서 등록"].filter(Boolean).join(" / ") });
        }
        setVendorNote(
          !v
            ? ""
            : (found ? `거래처 '${v.name}' 와 이었어요` : `거래처 '${v.name}' 을(를) 새로 등록했어요`) +
                (told.length ? (found && !filled ? " (연락처는 이미 있어요)" : ` · 연락처도 넣었어요: ${told.join(", ")}`) : " · 제품 설명에서 연락처는 못 찾았어요"),
        );
        const made = {
          id: newId("i"),
          type: "sample",
          stage: "request",
          name: p.name,
          fullName: p.fullName,
          vendor: v?.name || p.vendor,
          vendorId: v?.id || "",
          place: p.place,
          kind: p.kind,
          price: p.price || "",
          url: p.url,
          goodsId: p.goodsId,
          colors: p.colors,
          sizes: p.sizes,
          fabric: p.fabric,
          origin: p.origin,
          contact: p.contact,
          desc: p.desc,
          photo: key || "",
          photoUrl: key ? "" : p.photoUrl,
          memo: "",
          createdAt: new Date().toISOString(),
        };
        await changeKey("shoot_items", online, upsert(made));
        if (!alive()) return;
        warn(made.vendorId, made.vendor);
        setItem(made);
        setState("saved");
        setRecent((r) => [made, ...r].slice(0, 8));
      } catch (e) {
        if (!alive()) return;
        setMsg(e.message || "담지 못했어요. 인터넷을 확인해 주세요.");
        setState("error");
      }
    })();
  }, [payload, online, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (p) => {
    const next = { ...item, ...p };
    setItem(next);
    setRecent((r) => r.map((x) => (x.id === next.id ? next : x)));
    try {
      await changeKey("shoot_items", online, upsert({ id: item.id, ...p }));
    } catch (e) {
      setMsg(e.message || "고친 걸 저장하지 못했어요.");
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-3 text-stone-800">
      <div className="mx-auto max-w-md space-y-3">
        <div
          className={
            "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold " +
            (state === "saved" ? "bg-emerald-50 text-emerald-900" : state === "dup" ? "bg-amber-50 text-amber-900" : state === "error" ? "bg-rose-50 text-rose-800" : "bg-white text-stone-600")
          }
        >
          {state === "saving" && <Loader2 size={16} className="animate-spin" />}
          {state === "saved" && <Check size={16} />}
          {(state === "dup" || state === "error") && <AlertTriangle size={16} />}
          {state === "saving" && "담는 중…"}
          {state === "saved" && "'요청'에 담았어요"}
          {state === "dup" && `이미 담긴 상품이에요 (${stageName(item?.stage)} 단계)`}
          {state === "error" && (msg || "담지 못했어요")}
        </div>

        {item && refused.length > 0 && (
          <div className="space-y-0.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            <b className="block">이 거래처는 샘플을 거절한 적이 있어요</b>
            {refused.map((r) => (
              <span key={r.id} className="block">
                {md(r.on)} · {refusalText(r)}
                {r.item && <span className="text-rose-700/70"> ({r.item})</span>}
              </span>
            ))}
          </div>
        )}
        {item && (
          <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
            <div className="flex gap-3">
              <Photo url={photo} className="aspect-[3/4] w-28 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <input key={item.id + "n"} defaultValue={item.name} onBlur={(e) => e.target.value !== item.name && patch({ name: e.target.value.trim() })} placeholder="상품명" className={FIELD + " font-semibold"} />
                <input key={item.id + "v"} defaultValue={item.vendor} onBlur={(e) => e.target.value !== item.vendor && patch({ vendor: e.target.value.trim() })} placeholder="거래처" className={FIELD} />
                <p className="text-xs text-stone-500">{[item.place, won(item.price)].filter(Boolean).join(" · ")}</p>
                <p className="line-clamp-2 text-[11px] text-stone-400">{[item.colors, item.sizes, item.fabric].filter(Boolean).join(" · ")}</p>
                {vendorNote && state === "saved" && <p className="text-[11px] text-emerald-700">{vendorNote}</p>}
              </div>
            </div>
            <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
              {[
                ["sample", "샘플"],
                ["buy", "사입"],
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => patch({ type: k })} className={"flex-1 rounded-md py-1.5 font-medium " + ((item.type || "sample") === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500")}>
                  {label}
                </button>
              ))}
            </div>
            <Chips list={DEFAULT_TAGS.clothes} value={item.kind} onChange={(v) => patch({ kind: v })} />
            <button
              type="button"
              onClick={() => patch({ asked: !item.asked })}
              aria-pressed={!!item.asked}
              className={"flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium " + (item.asked ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 text-stone-600")}
            >
              {item.asked && <Check size={14} />} 거래처에 샘플 요청함
            </button>
            {!item.price && state !== "dup" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">가격을 못 읽었어요(가격이 안 보이는 상품일 수 있어요). 신상 관리에서 상품을 눌러 적어 주세요.</p>}
          </div>
        )}
        {msg && state !== "error" && <p className="text-xs text-rose-700">{msg}</p>}
        {!payload.v && state !== "error" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{OLD_BUTTON}</p>}

        <p className="px-1 text-xs leading-relaxed text-stone-500">이 창은 그대로 두고, 신마로 돌아가 다음 상품에서 또 '포클로에 담기'를 누르세요. 여기에 이어서 담겨요.</p>

        {recent.length > 1 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="mb-1.5 text-xs font-semibold text-stone-500">방금 담은 것 {recent.length}</div>
            <ul className="space-y-1 text-sm">
              {recent.map((x) => (
                <li key={x.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {x.name} <span className="text-stone-500">/ {x.vendor}</span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-400">{won(x.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <a href={window.location.origin + "/"} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700">
          <ExternalLink size={14} /> 포클로ERP에서 보기 (촬영 › 신상 관리)
        </a>
      </div>
    </div>
  );
}
