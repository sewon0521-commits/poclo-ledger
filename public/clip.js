// 신상마켓 '포클로에 담기' — 세원이 보고 있는 상품 화면에서 글과 사진을 읽어 ERP 작은 창으로 넘긴다.
// 즐겨찾기 단추가 이 파일을 불러온다(불러오기가 막히면 단추 안에 넣어 둔 같은 코드가 돈다) → 여기를 고치면 단추를 다시 끌어다 놓지 않아도 된다.
//
// 상품 칸 찾기 (10/1 고침): 예전엔 '₩가격과 혼용률이 같이 든 가장 작은 칸'을 찾았는데, 옆의 필터 칸(제조국·색상 필터)을
// 상품으로 잘못 읽은 적이 있다('남성의류 / 필터'). 이제는 **상세정보 표에만 있는 글자**(상품등록정보·낱장여부·혼용률)를
// 화면에 보이는 것 중에서 찾고, 거기서부터 위로 올라가며 '○층'(거래처 위치)이 들어오는 칸까지를 상품으로 본다.
window.__pocloClip = async function (w, origin) {
  var vw = innerWidth,
    vh = innerHeight;
  var seen = function (e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  var all = [].slice.call(document.querySelectorAll("body *"));
  var pick = function (re) {
    var hit = all.filter(function (e) {
      return e.children.length === 0 && re.test((e.textContent || "").trim());
    });
    var vis = hit.filter(seen);
    return (vis.length ? vis : hit).pop() || null;
  };
  var node = pick(/^상품등록정보$/) || pick(/^낱장여부$/) || pick(/^혼용률$/) || pick(/^상세정보$/);
  var P = /[₩￦]\s?[\d,]{3,}|[\d,]{4,}\s?원/,
    L = /(지하\s?)?\d+\s*층/;
  for (var k = 0; k < 14 && node && node.parentElement; k++) {
    var s = node.innerText || "";
    if (L.test(s) && (P.test(s) || k > 6)) break;
    if ((node.parentElement.innerText || "").length > 12000) break;
    node = node.parentElement;
  }
  var t = node ? node.innerText : "";
  if (!t) {
    var body = document.body.innerText,
      m = body.search(P);
    t = body.slice(Math.max(0, m - 700), m + 1500);
  }
  var imgs = [].slice
    .call(document.images)
    .filter(function (g) {
      var r = g.getBoundingClientRect();
      return g.naturalWidth >= 200 && r.width >= 120 && seen(g);
    })
    .map(function (g) {
      var r = g.getBoundingClientRect();
      // 상품 칸 안에 있는 사진을 먼저 (뒤에 깔린 목록 사진보다)
      return { s: g.currentSrc || g.src, a: r.width * r.height * (node && node.contains(g) ? 4 : 1) };
    })
    .sort(function (a, b) {
      return b.a - a.a;
    })
    .slice(0, 5)
    .map(function (x) {
      return x.s;
    });
  var d = { u: location.href, ti: document.title, t: t.slice(0, 6000), im: imgs, ph: "", v: 2 };
  try {
    if (imgs[0]) {
      var b = await (await fetch(imgs[0], { mode: "cors" })).blob();
      var bm = await createImageBitmap(b);
      var q = Math.min(1, 720 / Math.max(bm.width, bm.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bm.width * q);
      c.height = Math.round(bm.height * q);
      c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
      var du = c.toDataURL("image/jpeg", 0.72);
      if (du.length < 400000) d.ph = du;
    }
  } catch (e) {
    void e;
    /* 사진을 못 떠도 주소는 같이 간다 */
  }
  var url = origin + "/#clip=" + encodeURIComponent(JSON.stringify(d));
  if (w && !w.closed) {
    w.location.href = url;
    w.focus();
  } else {
    window.open(url, "poclo-clip", "width=470,height=760");
  }
};
window.__pocloClip(window.__pocloW, window.__pocloO);
