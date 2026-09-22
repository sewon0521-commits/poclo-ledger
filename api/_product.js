// 카페24 상품 페이지 읽기 — 릴스 기획(api/reels.js)과 캐러셀 기획(api/carousel.js)이 같이 쓴다.
// 파일 이름이 _ 로 시작하면 Vercel 이 서버 함수로 만들지 않는다(함께 쓰는 코드 자리).

/** 판매페이지 HTML에서 사람이 읽는 글만 남긴다. 태그·스크립트·스타일은 버린다. */
export function htmlToText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * 카페24 상품 페이지에서 필요한 것만 뽑는다.
 *
 * 페이지 전체를 글자로 만들면 **메뉴가 절반**이라(카테고리 목록이 서너 번 반복된다)
 * 정작 상품 얘기가 묻힌다. 그래서 세 군데만 본다:
 *   og:title / og:description  상품명과 요약설명
 *   #span_product_price_text   판매가 (정가는 span_product_price_custom)
 *   #prdDetail 이후            MD코멘트·색상·소재·사이즈·착용정보 — 우리가 등록할 때 넣은 글
 * '배송정보' 뒤는 모든 상품이 같은 안내문이라 자른다.
 *
 * images: 상세페이지 사진 주소들(캐러셀 기획이 "몇 번 사진을 쓸지" 고르게 Claude 에게 보여준다).
 *   MODEL INFO·배송안내 같은 고정 이미지는 빼고, 앞에서부터.
 */
export async function readProduct(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (poclo-ledger content planner)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`상품 페이지를 못 읽었어요 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 카페24 몰은 보통 UTF-8이지만 EUC-KR인 페이지도 있다
  const head = buf.slice(0, 2048).toString("latin1").toLowerCase();
  const enc = /charset=["']?(euc-kr|ks_c_5601-1987|cp949)/.test(head) ? "euc-kr" : "utf-8";
  const html = new TextDecoder(enc).decode(buf);

  const og = (k) =>
    (html.match(new RegExp(`<meta[^>]+property=["']og:${k}["'][^>]+content=["']([^"']*)`, "i")) ||
      [])[1] || "";
  const pick = (id) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)`, "i"));
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };

  const detailPart = (html.match(/id=["']prdDetail["']([\s\S]*)$/i) || [])[1] || html;
  let detail = htmlToText(detailPart);
  const cut = detail.search(/배송정보\s*\/?\s*결제정보|교환\s*\/?\s*반품/);
  if (cut > 200) detail = detail.slice(0, cut);

  const base = new URL(url);
  const abs = (u) => {
    try {
      return new URL(u.startsWith("//") ? base.protocol + u : u, base).href;
    } catch {
      return "";
    }
  };
  const seen = new Set();
  const images = [];
  const cover = og("image");
  if (cover) images.push(abs(cover));
  for (const m of detailPart.matchAll(/<img[^>]+(?:ec-data-src|data-src|src)=["']([^"']+)["']/gi)) {
    const u = abs(m[1]);
    if (!u || seen.has(u) || !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u)) continue;
    if (/icon|btn|blank|model_info|delivery|배송|쿠폰|banner/i.test(u)) continue;
    seen.add(u);
    images.push(u);
    if (images.length >= 14) break;
  }

  const title = og("title").replace(/\s*-\s*포클로\s*$/, "").trim();
  return {
    title,
    summary: og("description"),
    price: pick("span_product_price_text"),
    listPrice: pick("span_product_price_custom"),
    text: detail.slice(0, 9000),
    images: [...new Set(images)],
  };
}
