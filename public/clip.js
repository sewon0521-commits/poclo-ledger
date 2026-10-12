// 신상마켓 '포클로에 담기' — 세원이 보고 있는 상품 화면에서 글과 사진을 읽어 ERP 작은 창으로 넘긴다.
// 즐겨찾기 단추가 이 파일을 불러온다(불러오기가 막히면 단추 안에 넣어 둔 같은 코드가 돈다) → 여기를 고치면 단추를 다시 끌어다 놓지 않아도 된다.
//
// 상품 칸 찾기 (10/1 세 번째 판): 신상마켓은 상품을 누르면 **목록 위에 창이 뜨고 주소에 modalGid=상품번호** 가 붙는다.
// 그 상품번호는 상품명 바로 아래에도 적혀 있다 → **그 글자를 찾아 거기서부터 위로** 올라가며 '○층'(거래처 위치)과 가격이 들어오는 칸까지를 상품으로 본다.
// 번호가 주소에 없으면(찜 목록 등) 상세정보 표에만 있는 글자(상품등록정보·낱장여부·혼용률)에서 시작한다.
// 예전 판은 '가격 + 제조국이 든 가장 작은 칸'을 찾다가 뒤에 깔린 **필터 칸**을 상품으로 읽었다('남성의류 / 필터').
//
// 제품 설명: 거래처가 전화·카톡·인스타를 적어 두는 칸인데 접혀 있을 때가 있다 → 접혀 있으면 한 번 눌러 펼쳐서 읽는다(세원이 누르는 것과 같다).
window.__pocloRead = async function () {
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
  // 디테일컷 (10/8 세원: "디테일컷 버튼이 있는지 없는지만 판단해 줘") — 누르지 않고, 상품 창에 '디테일컷' 글자 단추가 있는지만 본다.
  // 상품 창(box) 안에서 찾고(뒤 목록에 같은 글자가 있어도 안 섞이게), 창을 못 찾았으면 화면에 보이는 것만.
  var hasDc = false;
  try {
    var pool = box ? box.querySelectorAll("*") : document.querySelectorAll("body *");
    hasDc = [].slice.call(pool).some(function (e) {
      var r = e.getBoundingClientRect();
      return own(e).replace(/\s/g, "") === "디테일컷" && r.width > 0 && r.height > 0 && (box ? true : seen(e));
    });
  } catch (e) {
    void e;
  }
  // 옷감정보 (10/8 세원: "계절감·신축성·두께감·촉감 — 신마 '세탁 및 상품 주의사항' 옷감정보에 있어. 담을 때 긁어와지게").
  // 그 칸이 접혀 있으면 한 번 눌러 편다(제품 설명과 같은 방식). 줄마다 이름(두께감·신축성·계절…)과 선택지가 있고 고른 것만 표시가 다르다 →
  // 표시(aria·class 의 on/active/selected/checked, 체크 입력)를 먼저 보고, 없으면 글자색·굵기·바탕이 혼자 다른 것을 고른 것으로 본다.
  // 신마 화면을 직접 못 봐서 무엇을 봤는지 ok.probe 로 같이 보낸다 — 어긋나면 그걸 보고 고친다.
  var ok = null;
  try {
    var LABELS = { 두께감: "두께감", 두께: "두께감", 신축성: "신축성", 신축: "신축성", 계절: "계절감", 계절감: "계절감", 시즌: "계절감", 촉감: "촉감", 비침: "비침", 안감: "안감" };
    var wh = leaf("세탁 및 상품 주의사항");
    var fabricText = function () {
      var sc = wh;
      for (var q = 0; sc && q < 4 && !/옷감|두께|신축|계절/.test(sc.innerText || ""); q++) sc = sc.parentElement;
      return sc ? sc.innerText || "" : "";
    };
    if (wh && !/옷감|두께|신축|계절/.test(fabricText())) {
      wh.click();
      for (var w8 = 0; w8 < 15 && !/옷감|두께|신축|계절/.test(fabricText()); w8++) await sleep(100);
    }
    var root = box || document.body;
    var picked = {},
      rows = [];
    var marked = function (e) {
      var c = String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className || "");
      if (/(^|[-_\s])(on|active|selected|checked|is-?active|is-?selected|is-?checked|current)([-_\s]|$)/i.test(c)) return true;
      if (e.getAttribute && /true/.test((e.getAttribute("aria-checked") || "") + (e.getAttribute("aria-selected") || "") + (e.getAttribute("aria-pressed") || ""))) return true;
      var inp = e.querySelector && e.querySelector("input[type=checkbox],input[type=radio]");
      return !!(inp && inp.checked) || (e.tagName === "INPUT" && e.checked);
    };
    // 눈에 띄는 정도 — 굵을수록 · 바탕색이 있을수록 · 글자에 색이 있을수록 · 진할수록 크다 (고른 것은 보통 더 눈에 띈다)
    var loud = function (e) {
      var cs = getComputedStyle(e),
        s = 0;
      if (+cs.fontWeight >= 600) s += 2;
      if (!/rgba?\(0, 0, 0, 0\)|transparent|rgb\(255, 255, 255\)/.test(cs.backgroundColor)) s += 2;
      var c = (cs.color.match(/\d+/g) || [0, 0, 0]).map(Number);
      if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 40) s += 1.5;
      return s + (255 - (c[0] + c[1] + c[2]) / 3) / 255;
    };
    [].slice.call(root.querySelectorAll("*")).forEach(function (e) {
      var name = LABELS[own(e).replace(/\s|:/g, "")];
      if (!name || picked[name] || !e.getBoundingClientRect().width) return;
      // 그 줄 — 이름 칸에서 위로 올라가며 선택지(짧은 글 칸)가 2개 이상 들어오는 곳
      var row = e.parentElement,
        opts = [];
      for (var up = 0; row && up < 3; up++) {
        opts = [].slice.call(row.querySelectorAll("*")).filter(function (o) {
          var t = (o.innerText || "").trim();
          return o !== e && !o.contains(e) && !e.contains(o) && t && t.length <= 8 && t.indexOf("\n") < 0 && !LABELS[t.replace(/\s|:/g, "")];
        });
        // 가장 안쪽 칸만 (같은 글을 품은 바깥 칸은 뺀다)
        opts = opts.filter(function (o) {
          return !opts.some(function (p) {
            return p !== o && o.contains(p) && (p.innerText || "").trim() === (o.innerText || "").trim();
          });
        });
        if (opts.length >= 2) break;
        row = row.parentElement;
      }
      if (opts.length < 2) return;
      var texts = opts.map(function (o) {
        return (o.innerText || "").trim();
      });
      var sel = opts.filter(function (o) {
        return marked(o) || (o.parentElement && marked(o.parentElement) && o.parentElement !== row);
      });
      var how = "표시";
      if (!sel.length) {
        // 표시가 없으면 모양으로 — 가장 눈에 띄는 것(들)이 고른 것. 다 똑같으면 고른 게 없는 것으로
        var louds = opts.map(loud),
          top = Math.max.apply(null, louds),
          low = Math.min.apply(null, louds);
        sel = top - low > 0.05 ? opts.filter(function (o, i) {
          return top - louds[i] < 0.05;
        }) : [];
        how = "모양";
      }
      picked[name] = sel.map(function (o) {
        return (o.innerText || "").trim();
      });
      rows.push({ n: name, o: texts.slice(0, 8), s: picked[name], h: how });
    });
    if (rows.length) {
      var fw = leaf("옷감정보") || leaf("옷감 정보");
      ok = { w: picked, probe: { rows: rows, html: fw ? (fw.parentElement || fw).outerHTML.slice(0, 1500) : "" } };
    } else if (wh) ok = { w: {}, probe: { rows: [], text: fabricText().slice(0, 600) } };
  } catch (e) {
    ok = { w: {}, probe: { err: String(e).slice(0, 200) } };
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
    hdc: hasDc,
    ok: ok,
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
  return d;
};

