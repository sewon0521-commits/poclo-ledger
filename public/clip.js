// 신상마켓 '포클로에 담기' — 세원이 보고 있는 상품 화면에서 글과 사진을 읽어 ERP 작은 창으로 넘긴다.
// 즐겨찾기 단추가 이 파일을 불러온다(불러오기가 막히면 단추 안에 넣어 둔 같은 코드가 돈다) → 여기를 고치면 단추를 다시 끌어다 놓지 않아도 된다.
//
// 상품 칸 찾기 (10/1 세 번째 판): 신상마켓은 상품을 누르면 **목록 위에 창이 뜨고 주소에 modalGid=상품번호** 가 붙는다.
// 그 상품번호는 상품명 바로 아래에도 적혀 있다 → **그 글자를 찾아 거기서부터 위로** 올라가며 '○층'(거래처 위치)과 가격이 들어오는 칸까지를 상품으로 본다.
// 번호가 주소에 없으면(찜 목록 등) 상세정보 표에만 있는 글자(상품등록정보·낱장여부·혼용률)에서 시작한다.
// 예전 판은 '가격 + 제조국이 든 가장 작은 칸'을 찾다가 뒤에 깔린 **필터 칸**을 상품으로 읽었다('남성의류 / 필터').
//
// 제품 설명: 거래처가 전화·카톡·인스타를 적어 두는 칸인데 접혀 있을 때가 있다 → 접혀 있으면 한 번 눌러 펼쳐서 읽는다(세원이 누르는 것과 같다).
window.__pocloClip = async function (w, origin) {
  var vw = innerWidth,
    vh = innerHeight;
  var P = /[₩￦]\s?[\d,]{3,}|[\d,]{4,}\s?원/,
    L = /(지하\s?)?\d+\s*층/,
    STOP = /^(상세정보|세탁 및 상품 주의사항|제품 설명|재고문의|연관 추천 상품)$|^상품 문의\s*(\(\d+\))?$|^총 금액/;
  var gid = (location.href.match(/(?:modalGid|gid|goodsId)=(\d{6,11})/i) || location.pathname.match(/\/goods\/(\d{6,11})/) || [])[1] || "";
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };
  var seen = function (e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  // 그 요소가 직접 가진 글 (자식 요소의 글은 빼고)
  var own = function (e) {
    var s = "";
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, " ").trim();
  };
  // 그 글자가 적힌 요소 — 화면에 보이는 것 먼저, 여럿이면 맨 뒤(위에 뜬 창이 보통 뒤에 있다)
  var leaf = function (text) {
    var hit = [].slice.call(document.querySelectorAll("body *")).filter(function (e) {
      return own(e) === text;
    });
    var vis = hit.filter(seen);
    return (vis.length ? vis : hit).pop() || null;
  };
  var linesOf = function (t) {
    return String(t || "")
      .split("\n")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  };
  // 글에서 '제품 설명' 아래 ~ 다음 작은 제목 전까지
  var descOf = function (t) {
    var ls = linesOf(t),
      from = gid ? ls.indexOf(gid) : -1,
      i = -1;
    for (var k = from + 1; k < ls.length; k++)
      if (ls[k] === "제품 설명") {
        i = k;
        break;
      }
    if (i < 0) return [];
    var out = [];
    // 글자·숫자가 없는 줄(접고 펴는 +, — 표시)은 글로 치지 않는다
    for (var j = i + 1; j < ls.length && !STOP.test(ls[j]); j++) if (/[0-9A-Za-z가-힣]/.test(ls[j])) out.push(ls[j]);
    return out;
  };

  var find = function () {
    var tries = [gid, "상품등록정보", "낱장여부", "혼용률", "상세정보"],
      a = null,
      how = "";
    for (var i = 0; i < tries.length && !a; i++)
      if (tries[i]) {
        a = leaf(tries[i]);
        how = i === 0 ? "번호" : tries[i];
      }
    if (!a) return { node: null, how: "기준 글자 없음", ok: false };
    var node = a,
      ok = false;
    for (var k = 0; k < 25; k++) {
      var s = node.innerText || "";
      if (L.test(s) && P.test(s)) {
        ok = true;
        break;
      }
      var p = node.parentElement;
      if (!p || p === document.body || (p.innerText || "").length > 20000) break;
      node = p;
    }
    // 상세정보 표까지 들어오게 조금 더 올라간다 (너무 커지면 그만)
    var need = leaf("상세정보");
    for (var j = 0; ok && need && j < 5 && !node.contains(need); j++) {
      var q = node.parentElement;
      if (!q || q === document.body || (q.innerText || "").length > 12000) break;
      node = q;
    }
    return { node: node, how: how, ok: ok };
  };

  var r = find();
  // 제품 설명 — 접혀 있으면 펼친다. 이미 펼쳐져 있으면(글이 보이면) 건드리지 않는다
  var ds = [];
  var head = leaf("제품 설명");
  var scopeText = function () {
    var sc = head;
    while (sc && sc !== document.body && !(r.node && sc.contains(r.node))) sc = sc.parentElement;
    return sc && sc !== document.body ? sc.innerText || "" : r.node ? r.node.innerText || "" : "";
  };
  if (head && r.node) {
    ds = descOf(scopeText());
    if (!ds.length) {
      head.click();
      for (var i = 0; i < 15 && !ds.length; i++) {
        await sleep(100);
        head = leaf("제품 설명") || head;
        r = find();
        ds = descOf(scopeText());
      }
    }
  }

  var node = r.node;
  var t = node ? node.innerText || "" : "";
  if (!r.ok) {
    // 칸을 못 찾았다 — 화면 글에서 상품번호(없으면 마지막 '상세정보') 둘레를 통째로 보낸다. 읽는 쪽이 번호 줄을 기준으로 다시 찾는다
    var body = document.body.innerText || "",
      m = gid ? body.indexOf("\n" + gid) : -1;
    if (m < 0) m = body.lastIndexOf("상세정보");
    if (m >= 0) t = body.slice(Math.max(0, m - 600), m + 3000);
  }
  // 상품 창 — 큰 사진이 들어올 때까지 위로 (사진은 글 칸 옆에 있다)
  var box = node;
  for (var b = 0; box && b < 6; b++) {
    var big = [].slice.call(box.querySelectorAll("img")).some(function (g) {
      return g.getBoundingClientRect().width >= 250;
    });
    if (big || !box.parentElement || box.parentElement === document.body) break;
    box = box.parentElement;
  }
  // 창 맨 위의 갈래(여성 > 미디/롱스커트) — 글이 조금만 늘어나는 동안만 더 올라가 그 머리글을 읽는다
  var top = box;
  for (var u = 0; top && u < 4; u++) {
    var up = top.parentElement;
    if (!up || up === document.body || (up.innerText || "").length > (top.innerText || "").length + 300) break;
    top = up;
  }
  var imgs = [].slice
    .call(document.images)
    .filter(function (g) {
      var rc = g.getBoundingClientRect();
      return g.naturalWidth >= 200 && rc.width >= 120 && seen(g);
    })
    .map(function (g) {
      var rc = g.getBoundingClientRect();
      // 상품 창 안에 있는 사진을 먼저 (뒤에 깔린 목록 사진보다)
      return { s: g.currentSrc || g.src, a: rc.width * rc.height * (box && box.contains(g) ? 4 : 1) };
    })
    .sort(function (x, y) {
      return y.a - x.a;
    })
    .slice(0, 5)
    .map(function (x) {
      return x.s;
    });
  // 디테일컷 (10/6 세원: "디테일컷 버튼이 있으면 눌러서 사이즈표가 나와") — 사이즈표는 거래처가 올린 디테일컷 사진에 있을 때가 많다.
  // 글·대표 사진을 다 읽은 뒤에 눌러 보고, 그때 보이는(새로 나온) 사진들을 같이 보낸다 → 상품 창에서 사이즈표를 고른다.
  // 화면 구조를 아직 못 봐서(자동 접속을 막아 둠) 무엇을 봤는지 dcp 로 같이 보낸다 — 어긋나면 그걸 보고 고친다.
  var dc = [],
    dcp = null;
  try {
    var srcOf = function (g) {
      return g.currentSrc || g.src || (g.dataset && (g.dataset.src || g.dataset.lazySrc)) || "";
    };
    var photoish = function (g) {
      var s = srcOf(g);
      return /^https?:/.test(s) && !(g.naturalWidth && g.naturalWidth < 150) && !/\.svg|icon|logo|sprite/i.test(s);
    };
    var inBox = function () {
      var seenS = {};
      return [].slice
        .call((box || document).querySelectorAll("img"))
        .filter(photoish)
        .map(srcOf)
        .filter(function (s) {
          return seenS[s] ? false : (seenS[s] = 1);
        });
    };
    var visBig = function () {
      return [].slice
        .call(document.images)
        .filter(function (g) {
          return photoish(g) && seen(g) && g.getBoundingClientRect().width >= 150;
        })
        .map(srcOf);
    };
    var btn = [].slice
      .call(document.querySelectorAll("body *"))
      .filter(function (e) {
        return own(e).replace(/\s/g, "") === "디테일컷" && seen(e);
      })
      .pop();
    if (btn) {
      var hit = btn.closest("button, a, [role=button]") || btn;
      var href = hit.tagName === "A" ? hit.getAttribute("href") || "" : "";
      var leaves = href && !/^(#|javascript:)/i.test(href) && hit.target !== "_blank";
      var before = inBox();
      if (!leaves) {
        hit.click();
        await sleep(900);
      }
      var after = visBig();
      var nowBox = inBox();
      // 'N / M' 쪽수 — 디테일컷이 몇 번째 사진부터인지
      var pg = null;
      [].slice.call((box || document.body).querySelectorAll("*")).some(function (e) {
        var m = own(e).match(/^(\d+)\s*\/\s*(\d+)$/);
        if (m && seen(e)) pg = [+m[1], +m[2]];
        return !!pg;
      });
      var pick = [];
      if (pg && nowBox.length === pg[1] && pg[0] > 1) pick = nowBox.slice(pg[0] - 1);
      var add = function (s) {
        if (s && s !== imgs[0] && pick.indexOf(s) < 0) pick.push(s);
      };
      after.forEach(add);
      nowBox
        .filter(function (s) {
          return before.indexOf(s) < 0;
        })
        .forEach(add);
      dc = pick.slice(0, 15);
      dcp = { tag: hit.tagName, leaves: !!leaves, before: before.length, box: nowBox.length, vis: after.length, pg: pg, n: dc.length, html: (hit.parentElement || hit).outerHTML.slice(0, 500) };
    }
  } catch (e) {
    dcp = { err: String(e).slice(0, 200) };
  }
  var d = {
    u: location.href,
    ti: document.title,
    t: t.slice(0, 6000),
    im: imgs,
    ph: "",
    v: 3,
    g: gid,
    a: r.how + (r.ok ? "" : " · 칸 못 찾음"),
    ds: ds.join("\n").slice(0, 1500),
    hd: top ? (top.innerText || "").slice(0, 200) : "",
    dc: dc,
    dcp: dcp,
  };
  try {
    if (imgs[0]) {
      var bl = await (await fetch(imgs[0], { mode: "cors" })).blob();
      var bm = await createImageBitmap(bl);
      var sc = Math.min(1, 720 / Math.max(bm.width, bm.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bm.width * sc);
      c.height = Math.round(bm.height * sc);
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
