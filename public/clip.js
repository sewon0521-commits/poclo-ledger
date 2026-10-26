// 신상마켓 '포클로에 담기' — 세원이 보고 있는 상품 화면에서 글과 사진을 읽어 ERP 작은 창으로 넘긴다.
// 즐겨찾기 단추가 이 파일을 불러온다(불러오기가 막히면 단추 안에 넣어 둔 같은 코드가 돈다) → 여기를 고치면 단추를 다시 끌어다 놓지 않아도 된다.
//
// 상품 칸 찾기 (10/1 세 번째 판): 신상마켓은 상품을 누르면 **목록 위에 창이 뜨고 주소에 modalGid=상품번호** 가 붙는다.
// 그 상품번호는 상품명 바로 아래에도 적혀 있다 → **그 글자를 찾아 거기서부터 위로** 올라가며 '○층'(거래처 위치)과 가격이 들어오는 칸까지를 상품으로 본다.
// 번호가 주소에 없으면(찜 목록 등) 상세정보 표에만 있는 글자(상품등록정보·낱장여부·혼용률)에서 시작한다.
// 예전 판은 '가격 + 제조국이 든 가장 작은 칸'을 찾다가 뒤에 깔린 **필터 칸**을 상품으로 읽었다('남성의류 / 필터').
//
// 제품 설명: 거래처가 전화·카톡·인스타를 적어 두는 칸인데 접혀 있을 때가 있다 → 접혀 있으면 한 번 눌러 펼쳐서 읽는다(세원이 누르는 것과 같다).
// 이미 아는 거래처 (10/14 세원: "전번 찾는 게 오래 걸려서 이미 거래처이거나 카톡을 보낸 적이 있는 곳이면 그냥 넘겨 줘")
// ERP 담기 창이 담을 때마다 목록(이름 조각)을 보내 준다 → 이 신마 창의 저장소(poclo_known)에 두고, 그 거래처면 매장 정보를 찾으러 안 들어간다.
// 10/22: 연락처가 적힌 거래처만, 이름은 통째로(한글만 · 영문만) — src/lib/sinsang.js nameKeys 와 같아야 한다. 저장 이름 poclo_known2(예전 조각 목록은 버림).
if (!window.__pocloKnownOn) {
  window.__pocloKnownOn = true;
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.poclo !== "known" || !Array.isArray(m.keys) || e.origin !== window.__pocloO) return;
    try {
      localStorage.setItem("poclo_known2", JSON.stringify({ at: Date.now(), keys: m.keys.slice(0, 8000) }));
    } catch (x) {
      void x;
    }
  });
}
window.__pocloKeys = function (s) {
  var low = String(s || "").toLowerCase();
  var ko = (low.match(/[가-힣]+/g) || []).join("");
  var en = (low.match(/[a-z0-9]+/g) || []).join("");
  var out = [];
  if (ko.length >= 2) out.push("k:" + ko);
  if (en.length >= 2 && !/^\d+$/.test(en)) out.push("e:" + en);
  return out;
};
window.__pocloKnown = function (vendor) {
  try {
    var k = JSON.parse(localStorage.getItem("poclo_known2") || "null");
    if (!k || !k.keys) return false;
    var set = {};
    k.keys.forEach(function (x) {
      set[x] = 1;
    });
    return window.__pocloKeys(vendor).some(function (p) {
      return set[p];
    });
  } catch (e) {
    void e;
    return false;
  }
};