// 읽은 것 하나를 담기 창(#clip=…)으로
window.__pocloSend = function (w, origin, d) {
  var url = origin + "/#clip=" + encodeURIComponent(JSON.stringify(d));
  if (w && !w.closed) {
    w.location.href = url;
    w.focus();
  } else {
    window.open(url, "poclo-clip", "width=470,height=760");
  }
};

// 지금 상품 창이 떠 있나 — 주소의 상품번호가 화면에 적혀 있거나, 상세정보 표의 '상품등록정보'가 보이면
window.__pocloOpen = function () {
  var vh = innerHeight,
    vw = innerWidth;
  var g = (location.href.match(/(?:modalGid|gid|goodsId)=(\d{6,11})/i) || location.pathname.match(/\/goods\/(\d{6,11})/) || [])[1] || "";
  var own = function (e) {
    var s = "";
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, " ").trim();
  };
  return [].slice.call(document.querySelectorAll("body *")).some(function (e) {
    var t = own(e);
    if (!t || (t !== "상품등록정보" && (!g || t !== g))) return false;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  });
};

// 여러 상품 담기 (10/13 세원: "신상마켓에서 여러 상품을 같이 포클로에 담기 — 하나씩 하니까 불편해서")
// 상품 창이 안 떠 있을 때(목록 화면) 단추를 누르면 '고르기'가 켜진다: 상품 사진을 누르면 골라지고(창은 안 열림), 'N개 담기'를 누르면
// 고른 상품을 하나씩 열어(세원이 누르는 것처럼) 위의 읽기로 읽고 닫은 뒤 다음 상품으로. 읽은 것은 담기 창(#clip-batch)에 postMessage 로 차례로 보낸다.
// 신마 목록 구조를 직접 못 봐서 — 열고 닫은 방법을 bx 로 같이 보낸다(어긋나면 그걸 보고 고친다).
window.__pocloBatch = function (w, origin) {
  // 단추가 연 빈 창은 닫아 둔다 — 'N개 담기'를 누를 때 다시 연다(그때도 누른 순간이라 열 수 있다)
  try {
    if (w && !w.closed) w.close();
  } catch (e) {
    void e;
  }
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };
  var picked = [];
  var bar = document.createElement("div");
  bar.setAttribute("data-poclo", "1");
  bar.style.cssText =
    "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;background:#fff;color:#1c1917;border:1px solid #e7e5e4;border-radius:16px;" +
    "box-shadow:0 10px 30px rgba(0,0,0,.18);padding:12px 14px;font:14px/1.4 Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:92vw";
  var msg = document.createElement("span");
  var go = document.createElement("button");
  var one = document.createElement("button");
  var stop = document.createElement("button");
  var btn = function (b, main) {
    b.type = "button";
    b.style.cssText =
      "border-radius:10px;padding:8px 12px;font:600 13px/1 inherit;cursor:pointer;" + (main ? "background:#be123c;color:#fff;border:0" : "background:#fff;color:#57534e;border:1px solid #d6d3d1");
  };
  btn(go, true);
  btn(one, false);
  btn(stop, false);
  one.textContent = "이 화면 상품 하나만";
  stop.textContent = "그만";
  bar.appendChild(msg);
  bar.appendChild(go);
  bar.appendChild(one);
  bar.appendChild(stop);
  document.body.appendChild(bar);
  window.__pocloBar = bar;

  var draw = function () {
    msg.innerHTML = "<b>포클로에 여러 개 담기</b> · 담을 상품 사진을 누르세요 <span style='color:#be123c;font-weight:700'>" + picked.length + "개</span>";
    go.textContent = picked.length + "개 담기";
    go.disabled = !picked.length;
    go.style.opacity = picked.length ? "1" : ".4";
  };
  // 누른 곳의 상품 사진 — 사진이거나, 사진 하나(셋까지)가 든 작은 칸(카드)
  var cardImg = function (t) {
    var ok = function (g) {
      var r = g.getBoundingClientRect();
      return r.width >= 60 && r.height >= 60 && r.width <= innerWidth * 0.45;
    };
    if (t && t.tagName === "IMG" && ok(t)) return t;
    for (var e = t, k = 0; e && e !== document.body && k < 6; e = e.parentElement, k++) {
      var r = e.getBoundingClientRect();
      if (r.width > innerWidth * 0.5) break;
      var gs = [].slice.call(e.querySelectorAll("img")).filter(ok);
      if (gs.length >= 1 && gs.length <= 3) return gs[0];
    }
    return null;
  };
  var badges = [];
  var mark = function () {
    badges.forEach(function (b) {
      b.remove();
    });
    badges = [];
    picked.forEach(function (p, i) {
      p.el.style.outline = "4px solid #be123c";
      p.el.style.outlineOffset = "-4px";
      var r = p.el.getBoundingClientRect();
      var b = document.createElement("div");
      b.setAttribute("data-poclo", "1");
      b.textContent = String(i + 1);
      b.style.cssText =
        "position:absolute;z-index:2147483646;width:26px;height:26px;border-radius:13px;background:#be123c;color:#fff;font:700 13px/26px sans-serif;text-align:center;pointer-events:none;" +
        "left:" + (r.left + scrollX + 6) + "px;top:" + (r.top + scrollY + 6) + "px";
      document.body.appendChild(b);
      badges.push(b);
    });
  };
  var unmark = function (el) {
    el.style.outline = "";
    el.style.outlineOffset = "";
  };
  // 고르는 동안은 상품 창이 안 열리게 — 누르기 관련 일을 전부 먼저 받아서 막는다
  var EV = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  var block = function (e) {
    if (e.target.closest && e.target.closest("[data-poclo]")) return;
    var g = cardImg(e.target);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== "click") return;
    var i = picked.findIndex(function (p) {
      return p.el === g;
    });
    if (i >= 0) {
      unmark(g);
      picked.splice(i, 1);
    } else picked.push({ el: g, src: g.currentSrc || g.src });
    mark();
    draw();
  };
  var on = function () {
    EV.forEach(function (t) {
      document.addEventListener(t, block, true);
    });
  };
  var off = function () {
    EV.forEach(function (t) {
      document.removeEventListener(t, block, true);
    });
  };
  var end = function () {
    off();
    picked.forEach(function (p) {
      unmark(p.el);
    });
    badges.forEach(function (b) {
      b.remove();
    });
    bar.remove();
    window.__pocloBar = null;
    window.__pocloBatchStop = null;
  };
  window.__pocloBatchStop = end;
  stop.onclick = end;
  one.onclick = async function () {
    var win = window.open("about:blank", "poclo-clip", "width=470,height=760");
    end();
    window.__pocloSend(win, origin, await window.__pocloRead());
  };
  on();
  draw();

  // 진짜로 누르기 (세원이 누르는 것과 같은 순서)
  var press = function (el) {
    var r = el.getBoundingClientRect();
    var o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function (t) {
      el.dispatchEvent(t.indexOf("pointer") === 0 && window.PointerEvent ? new PointerEvent(t, o) : new MouseEvent(t, o));
    });
  };
  var until = async function (f, ms) {
    for (var k = 0; k < ms / 100; k++) {
      if (f()) return true;
      await sleep(100);
    }
    return !!f();
  };
  // 상품 창 닫기 — 닫기 단추 → Esc → 그래도 열려 있고 주소가 바뀌었으면 뒤로
  // (뒤로를 먼저 하면, 신마가 주소를 덮어쓰는 식이면 목록 앞 화면으로 나가 버릴 수 있어서 마지막에)
  var shut = function () {
    return !window.__pocloOpen();
  };
  var close = async function (before) {
    var how = "";
    var x = [].slice
      .call(document.querySelectorAll("button,[role=button],a,span,div"))
      .filter(function (e) {
        var t = (e.getAttribute("aria-label") || "") + " " + (e.childElementCount === 0 ? e.textContent : "");
        var r = e.getBoundingClientRect();
        return /닫기|close|^\s*[✕×xX]\s*$/i.test(t.trim()) && r.width > 0 && r.width < 80 && r.height > 0 && !e.closest("[data-poclo]");
      })
      .pop();
    if (x) {
      x.click();
      how = "button";
      if (await until(shut, 2500)) return how;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    how = (how ? how + "+" : "") + "esc";
    if (await until(shut, 1500)) return how;
    if (location.href !== before) {
      history.back();
      how += "+back";
      if (await until(shut, 3000)) return how;
    }
    return how + "+fail";
  };

  go.onclick = async function () {
    if (!picked.length) return;
    off();
    var list = picked.slice();
    picked.forEach(function (p) {
      unmark(p.el);
    });
    badges.forEach(function (b) {
      b.remove();
    });
    badges = [];
    go.style.display = one.style.display = "none";
    stop.textContent = "멈추기";
    var halt = false;
    stop.onclick = function () {
      halt = true;
    };
    var win = window.open(origin + "/#clip-batch", "poclo-clip", "width=470,height=760");
    var ready = false;
    var hear = function (e) {
      if (e.origin === origin && e.data && e.data.poclo === "ready") ready = true;
    };
    window.addEventListener("message", hear);
    var post = function (m) {
      try {
        win.postMessage(m, origin);
      } catch (e) {
        void e;
      }
    };
    msg.innerHTML = "<b>담기 창을 여는 중…</b>";
    if (
      !(await until(function () {
        return ready;
      }, 15000))
    ) {
      msg.innerHTML = "<b>담기 창이 준비되지 않았어요</b> — 포클로ERP 에 로그인돼 있는지 확인하고 다시 눌러 주세요";
      stop.textContent = "닫기";
      stop.onclick = end;
      window.removeEventListener("message", hear);
      return;
    }
    post({ poclo: "start", n: list.length });
    var last = "",
      done = 0,
      fail = 0;
    for (var i = 0; i < list.length && !halt; i++) {
      msg.innerHTML = "<b>" + (i + 1) + " / " + list.length + "</b> 읽는 중… <span style='color:#78716c'>창은 저절로 열리고 닫혀요</span>";
      // 목록이 다시 그려졌을 수 있다 — 같은 사진을 다시 찾는다
      var el = list[i].el;
      if (!el.isConnected)
        el =
          [].slice.call(document.images).filter(function (g) {
            return (g.currentSrc || g.src) === list[i].src;
          })[0] || el;
      if (!el.isConnected) {
        post({ poclo: "fail", i: i, n: list.length, why: "목록에서 사진을 다시 못 찾았어요" });
        fail++;
        continue;
      }
      el.scrollIntoView({ block: "center" });
      await sleep(250);
      var before = location.href;
      press(el);
      var opened = await until(function () {
        return window.__pocloOpen();
      }, 7000);
      if (!opened) {
        post({ poclo: "fail", i: i, n: list.length, why: "상품 창이 안 열렸어요", u: location.href });
        fail++;
        continue;
      }
      await sleep(600);
      var d = await window.__pocloRead();
      var byUrl = location.href !== before;
      var how = await close(before);
      d.bx = { i: i, open: byUrl ? "url" : "dom", close: how };
      // 앞 상품과 같은 글이면 창이 안 바뀐 것 — 담지 않는다
      var sig = (d.g || "") + (d.t || "").slice(0, 300);
      if (sig === last) {
        post({ poclo: "fail", i: i, n: list.length, why: "앞 상품과 같은 화면이 읽혔어요" });
        fail++;
      } else {
        post({ poclo: "clip", i: i, n: list.length, d: d });
        done++;
      }
      last = sig;
      if (/fail/.test(how)) {
        post({ poclo: "fail", i: i + 1, n: list.length, why: "상품 창이 안 닫혀서 멈췄어요" });
        break;
      }
      await sleep(400);
    }
    post({ poclo: "end", n: list.length, sent: done, fail: fail, halted: halt });
    window.removeEventListener("message", hear);
    msg.innerHTML = "<b>" + done + "개 보냈어요</b>" + (fail ? " · 못 읽은 것 " + fail + "개" : "") + " — 담기 창에서 확인하세요";
    stop.textContent = "닫기";
    stop.onclick = end;
    setTimeout(end, 6000);
  };
};

window.__pocloClip = async function (w, origin) {
  // 고르는 중에 단추를 또 누르면 그만
  if (window.__pocloBar && window.__pocloBatchStop) {
    window.__pocloBatchStop();
    try {
      if (w && !w.closed) w.close();
    } catch (e) {
      void e;
    }
    return;
  }
  if (window.__pocloOpen()) window.__pocloSend(w, origin, await window.__pocloRead());
  else window.__pocloBatch(w, origin);
};
window.__pocloClip(window.__pocloW, window.__pocloO);
