const PLAYER_NAME_SYLLABLES = [
  "아", "에", "이", "오", "우", "야", "예", "요", "유",
  "라", "레", "리", "로", "루", "르", "란", "렌", "린", "론", "룬",
  "카", "케", "키", "코", "쿠", "크", "칸", "켄", "킨", "콘", "쿤",
  "타", "테", "티", "토", "투", "트", "탄", "텐", "틴", "톤", "툰",
  "파", "페", "피", "포", "푸", "프", "판", "펜", "핀", "폰", "푼",
  "사", "세", "시", "소", "수", "스", "산", "센", "신", "손", "순",
  "자", "제", "지", "조", "주", "즈", "잔", "젠", "진", "존", "준",
  "나", "네", "니", "노", "누", "느", "난", "넨", "닌", "논", "눈",
  "마", "메", "미", "모", "무", "므", "만", "멘", "민", "몬", "문",
  "바", "베", "비", "보", "부", "브", "반", "벤", "빈", "본", "분",
  "다", "데", "디", "도", "두", "드", "단", "덴", "딘", "돈", "둔",
  "하", "헤", "히", "호", "후", "흐", "한", "헨", "힌", "혼", "훈",
  "엘", "알", "일", "올", "울", "벨", "델", "셀", "젤", "첼", "켈", "텔", "펠", "헬",
] as const;

export function createRandomSeed() {
  const randomValue = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValue);
  return (randomValue[0] ^ Date.now()) >>> 0;
}

export function createRandomPlayerName() {
  let seed = createRandomSeed();
  const length = 2 + seed % 3;
  return Array.from({ length }, () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507) >>> 0;
    return PLAYER_NAME_SYLLABLES[seed % PLAYER_NAME_SYLLABLES.length];
  }).join("");
}

export function createDeckName() {
  const length = 1 + Math.floor(Math.random() * 6);
  const spaceAfter = length > 2 && Math.random() < .3
    ? 1 + Math.floor(Math.random() * (length - 1))
    : -1;
  return Array.from(
    { length },
    (_, index) => `${PLAYER_NAME_SYLLABLES[Math.floor(Math.random() * PLAYER_NAME_SYLLABLES.length)]}${index + 1 === spaceAfter ? " " : ""}`,
  ).join("");
}
