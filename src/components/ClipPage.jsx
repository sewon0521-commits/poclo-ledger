import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { DEFAULT_TAGS, FIELD, won, loadKey, changeKey, upsert, putPhoto } from "../lib/shoot";
import { parseClip, normalize, stageName } from "../lib/sinsang";
import { newId } from "../lib/id";
import { Chips, Photo } from "./ShootBits";

/**
 * 신상마켓 '포클로에 담기' 단추가 여는 작은 창 (#clip=…, lib/sinsang.js).
 * 넘어온 글·사진을 읽어 **바로 '요청' 단계에 담는다** — 세원이 한 번에 수십 개를 담으니 확인 단추를 두지 않는다.
 * 샘플/사입 · 종류 · 이름이 다르면 이 창에서 고치면 그 자리에서 저장된다. 같은 상품(상품번호)을 또 누르면 새로 담지 않는다.
 */
export default function ClipPage({ payload, online }) {
  const [item, setItem] = useState(null);
  const [state, setState] = useState("saving"); // saving | saved | dup | error
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState([]);
  const [photo, setPhoto] = useState("");
  const last = useRef("");
  const seq = useRef(0);

  useEffect(() => {
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
        const same = cur.map(normalize).find((x) => (p.goodsId && x.goodsId === p.goodsId) || (p.url && x.url === p.url));
        if (same) {
          if (!alive()) return;
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
        const made = {
          id: newId("i"),
          type: "sample",
          stage: "request",
          name: p.name,
          fullName: p.fullName,
          vendor: p.vendor,
          place: p.place,
          kind: p.kind,
          price: p.price || "",
          url: p.url,
          goodsId: p.goodsId,
          colors: p.colors,
          sizes: p.sizes,
          fabric: p.fabric,
          origin: p.origin,
          photo: key || "",
          photoUrl: key ? "" : p.photoUrl,
          memo: "",
          createdAt: new Date().toISOString(),
        };
        await changeKey("shoot_items", online, upsert(made));
        if (!alive()) return;
        setItem(made);
        setState("saved");
        setRecent((r) => [made, ...r].slice(0, 8));
      } catch (e) {
        if (!alive()) return;
        setMsg(e.message || "담지 못했어요. 인터넷을 확인해 주세요.");
        setState("error");
      }
    })();
  }, [payload, online]);

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

        {item && (
          <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
            <div className="flex gap-3">
              <Photo url={photo} className="aspect-[3/4] w-28 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <input key={item.id + "n"} defaultValue={item.name} onBlur={(e) => e.target.value !== item.name && patch({ name: e.target.value.trim() })} placeholder="상품명" className={FIELD + " font-semibold"} />
                <input key={item.id + "v"} defaultValue={item.vendor} onBlur={(e) => e.target.value !== item.vendor && patch({ vendor: e.target.value.trim() })} placeholder="거래처" className={FIELD} />
                <p className="text-xs text-stone-500">{[item.place, won(item.price)].filter(Boolean).join(" · ") || "위치·가격을 못 읽었어요"}</p>
                <p className="line-clamp-2 text-[11px] text-stone-400">{[item.colors, item.sizes, item.fabric].filter(Boolean).join(" · ")}</p>
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
            {(!item.name || !item.vendor || !item.price) && state !== "dup" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                못 읽은 칸이 있어요. 상품 화면이 다 뜬 뒤에 눌렀는지 봐 주세요. 계속 그러면 이 창을 캡처해서 알려 주세요.
              </p>
            )}
          </div>
        )}
        {msg && state !== "error" && <p className="text-xs text-rose-700">{msg}</p>}

        <p className="px-1 text-xs leading-relaxed text-stone-500">이 창은 그대로 두고, 신상마켓으로 돌아가 다음 상품에서 또 '포클로에 담기'를 누르세요. 여기에 이어서 담겨요.</p>

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
