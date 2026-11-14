// 이 기기 저장 공간(브라우저 localStorage — 한 사이트에 약 5MB) 지키기 (11/14)
//
// 세원: "포클로에 담기 누를 때마다 로그인해야 돼." — 세원 크롬의 저장 공간이 꽉 차 있었다(5,242,870자 / 쓰기 시험 QuotaExceededError).
// 로그인 라이브러리는 시작할 때 저장 공간에 한 번 써 보고, 안 써지면 **로그인을 메모리에만** 둔다 →
// 창을 새로 열 때마다(담기 창 포함) 로그인 기록을 못 읽어 로그인 창이 떴다(남아 있던 예전 기록은 만료돼 못 씀).
// 공간을 채운 건 서버 값의 '이 기기 사본'(poclo_<settings 키>) — 경쟁몰 트래커 날짜별 사본 하나가 약 420K, 7개면 약 3MB.
// 사본은 지워도 서버에 그대로 있다(공유 장부 모드에서). 그래서:
//   · 로그인 기록은 늘 먼저 — 안 써지면 사본을 큰 것부터 지우고 다시 쓴다 (supabase.js authStorage)
//   · 날짜별 사본(tracker_2026-10-23 · report_…)은 이 기기에 남기지 않는다 (shoot.js loadKey)
//   · 사본이 안 써지면 다른 사본을 지우지 않고 그 키의 예전 사본만 지운다(낡은 값을 보여 주지 않게)
//   · 앱을 열 때 날짜별 사본을 치우고, 너무 차 있으면 큰 사본부터 줄인다 (trimLocal)
// ⚠ 이 기기 저장 모드(Supabase 설정 없음)에서는 poclo_ 키가 진짜 장부라 아무것도 지우지 않는다 — remote 일 때만 부른다.

/** 서버에 없는 이 기기 것 — 지우면 안 됨 (만들던 발주·기획, 이 기기 저장 모드 사진) */
const KEEP = /draft|photos/i;
/** 날짜별 사본 — 그날 화면을 다시 볼 때 서버에서 읽으면 된다 */
export const DATED = /_\d{4}-\d{2}-\d{2}$/;
const MIN_EVICT = 8 * 1024; // 이보다 작은 건 설정값이라 건드리지 않는다

function entries() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out.push([k, (localStorage.getItem(k) || "").length + k.length]);
    }
  } catch {
    /* 못 읽으면 빈 목록 */
  }
  return out;
}

/** 지워도 되는 사본 — 날짜별 사본(예전 날짜 먼저) 다음 큰 것부터 */
function evictable() {
  const list = entries().filter(([k, n]) => k.startsWith("poclo_") && !KEEP.test(k) && (DATED.test(k) || n >= MIN_EVICT));
  return list.sort((a, b) => {
    const da = DATED.test(a[0]),
      db = DATED.test(b[0]);
    if (da !== db) return da ? -1 : 1;
    if (da && db) return a[0].slice(-10).localeCompare(b[0].slice(-10));
    return b[1] - a[1];
  });
}

/** need 자 만큼 자리를 낸다 — 지운 키 이름들을 돌려준다 */
export function freeSpace(need = 0, except = "") {
  const gone = [];
  let freed = 0;
  for (const [k, n] of evictable()) {
    if (k === except) continue;
    try {
      localStorage.removeItem(k);
      gone.push(k);
      freed += n;
    } catch {
      /* 무시 */
    }
    if (freed >= need + 256 * 1024) break; // 여유 256K 더
  }
  return gone;
}

/**
 * 이 기기에 쓰기. 공간이 모자라면:
 *  - evict: true(로그인 기록) → 사본을 지우고 다시 쓴다
 *  - 아니면(사본) → 쓰지 않고, 그 키의 예전 사본을 지운다(낡은 값을 안 보이게)
 * 써졌으면 true.
 */
export function safeSet(key, str, { evict = false } = {}) {
  try {
    localStorage.setItem(key, str);
    return true;
  } catch {
    /* 가득 참 — 아래 */
  }
  if (evict) {
    freeSpace(str.length * 2, key);
    try {
      localStorage.setItem(key, str);
      return true;
    } catch {
      return false;
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
  return false;
}

/** 앱을 열 때 한 번 — 날짜별 사본을 치우고, 3MB 넘게 차 있으면 2MB 아래로 줄인다(로그인·다른 사본이 쓸 자리) */
export function trimLocal() {
  const all = entries();
  for (const [k] of all) {
    if (k.startsWith("poclo_") && DATED.test(k) && !KEEP.test(k)) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* 무시 */
      }
    }
  }
  const total = entries().reduce((s, [, n]) => s + n, 0);
  if (total > 3 * 1024 * 1024) freeSpace(total - 2 * 1024 * 1024);
}
