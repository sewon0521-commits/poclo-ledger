// 붙여넣은 사진 주소 → 사진 (10/4 세원: "레퍼런스에서 가져온 사진 복사 붙여넣기하면 넣어지게. 노션처럼 복붙하면 바로 보이게")
// 웹페이지에서 사진을 골라 복사하면 클립보드에 사진 파일이 아니라 <img src="…"> 주소만 오는 경우가 있다.
// 브라우저가 남의 사이트 사진을 직접 받으면 막혀서(CORS) 이 함수가 대신 받아 그대로 돌려준다. 사진만, 10MB 까지.
// POST {url} → 사진 바이트

const MAX = 10 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

// 사무실·서버 안쪽 주소로는 안 간다
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?fc|\[?fd)/i;

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const fail = (code, message) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "img", message }));
  };
  if (req.method !== "POST") return fail(405, "POST만 받아요.");
  let url;
  try {
    url = new URL(String(req.body?.url || ""));
  } catch {
    return fail(400, "사진 주소가 아니에요.");
  }
  if (!/^https?:$/.test(url.protocol) || PRIVATE.test(url.hostname)) return fail(400, "받을 수 없는 주소예요.");
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8", Referer: url.origin + "/" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!r.ok) return fail(422, `사진을 받지 못했어요 (${r.status}).`);
    if (!type.startsWith("image/")) return fail(422, "사진이 아닌 주소예요.");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return fail(413, "사진이 너무 커요(10MB 넘음).");
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=600");
    res.end(buf);
  } catch (e) {
    return fail(502, e?.name === "TimeoutError" ? "사진 받기가 너무 오래 걸려요." : "사진을 받지 못했어요.");
  }
}
