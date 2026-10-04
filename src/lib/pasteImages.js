// 붙여넣기·끌어다 놓기에서 사진 꺼내기 (10/4 세원: "레퍼런스에서 가져온 사진 복사 붙여넣기하면 넣어지게. 노션처럼 복붙하면 바로 보이게")
//
// 클립보드에 오는 모양이 셋이다:
//   ① 사진 파일 — 캡처(Win+Shift+S), 사진 위 오른쪽 클릭 '이미지 복사', 탐색기에서 복사
//   ② <img src="…"> — 웹페이지에서 사진을 글과 같이 골라 복사(Ctrl+C), 노션·쇼핑몰 화면 복사
//   ③ 사진 주소 글자 — '이미지 주소 복사'
// ①은 그대로 쓰고, ②③은 주소를 사진으로 받아 온다(남의 사이트 사진은 브라우저가 직접 못 받아서 서버 /api/img 가 대신).

const IMG_URL = /^https?:\/\/\S+?\.(?:jpe?g|png|webp|gif|avif|bmp)(?:[?#]\S*)?$/i;

/** 클립보드·끌어다 놓기 데이터 → {files, urls} */
export function clipImages(dt) {
  if (!dt) return { files: [], urls: [] };
  const files = [...(dt.files || [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) return { files, urls: [] };
  const html = dt.getData?.("text/html") || "";
  const urls = [...html.matchAll(/<img[^>]+?src=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const text = (dt.getData?.("text/plain") || dt.getData?.("text/uri-list") || "").trim();
  if (!urls.length) for (const t of text.split(/\s+/)) if (IMG_URL.test(t) || t.startsWith("data:image/")) urls.push(t);
  return { files: [], urls: [...new Set(urls)].filter((u) => /^(https?:|data:image\/)/i.test(u)).slice(0, 20) };
}

/** 붙여넣기에 사진이 들어 있나 */
export const hasImages = (dt) => {
  const c = clipImages(dt);
  return c.files.length + c.urls.length > 0;
};

/** 주소 → 사진 파일 (못 받은 건 뺀다) */
export async function urlsToFiles(urls) {
  const out = [];
  for (const u of urls) {
    try {
      let blob;
      if (u.startsWith("data:")) blob = await (await fetch(u)).blob();
      else if (new URL(u).origin === location.origin || /supabase\.co$/.test(new URL(u).hostname)) blob = await (await fetch(u)).blob();
      else {
        // 남의 사이트 사진은 브라우저가 직접 못 받는다(CORS) — 서버가 대신
        const r = await fetch("/api/img", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
        if (!r.ok) continue;
        blob = await r.blob();
      }
      if (blob?.type.startsWith("image/")) out.push(new File([blob], "붙여넣은 사진", { type: blob.type }));
    } catch {
      /* 이 장은 건너뛴다 */
    }
  }
  return out;
}

/**
 * clipImages 결과 → 사진 파일들. ⚠ 클립보드(dt)는 붙여넣기 이벤트가 끝나면 비워지므로
 * clipImages(e.clipboardData) 는 이벤트 안에서 바로 부르고, 이건 그 결과로 부른다.
 */
export const filesOf = (c) => (c.files.length ? Promise.resolve(c.files) : urlsToFiles(c.urls));
