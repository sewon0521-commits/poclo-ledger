// 룩 카드용 작은 도우미 (화면 파일에 두면 fast refresh 가 안 걸린다)
import { newId } from "./id";

/** 상품명 앞의 [1+1/당일배송] 같은 머리말을 뗀다 */
export const shortName = (name) => String(name || "").replace(/^\[[^\]]*\]\s*/, "");

/** 빈 룩 하나 */
export const emptyLook = (products = []) => ({ id: newId("lk"), products });
