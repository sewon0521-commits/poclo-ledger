// 신마 '포클로에 담기'로 넘어온 것 하나를 신상 관리에 저장 — 한 개 담기 창(ClipPage)·여러 개 담기 창(ClipBatch)이 같이 쓴다.
import { loadKey, changeKey, upsert, putPhoto } from "./shoot";
import { parseClip, normalize, findVendor, vendorFill, contactLines, refusalsOf } from "./sinsang";
import { newId } from "./id";
import { hasWear, wearSummary } from "./measure";

// 예전 단추(9/30~10/1 첫 판)는 읽는 코드가 단추 안에 박혀 있어서 고친 게 안 닿는다 — 새 단추는 v 를 같이 보낸다
export const OLD_BUTTON = "예전 '포클로에 담기' 단추예요. 즐겨찾기에서 그 단추를 지우고, 포클로ERP › 촬영 › 신상 관리 › '신마에서 담기'에서 새 단추를 다시 끌어다 놓아 주세요.";

/**
 * 넘어온 담기 하나를 저장 — 한 개 담기 창(ClipPage)·여러 개 담기 창(ClipBatch)이 같이 쓴다.
 * → {state: saved|dup|error, item, photo, note(거래처 안내), refused(그 거래처 거절 기록), msg, vendor(이은·만든 거래처)}
 */
export async function saveClip(payload, { online, vendors = [], onVendor }) {
  const p = parseClip(payload);
  const photo = p.photoData || p.photoUrl;
  const cur = (await loadKey("shoot_items", online)).items || [];
  // 상품 화면을 못 읽었으면 담지 않는다 — 옆 칸(필터)을 상품으로 잘못 담은 적이 있다. 읽은 글은 남겨서 고칠 때 본다
  if (!p.ok) {
    const seenAs = { at: new Date().toISOString(), u: payload.u, v: payload.v || 1, g: payload.g, a: payload.a, hd: payload.hd, ds: payload.ds, t: payload.t, bx: payload.bx };
    await changeKey("clip_debug", online, (v) => ({ items: [seenAs, ...(v.items || [])].slice(0, 5) })).catch(() => {});
    return { state: "error", photo, msg: payload.v ? "상품 화면을 못 읽었어요. 신마에서 상품을 눌러 상세 화면(가격·상세정보)이 보이는 상태에서 다시 눌러 주세요." : OLD_BUTTON };
  }
  // 옷감정보를 어떻게 봤는지 · 여러 개 담기에서 창을 어떻게 열고 닫았는지 — 신마 화면을 직접 못 봐서, 어긋나면 이걸 보고 고친다 (최근 5개)
  // 매장 연락처(10/14)를 어떻게 읽었는지도 — 매장 화면 주소·'매장 정보' 칸 html·아이콘 모양
  if (p.fabricProbe || payload.bx || p.storeProbe)
    changeKey("clip_probe", online, (v) => ({ items: [{ at: new Date().toISOString(), g: p.goodsId, fabric: p.fabricProbe, wear: p.wear, bx: payload.bx, store: p.storeProbe }, ...(v.items || [])].slice(0, 5) })).catch(() => {});
  const same = cur.map(normalize).find((x) => (p.goodsId ? x.goodsId === p.goodsId : p.url && x.url === p.url));
  const past = (await loadKey("sample_refusals", online).catch(() => ({}))).items || [];
  if (same) {
    // 이미 담긴 상품 — 실측·디테일컷이 비어 있으면 이번에 읽은 것으로 채운다(예전에 담은 상품을 다시 눌러 사이즈표 받기)
    const fill = {};
    if (!same.sizeText && p.sizeText) fill.sizeText = p.sizeText;
    if (same.hasDetailCut == null && p.hasDetailCut != null) fill.hasDetailCut = p.hasDetailCut;
    if (!hasWear(same.wear) && hasWear(p.wear)) Object.assign(fill, { wear: p.wear, wearFrom: "신마" });
    // 매장 정보에서 읽은 연락처로 그 거래처의 빈 칸 채우기 (10/14 — 예전에 담은 상품을 다시 눌러도 연락처가 들어오게)
    let vNote = "";
    const linked = same.vendorId && vendors.find((x) => x.id === same.vendorId);
    if (linked && onVendor && p.contact?.from) {
      const vf = vendorFill(linked, p.contact);
      if (vf) {
        onVendor({ id: linked.id, ...vf });
        vNote = `거래처 '${linked.name}' 연락처를 ${p.contact.from}에서 채웠어요: ${contactLines(p.contact).join(", ")}`;
      }
      if (!same.contact?.mobile && !same.contact?.kakao) fill.contact = { ...(same.contact || {}), ...p.contact };
    }
    if (Object.keys(fill).length) await changeKey("shoot_items", online, upsert({ id: same.id, ...fill }));
    const note = [
      fill.hasDetailCut != null || fill.sizeText || fill.wear
        ? [fill.hasDetailCut != null && `디테일컷 ${fill.hasDetailCut ? "있음" : "없음"}`, fill.sizeText && "실측", fill.wear && `착용정보(${wearSummary(fill.wear)})`].filter(Boolean).join(" · ") + "을(를) 더 담았어요"
        : "",
      vNote,
    ]
      .filter(Boolean)
      .join(" · ");
    return { state: "dup", item: { ...same, ...fill }, photo, note, refused: refusalsOf(past, same.vendorId, same.vendor) };
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
  const note = !v
    ? ""
    : (found ? `거래처 '${v.name}' 와 이었어요` : `거래처 '${v.name}' 을(를) 새로 등록했어요`) +
      (told.length
        ? found && !filled
          ? " (연락처는 이미 있어요)"
          : ` · 연락처도 넣었어요${p.contact.from ? ` (${p.contact.from}에서)` : ""}: ${told.join(", ")}`
        : " · 제품 설명·매장 정보에서 연락처를 못 찾았어요");
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
    sizeText: p.sizeText,
    hasDetailCut: p.hasDetailCut,
    ...(hasWear(p.wear) ? { wear: p.wear, wearFrom: "신마" } : {}),
    photo: key || "",
    photoUrl: key ? "" : p.photoUrl,
    memo: "",
    createdAt: new Date().toISOString(),
  };
  await changeKey("shoot_items", online, upsert(made));
  return { state: "saved", item: made, photo, note, refused: refusalsOf(past, made.vendorId, made.vendor), vendor: v || null };
}

