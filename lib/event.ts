// 세미나 기본 정보 — 날짜/링크가 바뀌면 여기만 고치면 됩니다.

export const EVENT_START = new Date("2026-11-21T20:00:00-05:00");

export const TIMEZONES = {
  est: { label: "EST", date: "2026.11.21 (토)", time: "오후 8:00" },
  kst: { label: "KST", date: "2026.11.22 (일)", time: "오전 10:00" },
} as const;

export type TimezoneKey = keyof typeof TIMEZONES;

export const LINKS = {
  zoom: "https://utoronto.zoom.us/j/89038952106?pwd=PwHPSE7gml7FkcitlGAa7ovrqvGkqN.1",
};

// 줌 회의 ID와 암호 (비워두면 화면에 표시되지 않습니다)
export const ZOOM_ID: string = "890 3895 2106";
export const ZOOM_PASSCODE: string = "UTKCC";

export type Fork = {
  id: string;
  label: string;
  question: string;
  options: [string, string];
  /** Each option's letter in the career type code, with the word it stands for. */
  codes: [[string, string], [string, string]];
  /** Shown beside each sign while it is hovered. */
  details: [string, string];
  echo: string;
};

export const FORKS: Fork[] = [
  {
    id: "major",
    label: "갈림길 01 · 전공",
    question: "전공을 정할 때, 나는",
    options: ["한 우물 파기", "넓게 탐색하기"],
    codes: [["D", "Deep"], ["B", "Broad"]],
    details: [
      "한 분야를 깊게 파고들어 스페셜리스트가 된 선배님들의 이야기",
      "메이저·마이너를 넘나들며 자기만의 조합을 찾은 선배님들의 이야기",
    ],
    echo: "스페셜리스트와 메이저·마이너, 선배님들은 지금 뭐라고 할까요?",
  },
  {
    id: "after-grad",
    label: "갈림길 02 · 졸업 이후",
    question: "졸업장을 받은 다음 날, 나는",
    options: ["대학원 진학", "바로 취업"],
    codes: [["A", "Academia"], ["W", "Work"]],
    details: [
      "석사·박사, 언제 가야 하고 졸업 후 무엇이 달라지는지",
      "졸업 직후 첫 직장을 잡기까지의 준비 과정과 타이밍",
    ],
    echo: "대학원과 취업 사이, 선배님들이 세운 기준을 들어봐요.",
  },
  {
    id: "where",
    label: "갈림길 03 · 어디서",
    question: "커리어를 시작할 곳은",
    options: ["캐나다에 남기", "한국으로 가기"],
    codes: [["C", "Canada"], ["K", "Korea"]],
    details: [
      "워크퍼밋·PR부터 현지 직장 문화까지, 캐나다에서 자리 잡기",
      "공채와 경력 채용, 해외 대학 출신으로 한국에서 시작하기",
    ],
    echo: "두 곳을 직접 겪어본 선배님들의 솔직한 비교가 기다리고 있어요.",
  },
  {
    id: "first-job",
    label: "갈림길 04 · 첫 직장",
    question: "첫 직장을 고른다면, 나는",
    options: ["체계가 잡힌 큰 회사", "빠르게 크는 작은 팀"],
    codes: [["S", "Structure"], ["F", "Fast"]],
    details: [
      "탄탄한 교육과 체계 속에서 기본기를 다지는 첫 커리어",
      "넓은 역할을 맡아 부딪히며 빠르게 배우는 첫 커리어",
    ],
    echo: "큰 조직과 작은 팀, 양쪽을 겪어본 선배님들의 첫 직장 이야기를 들어봐요.",
  },
];

export const TRACKS = ["금융", "컨설팅", "회계", "한국 취업"] as const;
export type Track = (typeof TRACKS)[number];