window.__pocloRead = async function () {
  var vw = innerWidth,
    vh = innerHeight;
  var P = /[₩￦]\s?[\d,]{3,}|[\d,]{4,}\s?원/,
    // 위치 — '○층', 층이 없는 곳은 상가 이름·외곽·특N (10/14 라라 '테크노 외곽 특1')
    L = /(지하\s?)?\d+\s*층|디오트|테크노|청평화|남평화|신평화|동평화|제일평화|광희|누죤|유어스|벨포스트|apM|APM|에이피엠|퀸즈|데님타운|NPH|외곽|(^|\s)특\s?\d/,
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
  // 상품 사진 전부 (10/14 세원: "신상마켓 10개면 10개 전부 가져와서 옆으로 넘길 수 있게") —
  // 상품 창 왼쪽(큰 사진 칸 + 아래 작은 사진 줄)의 사진을 화면 순서대로 모은다. 큰 사진 칸은 넘기는 사진이 전부 들어 있다(10/14 실제 신마 기록: 사진마다 워터마크 글이 12번).
  // 신마 사진 주소는 v4.img.sinsang.market/?f=원본&w=696&h=928 꼴 — 원본(f=)으로 같은 사진을 하나로 치고, 작은 사진 줄 것도 큰 크기(w=900&h=1200)로 바꿔 받는다.
  var ga = [],
    gp = {};
  try {
    var mainImg = null,
      mainA = 0;
    [].slice.call((box || document.body).querySelectorAll("img")).forEach(function (g) {
      var rc = g.getBoundingClientRect();
      if (!seen(g)) return;
      var a = rc.width * rc.height;
      if (a > mainA) {
        mainA = a;
        mainImg = g;
      }
    });
    // 왼쪽 칸 = 큰 사진에서 위로, 오른쪽 글 칸(r.node)을 품기 직전까지
    var col = mainImg;
    while (col && col.parentElement && col.parentElement !== document.body && !(r.node && col.parentElement.contains(r.node))) col = col.parentElement;
    var seenKey = {};
    var bigUrl = function (u) {
      return /[?&]w=\d+/.test(u) ? u.replace(/([?&])w=\d+/, "$1w=900").replace(/([?&])h=\d+/, "$1h=1200") : u;
    };
    var keyOf = function (u) {
      var m = u.match(/[?&]f=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : u.split("?")[0];
    };
    [].slice.call(col ? col.querySelectorAll("img") : []).forEach(function (g) {
      var u = g.currentSrc || g.src || g.getAttribute("data-src") || "";
      if (!u || /^data:/.test(u)) return;
      var rc = g.getBoundingClientRect();
      var product = /sinsang/i.test(u);
      if (!product && Math.max(rc.width, g.naturalWidth || 0) < 120) return; // 아이콘·로고
      var k = keyOf(u);
      if (seenKey[k]) return;
      seenKey[k] = 1;
      ga.push(bigUrl(u));
    });
    var cnt = ((col && col.innerText) || "").match(/(?:^|\n)\s*\d+\s*\/\s*(\d+)\s*(?:\n|$)/);
    gp = { n: ga.length, of: cnt ? +cnt[1] : null, col: col ? col.tagName + "." + String(col.className || "").slice(0, 60) : "" };
  } catch (e) {
    gp = { err: String(e).slice(0, 200) };
  }
  // 이 상품 사진만 (10/15 세원: "유스 딥브이니트 썸네일이 이상해") — 상품 창 아래 '유사한 상품' 줄 사진·매장 로고까지 섞여 들어왔고,
  // 대표 사진(썸네일)도 그 줄의 다른 상품(스웨이드 자켓)으로 잡혔다. 신마 사진 주소는 images/<매장>/<상품 폴더>/… —
  // 상품번호와 같은 폴더가 있으면 그 폴더, 없으면(CNK 475 어그처럼 폴더가 다른 상품도 있다) 큰 사진 칸 첫 사진의 폴더만 남긴다.
  try {
    var fold = function (u) {
      var m = decodeURIComponent(u).match(/images\/\d+\/(\d+)\//);
      return m ? m[1] : "";
    };
    var ownFolder = gid && ga.some(function (u) {
      return fold(u) === gid;
    })
      ? gid
      : ga.length
        ? fold(ga[0])
        : "";
    if (ownFolder)
      ga = ga.filter(function (u) {
        return fold(u) === ownFolder;
      });
    gp.own = ownFolder;
    gp.n = ga.length;
    // 대표 사진도 이 상품 첫 사진으로
    if (ga.length)
      imgs = [ga[0]].concat(
        imgs.filter(function (u) {
          return u !== ga[0];
        }),
      );
  } catch (e) {
    gp.err2 = String(e).slice(0, 200);
  }
  ga = ga.slice(0, 30);

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
  // 매장 연락처 (10/14) — 제품 설명에 전화도 카톡도 **둘 다 없을 때만** 매장 화면·'매장 정보'에서 (위 __pocloStore).
  // 10/14 세원: "제품 설명에 전화번호 있어도 안에 들어가서 찾는 버그 — 오래 걸려서" → 처음엔 둘 중 하나만 없어도 들어갔다.
  // 전화는 제품 설명 + 상품 칸 글 어디에든 있으면 있는 것으로 ('010 - 1234 - 5678' · '010.1234.5678' · '01012345678' 도)
  var sc = null;
  try {
    var dsText = ds.join("\n");
    var hasTel = /(?<!\d)0\d{1,2}[ \t]*[-.)ㅡ~]?[ \t]*\d{3,4}[ \t]*[-.ㅡ~]?[ \t]*\d{4}(?!\d)/.test(dsText + "\n" + t),
      hasKakao = /카톡|카카오|kakao|katalk|open\.kakao|pf\.kakao/i.test(dsText);
    if (!hasTel && !hasKakao && window.__pocloStore) {
      var ls0 = linesOf(t),
        li = -1;
      for (var z = 0; z < ls0.length; z++)
        if (L.test(ls0[z])) {
          li = z;
          break;
        }
      var vline = li > 0 ? ls0[li - 1] : "";
      // 이미 아는 거래처(돈 › 거래처에 있거나 카톡을 보낸 적 있는 곳)면 안 들어간다
      if (vline && window.__pocloKnown && window.__pocloKnown(vline)) sc = { known: true };
      else sc = await window.__pocloStore({ vendor: vline, place: ls0[li] || "", box: top || box });
    }
  } catch (e) {
    sc = { probe: { err: String(e).slice(0, 200) } };
  }
  var d = {
    sc: sc,
    ga: ga,
    gp: gp,
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

// 매장 연락처 (10/14 세원: "포클로에 담기 눌렀는데 번호나 카톡 아이디가 없는 경우 — 상단 거래처명 클릭 → 매장 화면에 전화가 있거나,
// '매장 정보'를 누르면 번호랑 카톡 아이디가 나와. 이것까지 자동화")
// 세원이 보던 화면은 그대로 두고, 화면 밖 보이지 않는 틀(iframe, 같은 신마 주소)에 매장 화면을 띄워 읽는다:
//   ① 상품 창 맨 위 거래처 이름의 링크(/store/…) → 그 주소. 링크가 없으면 지금 주소(같은 상품 창)를 띄워 그 안에서 거래처 이름을 누른다.
//   ② 매장 화면 '전화 010-…' 줄 → 전화. ③ '매장 정보' 단추가 있으면 눌러 뜬 칸에서 전화·카톡·인스타·위챗(아이콘 모양으로 가른다).
// 신마 화면을 직접 못 봐서(자동 접속은 막혀 있고 안 뚫는다) 무엇을 봤는지 probe 로 같이 보낸다 — 어긋나면 그걸 보고 고친다.
// 같은 매장은 이 탭에서 1시간 기억한다(여러 개 담기에서 같은 거래처를 또 안 띄우게).
window.__pocloStore = async function (o) {
  o = o || {};
  var PH = /(0\d{1,2})[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/;
  var probe = { v: 1 };
  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };
  var own = function (e) {
    var s = "";
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, " ").trim();
  };
  var shown = function (e) {
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  var leafIn = function (doc, texts, root) {
    var hit = [].slice.call((root || doc.body).querySelectorAll("*")).filter(function (e) {
      return texts.indexOf(own(e).replace(/\s/g, "").replace(/[›>〉❯»]+$/, "")) >= 0 && shown(e);
    });
    return hit;
  };
  // 알림 — 몇 초 걸리니까 무엇을 하는지 보이게
  var toast = document.createElement("div");
  toast.textContent = "포클로 · 제품 설명에 연락처가 없어서 매장 정보에서 찾는 중…";
  toast.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#1c1917;color:#fff;font:600 13px/1.4 Pretendard,system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25)";
  document.body.appendChild(toast);
  var f = null;
  try {
    // ① 거래처 이름 → 매장 주소
    // 이름 끝의 '›' '>' 화살표는 뗀다 (거래처 이름 옆 화살표가 글자일 때)
    var vendor = String(o.vendor || "").replace(/\s+/g, "").replace(/[›>〉❯»]+$/, "");
    probe.vendor = o.vendor || "";
    if (!vendor) {
      probe.fail = "거래처 이름을 못 찾음";
      return { probe: probe };
    }
    var scope = o.box || document.body;
    // 거래처 이름 칸 고르기 (10/14 실제 신마 기록: 사진 위 워터마크 글 '스튜디오 [ppoclo]' 를 거래처 이름으로 잘못 집었다)
    // → 바로 옆(위로 3칸 안)에 위치 줄이 있는 것, 큰 사진 위에 얹힌 글이 아닌 것, 링크 안에 있는 것을 먼저
    var place = String(o.place || "").replace(/\s+/g, "");
    var pickName = function (cs) {
      var best = null,
        bs = -1;
      cs.forEach(function (c) {
        var s = 0,
          up = c;
        for (var q = 0; up && q < 4; up = up.parentElement, q++) {
          var t = (up.innerText || "").replace(/\s+/g, "");
          if (place && t.length < 400 && t.indexOf(place) >= 0) {
            s += 4;
            break;
          }
        }
        var onPhoto = false;
        for (var w = c.parentElement, k2 = 0; w && k2 < 4 && !onPhoto; w = w.parentElement, k2++)
          onPhoto = [].slice.call(w.querySelectorAll("img")).some(function (g) {
            return g.getBoundingClientRect().width >= 200;
          });
        if (!onPhoto) s += 2;
        if (c.closest("a[href]")) s += 1;
        if (s > bs) {
          bs = s;
          best = c;
        }
      });
      return best;
    };
    // 거래처 이름 칸에서 위로 React 화면 정보(fiber)를 따라가며 매장 번호(wsIdx · storeIdx …)를 찾는다
    var storeIdOf = function (el) {
      for (var e = el, i = 0; e && i < 8; e = e.parentElement, i++) {
        var fk = Object.keys(e).filter(function (k) {
          return k.indexOf("__reactFiber") === 0;
        })[0];
        for (var fb = fk ? e[fk] : null, j = 0; fb && j < 12; fb = fb.return, j++) {
          var pr = fb.memoizedProps;
          if (!pr || typeof pr !== "object") continue;
          for (var kk in pr) {
            if (/^(ws|store|wholesale)_?(idx|id|no|seq)$/i.test(kk) && /^\d{2,9}$/.test(String(pr[kk]))) return String(pr[kk]);
          }
        }
      }
      return "";
    };
    var nameEl = null;
    if (vendor) {
      var cands = leafIn(document, [vendor], scope);
      if (!cands.length) cands = leafIn(document, [vendor]);
      nameEl = pickName(cands);
    }
    var a = nameEl && nameEl.closest("a[href]");
    if (!a) {
      // 이름 칸이 링크가 아니면 둘레의 매장 링크
      var near = nameEl;
      for (var k = 0; near && k < 4 && !a; k++) {
        a = near.querySelector && near.querySelector('a[href*="/store"],a[href*="/shop"],a[href*="storeId"]');
        near = near.parentElement;
      }
    }
    var href = a ? a.href : "";
    if (href && (/^javascript:|#$/.test(href) || href === location.href)) href = "";
    // 10/26 실제 신마(세원 크롬으로 확인): 거래처 칸은 링크가 아니라 onClick 이 window.open('/store/<매장번호>', '_blank') —
    // 숨은 틀 안에서 누르면 새 탭 열기가 막혀 아무 일도 없었다('매장 화면이 안 떴어요'). 거래처 칸 React props 의 wsIdx 가 매장 번호다.
    if (!href && nameEl) {
      var sid = storeIdOf(nameEl);
      if (sid) {
        href = location.origin + "/store/" + sid;
        probe.how = "wsIdx";
      }
    }
    probe.vendor = o.vendor || "";
    probe.name = nameEl ? nameEl.tagName + "." + String(nameEl.className || "").slice(0, 60) : "";
    probe.href = href;
    var key = "poclo_store:" + (href || vendor);
    try {
      var hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < 3600e3) {
        hit.res.cached = true;
        return hit.res;
      }
    } catch (e) {
      void e;
    }

    // ② 보이지 않는 틀에 띄우기
    f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;left:-30000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none";
    f.src = href || location.href;
    document.body.appendChild(f);
    var doc = null;
    var ready = function () {
      try {
        doc = f.contentDocument;
        var t = (doc && doc.body && doc.body.innerText) || "";
        return t.length > 50 ? t : "";
      } catch (e) {
        probe.frame = "막힘 " + String(e).slice(0, 80);
        return "";
      }
    };
    var storeReady = function () {
      var t = ready();
      return t && (/전화\s*[:：]?\s*0\d/.test(t) || /매장\s?정보/.test(t) || /매장\s?TOP/i.test(t)) ? t : "";
    };
    if (!href) {
      // 링크가 없으면 같은 상품 창을 띄운 뒤 그 안에서 거래처 이름을 누른다
      for (var w1 = 0; w1 < 50 && !ready(); w1++) await sleep(200);
      var inner = null;
      for (var w2 = 0; w2 < 25 && !inner && doc; w2++) {
        inner = pickName(leafIn(doc, [vendor])) || null;
        if (!inner) await sleep(200);
      }
      probe.click = inner ? "거래처 이름 누름" : "틀 안에서 거래처 이름 못 찾음";
      if (!inner) return { probe: probe };
      var was = "";
      try {
        was = f.contentWindow.location.href;
      } catch (e) {
        void e;
      }
      // 틀 안의 매장 번호가 읽히면 그 주소로, 아니면 이름을 누르되 새 탭 열기(window.open)를 붙잡아 그 주소로 (10/26)
      var opened = storeIdOf(inner) ? location.origin + "/store/" + storeIdOf(inner) : "";
      if (!opened) {
        try {
          f.contentWindow.open = function (u) {
            opened = String(u || "");
            return { focus: function () {}, closed: true };
          };
        } catch (e) {
          void e;
        }
        (inner.closest("a,button,[role=button]") || inner).click();
        await sleep(300);
      }
      if (opened) {
        probe.how = probe.how || "새 탭 주소 붙잡음";
        f.contentWindow.location.href = new URL(opened, location.href).href;
        await sleep(300);
      }
      // 매장 화면으로 넘어갈 때까지 (뒤에 깔린 목록이 이미 그 매장이면 창만 닫히고 주소는 그대로일 수 있다)
      for (var w5 = 0; w5 < 20; w5++) {
        await sleep(150);
        try {
          if (f.contentWindow.location.href !== was) break;
        } catch (e) {
          void e;
          break;
        }
      }
      await sleep(600);
    }
    var txt = "";
    for (var w3 = 0; w3 < 40 && !txt; w3++) {
      txt = storeReady();
      if (!txt) await sleep(200);
    }
    if (!txt) {
      probe.fail = "매장 화면이 안 떴어요";
      probe.text = (ready() || "").slice(0, 400);
      return { probe: probe };
    }
    try {
      probe.at = f.contentWindow.location.href;
    } catch (e) {
      void e;
    }
    var res = { tel: "", kakao: "", insta: "", wechat: "", how: "" };
    // ③ 매장 화면의 '전화 010-…'
    var m = txt.match(/전화\s*[:：]?\s*(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})/);
    if (m) {
      res.tel = m[1];
      res.how = "매장 화면";
    }
    // ④ '매장 정보' 단추 → 뜬 칸
    var btn = leafIn(doc, ["매장정보"]).filter(function (e) {
      return !!e.closest("button,a,[role=button]") || getComputedStyle(e).cursor === "pointer";
    })[0];
    probe.button = !!btn;
    if (btn) {
      var before = doc.body.innerText.length;
      (btn.closest("button,a,[role=button]") || btn).click();
      var modal = null;
      for (var w4 = 0; w4 < 25 && !modal; w4++) {
        await sleep(150);
        // 제목 '매장 정보'(누른 단추 말고)에서 위로 — 전화나 링크·아이콘이 2개 넘게 들어오는 칸
        var titles = leafIn(doc, ["매장정보"]).filter(function (e) {
          return e !== btn && !btn.contains(e) && !e.contains(btn);
        });
        for (var ti = 0; ti < titles.length && !modal; ti++) {
          var up = titles[ti];
          for (var u = 0; up && u < 7; u++) {
            var icons = up.querySelectorAll("img,svg").length;
            if (PH.test(up.innerText || "") || icons >= 3) {
              modal = up;
              break;
            }
            up = up.parentElement;
          }
        }
        if (!modal && doc.body.innerText.length > before + 30 && w4 > 10) break;
      }
      if (modal) {
        res.how = res.how ? res.how + " + 매장 정보" : "매장 정보";
        var sigOf = function (e) {
          // 그 줄의 아이콘 모양 — 이미지 주소·이름, svg 안 글, 링크 주소, class
          var row = e,
            s = "";
          for (var q = 0; row && q < 3; q++) {
            var ic = row.querySelector("img,svg,i,[class*=icon],[class*=Icon]");
            if (ic && !e.contains(ic)) {
              s += " " + (ic.getAttribute("src") || "") + " " + (ic.getAttribute("alt") || "") + " " + String(ic.className && ic.className.baseVal != null ? ic.className.baseVal : ic.className || "") + " " + (ic.getAttribute("aria-label") || "");
              if (ic.tagName.toLowerCase() === "svg") s += " " + ic.outerHTML.slice(0, 300);
              break;
            }
            row = row.parentElement;
          }
          var link = e.closest("a[href]");
          return (s + " " + (link ? link.getAttribute("href") : "") + " " + String(e.className || "")).slice(0, 600);
        };
        var items = [].slice.call(modal.querySelectorAll("*")).filter(function (e) {
          var t = own(e);
          return t && t.length <= 40 && shown(e) && !/매장\s?정보|외부\s?SNS|문의|거래처/.test(t) && (PH.test(t) || /^[@A-Za-z0-9_.-]{3,40}$/.test(t));
        });
        var unknown = [];
        probe.items = items.slice(0, 8).map(function (e) {
          var t = own(e),
            sig = sigOf(e),
            kind = "";
          if (PH.test(t) || /tel:|phone|call|전화/i.test(sig)) kind = "tel";
          else if (/insta/i.test(sig)) kind = "insta";
          else if (/kakao|katalk|ka-?talk|카카오|카톡|\btalk\b/i.test(sig)) kind = "kakao";
          else if (/wechat|weixin|wx|위챗/i.test(sig)) kind = "wechat";
          if (kind === "tel" && !res.tel) res.tel = (t.match(PH) || [t])[0];
          else if (kind && kind !== "tel" && !res[kind]) res[kind] = t.replace(/^@/, "");
          else if (!kind) unknown.push(t);
          return { t: t, k: kind, sig: sig.slice(0, 200) };
        });
        // 아이콘으로 못 가르면 — 세원 화면(라라)의 순서: 전화 · 카톡 / 위챗 · 인스타 → 모르는 첫 아이디를 카톡으로 짐작(표시해 둔다)
        if (!res.kakao && unknown.length) {
          res.kakao = unknown[0].replace(/^@/, "");
          res.kakaoGuess = true;
        }
        probe.html = modal.outerHTML.slice(0, 2500);
      } else probe.modal = "매장 정보 칸을 못 찾음";
    }
    res.probe = probe;
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), res: res }));
    } catch (e) {
      void e;
    }
    return res;
  } catch (e) {
    probe.err = String(e).slice(0, 200) + " | " + String((e && e.stack) || "").slice(0, 400);
    return { probe: probe };
  } finally {
    if (f) f.remove();
    toast.remove();
  }
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
// 10/13 디자인 다시(세원: "여러 개 담기 체크 표시로 해 주고 디자인 디벨롭"): 사진마다 체크 동그라미(빈 동그라미 → 고르면 로즈 + ✓, 사진 테두리) ·
// 아래에 떠 있는 막대(로고 · 고른 개수 · 다 지우기 · 상품 하나만 · N개 담기 · ×) · 담는 동안 진행 막대 · 다 보내면 초록.
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
  var ROSE = "#be123c";
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var css = document.createElement("style");
  css.setAttribute("data-poclo", "1");
  css.textContent = [
    ".pk-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483640}",
    ".pk-ring{position:fixed;box-shadow:inset 0 0 0 3px " + ROSE + ";background:rgba(190,18,60,.07);opacity:0;transition:opacity .15s ease-out}",
    ".pk-ring.on{opacity:1}",
    ".pk-dot{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.94);box-shadow:0 1px 4px rgba(0,0,0,.22),inset 0 0 0 1.5px rgba(28,25,23,.32);display:flex;align-items:center;justify-content:center;transition:transform .15s cubic-bezier(.2,.8,.2,1),background-color .15s,box-shadow .15s}",
    ".pk-dot svg{opacity:0;transform:scale(.6);transition:opacity .12s,transform .15s cubic-bezier(.2,.8,.2,1)}",
    ".pk-dot.hov{transform:scale(1.12);box-shadow:0 2px 8px rgba(0,0,0,.28),inset 0 0 0 2px " + ROSE + "}",
    ".pk-dot.on{background:" + ROSE + ";box-shadow:0 2px 10px rgba(190,18,60,.45)}",
    ".pk-dot.on svg{opacity:1;transform:scale(1)}",
    ".pk-bar{position:fixed;left:50%;bottom:24px;z-index:2147483647;transform:translate(-50%,14px);opacity:0;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s;" +
      "display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:10px 10px 10px 12px;background:#fff;color:#1c1917;border:1px solid #e7e5e4;border-radius:18px;" +
      "box-shadow:0 14px 40px rgba(28,25,23,.18),0 2px 6px rgba(28,25,23,.08);font:14px/1.35 Pretendard,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;letter-spacing:-.01em;overflow:hidden}",
    ".pk-bar.in{transform:translate(-50%,0);opacity:1}",
    ".pk-bar *{box-sizing:border-box;font:inherit;letter-spacing:inherit}",
    ".pk-prog{position:absolute;left:0;right:0;top:0;height:3px;background:#f5f5f4;display:none}",
    ".pk-prog i{display:block;height:100%;width:0;background:" + ROSE + ";transition:width .35s ease-out}",
    ".pk-bar.run .pk-prog{display:block}",
    ".pk-logo{flex:none;width:30px;height:30px;border-radius:9px;background:" + ROSE + ";color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}",
    ".pk-bar.done .pk-logo{background:#047857}",
    ".pk-text{display:flex;flex-direction:column;min-width:0;margin-right:4px}",
    ".pk-text b{font-weight:700;white-space:nowrap}",
    ".pk-text small{font-size:12px;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}",
    ".pk-count{flex:none;min-width:34px;text-align:center;padding:4px 9px;border-radius:999px;background:#f5f5f4;color:#78716c;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;transition:background-color .15s,color .15s}",
    ".pk-count.has{background:#fff1f2;color:" + ROSE + "}",
    ".pk-btn{flex:none;border:0;cursor:pointer;border-radius:11px;padding:9px 13px;font-weight:600;font-size:13px;line-height:1;white-space:nowrap;transition:transform .15s ease-out,background-color .15s,color .15s,opacity .15s}",
    ".pk-btn:active{transform:scale(.97)}",
    ".pk-btn:focus-visible,.pk-x:focus-visible{outline:2px solid " + ROSE + ";outline-offset:2px}",
    ".pk-main{background:" + ROSE + ";color:#fff;padding:10px 16px}",
    ".pk-main:hover{background:#9f1239}",
    ".pk-main[disabled]{background:#e7e5e4;color:#a8a29e;cursor:default;transform:none}",
    ".pk-ghost{background:transparent;color:#57534e}",
    ".pk-ghost:hover{background:#f5f5f4}",
    ".pk-x{flex:none;width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:#a8a29e;cursor:pointer;font-size:18px;line-height:30px;padding:0}",
    ".pk-x:hover{background:#f5f5f4;color:#57534e}",
    ".pk-x.wide{width:auto;padding:0 12px;font-size:13px;font-weight:600;color:#57534e}",
    ".pk-hide{display:none!important}",
    "@media (prefers-reduced-motion: reduce){.pk-bar,.pk-dot,.pk-dot svg,.pk-ring,.pk-prog i{transition:none}}",
  ].join("\n");
  document.head.appendChild(css);

  var layer = document.createElement("div");
  layer.className = "pk-layer";
  layer.setAttribute("data-poclo", "1");
  document.body.appendChild(layer);

  var bar = document.createElement("div");
  bar.className = "pk-bar";
  bar.setAttribute("data-poclo", "1");
  bar.setAttribute("role", "toolbar");
  bar.innerHTML =
    '<div class="pk-prog"><i></i></div><span class="pk-logo">P</span>' +
    '<span class="pk-text"><b>포클로에 담기</b><small>담을 상품 사진을 눌러 골라요</small></span>' +
    '<span class="pk-count">0개</span>' +
    '<button type="button" class="pk-btn pk-ghost" data-a="clear">다 지우기</button>' +
    '<button type="button" class="pk-btn pk-ghost" data-a="one" title="상품 창을 열어 둔 화면이면 그 상품 하나만 담아요">상품 하나만</button>' +
    '<button type="button" class="pk-btn pk-main" data-a="go">담기</button>' +
    '<button type="button" class="pk-x" data-a="close" aria-label="그만">×</button>';
  document.body.appendChild(bar);
  requestAnimationFrame(function () {
    bar.classList.add("in");
  });
  window.__pocloBar = bar;
  var $ = function (s) {
    return bar.querySelector(s);
  };
  var title = $(".pk-text b"),
    hint = $(".pk-text small"),
    count = $(".pk-count"),
    go = $('[data-a="go"]'),
    clear = $('[data-a="clear"]'),
    one = $('[data-a="one"]'),
    x = $('[data-a="close"]'),
    prog = $(".pk-prog i");

  var picked = [];
  var hover = null;
  var running = false;
  var isPicked = function (g) {
    return picked.some(function (p) {
      return p.el === g;
    });
  };
  // 상품 사진처럼 보이는 것 — 카드 크기(너무 작은 로고·너무 큰 배너는 빼고)
  var ok = function (g) {
    if (!g || g.closest("[data-poclo]")) return false;
    var r = g.getBoundingClientRect();
    return r.width >= 60 && r.height >= 60 && r.width <= innerWidth * 0.45;
  };
  // 누른 곳의 상품 사진 — 사진이거나, 사진 하나(셋까지)가 든 작은 칸(카드)
  var cardImg = function (t) {
    if (!t || !t.closest || t.closest("[data-poclo]")) return null;
    if (t.tagName === "IMG" && ok(t)) return t;
    for (var e = t, k = 0; e && e !== document.body && k < 6; e = e.parentElement, k++) {
      var r = e.getBoundingClientRect();
      if (r.width > innerWidth * 0.5) break;
      var gs = [].slice.call(e.querySelectorAll("img")).filter(ok);
      if (gs.length >= 1 && gs.length <= 3) return gs[0];
    }
    return null;
  };

  // 체크 동그라미 — 화면에 보이는 상품 사진마다(스크롤·크기 바뀜·새로 불러온 목록을 따라간다)
  var dots = new Map();
  var place = function () {
    var keep = new Set();
    if (!running)
      [].slice.call(document.images).forEach(function (g) {
        if (!ok(g)) return;
        var r = g.getBoundingClientRect();
        if (r.bottom < -40 || r.top > innerHeight + 40 || r.right < 0 || r.left > innerWidth) return;
        var d = dots.get(g);
        if (!d) {
          d = { ring: document.createElement("div"), dot: document.createElement("div") };
          d.ring.className = "pk-ring";
          // 테두리 모서리는 사진 모서리를 따라 (네모 사진에 둥근 테두리가 겹치지 않게)
          d.ring.style.borderRadius = getComputedStyle(g).borderRadius || "0px";
          d.dot.className = "pk-dot";
          d.dot.innerHTML = CHECK;
          layer.appendChild(d.ring);
          layer.appendChild(d.dot);
          dots.set(g, d);
        }
        keep.add(g);
        var on = isPicked(g);
        d.dot.className = "pk-dot" + (on ? " on" : "") + (hover === g ? " hov" : "");
        d.ring.className = "pk-ring" + (on ? " on" : "");
        d.dot.style.left = Math.round(r.right - 34) + "px";
        d.dot.style.top = Math.round(r.top + 8) + "px";
        d.ring.style.left = Math.round(r.left) + "px";
        d.ring.style.top = Math.round(r.top) + "px";
        d.ring.style.width = Math.round(r.width) + "px";
        d.ring.style.height = Math.round(r.height) + "px";
      });
    dots.forEach(function (d, g) {
      if (keep.has(g)) return;
      d.dot.remove();
      d.ring.remove();
      dots.delete(g);
    });
  };
  var raf = 0;
  var req = function () {
    if (!raf)
      raf = requestAnimationFrame(function () {
        raf = 0;
        place();
      });
  };
  var timer = setInterval(req, 400); // 늦게 뜨는 사진·무한 스크롤

  var draw = function () {
    var n = picked.length;
    count.textContent = n + "개";
    count.classList.toggle("has", n > 0);
    go.textContent = n ? n + "개 담기" : "담기";
    go.disabled = !n;
    clear.classList.toggle("pk-hide", !n);
    hint.textContent = n ? "더 고르거나 '" + n + "개 담기'를 눌러요 · 다시 누르면 빠져요" : "담을 상품 사진을 눌러 골라요";
    req();
  };

  // 고르는 동안은 상품 창이 안 열리게 — 누르기 관련 일을 전부 먼저 받아서 막는다
  var EV = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  var block = function (e) {
    if (running) return;
    var g = cardImg(e.target);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== "click") return;
    var i = picked.findIndex(function (p) {
      return p.el === g;
    });
    if (i >= 0) picked.splice(i, 1);
    else picked.push({ el: g, src: g.currentSrc || g.src });
    draw();
  };
  var over = function (e) {
    if (running) return;
    var g = cardImg(e.target);
    if (g !== hover) {
      hover = g;
      req();
    }
  };
  var key = function (e) {
    if (e.key === "Escape" && !running) end();
  };
  var on = function () {
    EV.forEach(function (t) {
      document.addEventListener(t, block, true);
    });
    document.addEventListener("pointerover", over, true);
    document.addEventListener("keydown", key, true);
    addEventListener("scroll", req, true);
    addEventListener("resize", req);
  };
  var off = function () {
    EV.forEach(function (t) {
      document.removeEventListener(t, block, true);
    });
    document.removeEventListener("pointerover", over, true);
    document.removeEventListener("keydown", key, true);
  };
  var end = function () {
    off();
    removeEventListener("scroll", req, true);
    removeEventListener("resize", req);
    clearInterval(timer);
    bar.classList.remove("in");
    layer.remove();
    css.remove();
    setTimeout(function () {
      bar.remove();
    }, 240);
    window.__pocloBar = null;
    window.__pocloBatchStop = null;
  };
  window.__pocloBatchStop = end;
  x.onclick = end;
  clear.onclick = function () {
    picked = [];
    draw();
  };
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
    var btn = [].slice
      .call(document.querySelectorAll("button,[role=button],a,span,div"))
      .filter(function (e) {
        var t = (e.getAttribute("aria-label") || "") + " " + (e.childElementCount === 0 ? e.textContent : "");
        var r = e.getBoundingClientRect();
        return /닫기|close|^\s*[✕×xX]\s*$/i.test(t.trim()) && r.width > 0 && r.width < 80 && r.height > 0 && !e.closest("[data-poclo]");
      })
      .pop();
    if (btn) {
      btn.click();
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
  // 막대 모양: 고르기 / 담는 중 / 끝
  var stage = function (s, t, h) {
    bar.classList.toggle("run", s === "run");
    bar.classList.toggle("done", s === "done");
    title.textContent = t;
    hint.textContent = h || "";
    [count, clear, one, go].forEach(function (b) {
      b.classList.toggle("pk-hide", s !== "pick");
    });
    $(".pk-logo").innerHTML = s === "done" ? CHECK : "P";
  };

  go.onclick = async function () {
    if (!picked.length) return;
    running = true;
    off();
    var list = picked.slice();
    picked = [];
    place(); // 동그라미·테두리 치우기
    x.setAttribute("aria-label", "멈추기");
    x.textContent = "멈추기";
    x.classList.add("wide");
    var halt = false;
    stage("run", "담기 창을 여는 중…", "포클로ERP 작은 창이 열려요");
    x.onclick = function () {
      halt = true;
      hint.textContent = "지금 상품까지만 읽고 멈춰요";
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
    var finish = function (t, h, ok2) {
      window.removeEventListener("message", hear);
      stage(ok2 ? "done" : "pick-off", t, h);
      [count, clear, one, go].forEach(function (b) {
        b.classList.add("pk-hide");
      });
      x.setAttribute("aria-label", "닫기");
      x.textContent = "닫기";
      x.onclick = end;
      if (ok2) setTimeout(end, 6000);
    };
    if (
      !(await until(function () {
        return ready;
      }, 15000))
    ) {
      finish("담기 창이 준비되지 않았어요", "포클로ERP 에 로그인돼 있는지 확인하고 다시 눌러 주세요", false);
      return;
    }
    post({ poclo: "start", n: list.length });
    var last = "",
      done = 0,
      fail = 0;
    for (var i = 0; i < list.length && !halt; i++) {
      stage("run", i + 1 + " / " + list.length + " 읽는 중", "창이 저절로 열리고 닫혀요 — 화면은 그대로 두세요");
      prog.style.width = Math.round((i / list.length) * 100) + "%";
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
    prog.style.width = "100%";
    post({ poclo: "end", n: list.length, sent: done, fail: fail, halted: halt });
    finish(done + "개 보냈어요", (fail ? "못 읽은 것 " + fail + "개 · " : "") + (halt ? "중간에 멈췄어요 · " : "") + "담기 창에서 확인하세요", true);
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
