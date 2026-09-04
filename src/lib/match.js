// 장끼에서 읽은 거래처를 기존 거래처와 맞춰본다.
//
// 이름은 사진마다 흔들린다("ONE PICK" / "원픽" / "ONE PICK (원픽)").
// 전화번호와 계좌번호는 안 흔들린다. 그래서 번호를 먼저 본다.

const digits = (s) => String(s || "").replace(/\D/g, "");

/** 비교용으로 이름을 뭉갠다 — 공백·기호를 털고 소문자로 */
export function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s.,\-_/()[\]]/g, "");
}

/**
 * 한 이름에서 비교할 조각들을 뽑는다.
 * "ONE PICK (원픽)"은 통째로도, 괄호 밖("ONE PICK")으로도, 괄호 안("원픽")으로도
 * 불린다. 괄호 안을 버리면 "원픽"과 못 만나므로 셋 다 남긴다.
 */
function variants(s) {
  const raw = String(s || "");
  const out = new Set();
  const add = (v) => {
    const n = normalizeName(v);
    if (n.length >= 2) out.add(n);
  };
  add(raw);
  add(raw.replace(/\([^)]*\)/g, ""));
  for (const m of raw.matchAll(/\(([^)]*)\)/g)) add(m[1]);
  return out;
}

const accountNumbers = (v) => (v.accounts || []).map((a) => digits(a.number)).filter(Boolean);

/**
 * 조각끼리 하나라도 같거나 포함되면 비슷한 이름으로 본다.
 * 자동으로 합치지 않고 후보를 보여주고 고르게 할 뿐이라 이 정도면 된다.
 */
function nameLooksClose(a, b) {
  const xs = variants(a);
  const ys = variants(b);
  for (const x of xs) {
    for (const y of ys) {
      if (x === y || x.includes(y) || y.includes(x)) return true;
    }
  }
  return false;
}

/**
 * 장끼에서 읽은 값(read)으로 기존 거래처를 찾는다.
 *
 * 반환:
 *   { kind: "exact",  vendor, reason }  전화·계좌가 같다 → 자동으로 이 거래처
 *   { kind: "maybe",  candidates }      이름만 비슷하다 → 사장님이 고른다
 *   { kind: "none" }                    새 거래처
 *
 * 이름만 비슷할 때 자동으로 합치지 않는 것이 중요하다. 다른 가게일 수 있다.
 */
export function matchVendor(read, vendors) {
  const phone = digits(read.phone);
  const account = digits(read.account);
  const bizNo = digits(read.bizNo);

  for (const v of vendors) {
    if (bizNo && digits(v.bizNo) === bizNo) {
      return { kind: "exact", vendor: v, reason: "사업자번호가 같아요" };
    }
    if (account && accountNumbers(v).includes(account)) {
      return { kind: "exact", vendor: v, reason: "계좌번호가 같아요" };
    }
    if (phone && digits(v.phone) === phone) {
      return { kind: "exact", vendor: v, reason: "전화번호가 같아요" };
    }
  }

  const candidates = vendors.filter((v) => nameLooksClose(v.name, read.vendor));
  if (candidates.length) return { kind: "maybe", candidates };
  return { kind: "none" };
}

/** 거래처 검색(돋보기) — 이름·위치·전화·계좌·예금주 어디든 걸리면 나온다 */
export function searchVendors(vendors, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return vendors;
  const qd = digits(q);
  return vendors.filter((v) => {
    const hay = [v.name, v.address, v.phone, v.bizNo, ...(v.accounts || []).flatMap((a) => [a.bank, a.number, a.holder])]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    return qd.length >= 3 && digits(hay).includes(qd);
  });
}
