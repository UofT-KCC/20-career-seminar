// 세미나 기본 정보 — 날짜/링크가 바뀌면 여기만 고치면 됩니다.

export const EVENT_START = new Date("2026-11-21T20:00:00-05:00");

export const TIMEZONES = {
  est: { label: "EST", date: "2026.11.21 (토)", time: "오후 8:00" },
  kst: { label: "KST", date: "2026.11.22 (일)", time: "오전 10:00" },
} as const;

export type TimezoneKey = keyof typeof TIMEZONES;

// TODO: 실제 구글 폼 링크로 교체
export const LINKS = {
  signup: "#",
  story: "#",
};

// TODO: 사연 마감일 확정되면 수정
export const STORY_DEADLINE = "11월 16일 (월)";

export type Fork = {
  id: string;
  label: string;
  question: string;
  options: [string, string];
  echo: string;
};

export const FORKS: Fork[] = [
  {
    id: "major",
    label: "갈림길 01 · 전공",
    question: "전공을 정할 때, 나는",
    options: ["한 우물 파기", "넓게 탐색하기"],
    echo: "스페셜리스트와 메이저·마이너, 선배님들은 지금 뭐라고 할까요?",
  },
  {
    id: "after-grad",
    label: "갈림길 02 · 졸업 이후",
    question: "졸업장을 받은 다음 날, 나는",
    options: ["대학원 진학", "바로 취업"],
    echo: "대학원과 취업 사이, 선배님들이 세운 기준을 들어봐요.",
  },
  {
    id: "where",
    label: "갈림길 03 · 어디서",
    question: "커리어를 시작할 곳은",
    options: ["캐나다에 남기", "한국으로 가기"],
    echo: "두 곳을 직접 겪어본 선배님들의 솔직한 비교가 기다리고 있어요.",
  },
  {
    id: "offer",
    label: "갈림길 04 · 오퍼",
    question: "두 개의 오퍼가 왔다면",
    options: ["연봉이 높은 곳", "배울 게 많은 곳"],
    echo: "오퍼를 비교할 때 숫자 말고 봐야 할 것들, 그리고 이직 이야기까지.",
  },
];

export const TRACKS = ["금융", "컨설팅", "회계", "한국 취업"] as const;
export type Track = (typeof TRACKS)[number];
