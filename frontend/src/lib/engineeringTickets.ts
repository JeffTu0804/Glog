import type { Asset, TicketPriority } from "../types/api";

export const SKILL_OPTIONS = [
  { id: "plumbing", label: "水電" },
  { id: "electrical", label: "電力" },
  { id: "hvac", label: "空調" },
  { id: "carpentry", label: "木工/門窗" },
] as const;

export const SKILL_LABELS: Record<string, string> = Object.fromEntries(
  SKILL_OPTIONS.map((s) => [s.id, s.label]),
);

export const PRIORITY_OPTIONS: Array<{
  value: TicketPriority;
  label: string;
  hint: string;
}> = [
  { value: "LOW", label: "低", hint: "可排入日常巡檢" },
  { value: "MEDIUM", label: "中", hint: "當班內處理" },
  { value: "HIGH", label: "高", hint: "2 小時內回應" },
  { value: "URGENT", label: "緊急", hint: "立即派工（停水/漏電等）" },
];

export const ISSUE_TEMPLATES: Array<{
  label: string;
  title: string;
  skills: string[];
  priority: TicketPriority;
  description?: string;
}> = [
  {
    label: "水龍頭漏水",
    title: "水龍頭漏水",
    skills: ["plumbing"],
    priority: "HIGH",
    description: "客房水龍頭滴水或漏水，請檢查墊片/閥芯",
  },
  {
    label: "馬桶異常",
    title: "馬桶堵塞/異常",
    skills: ["plumbing"],
    priority: "HIGH",
    description: "馬桶無法沖水、堵塞或持續流水",
  },
  {
    label: "冷氣不冷",
    title: "冷氣不冷/異常",
    skills: ["hvac"],
    priority: "MEDIUM",
    description: "空調無冷風、異音或遙控無反應",
  },
  {
    label: "燈具故障",
    title: "燈具故障",
    skills: ["electrical"],
    priority: "MEDIUM",
  },
  {
    label: "門鎖問題",
    title: "門鎖/房門故障",
    skills: ["carpentry"],
    priority: "HIGH",
    description: "房卡無法開門、門鎖卡住或門片異常",
  },
  {
    label: "熱水異常",
    title: "熱水供應異常",
    skills: ["plumbing", "hvac"],
    priority: "URGENT",
    description: "完全無熱水或水溫明顯不足",
  },
];

/** 依樓層分組客房地點（工程派工用） */
export function groupAssetsByFloor(assets: Asset[]) {
  const rooms = assets.filter((a) => a.type === "ROOM");
  const others = assets.filter((a) => a.type !== "ROOM");

  const floors = new Map<string, Asset[]>();
  for (const room of rooms) {
    const floor = room.location?.replace(/F$/i, "") ?? "其他";
    const key = floor.match(/^\d+$/) ? `${floor}F` : floor;
    const list = floors.get(key) ?? [];
    list.push(room);
    floors.set(key, list);
  }

  const sortedFloors = [...floors.entries()].sort(([a], [b]) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b, "zh-TW");
  });

  for (const [, list] of sortedFloors) {
    list.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  }

  return { floors: sortedFloors, others };
}

export function buildTicketTitle(roomCode: string, issueTitle: string) {
  const trimmed = issueTitle.trim();
  if (!trimmed) return `${roomCode} 號房報修`;
  if (trimmed.includes(roomCode)) return trimmed;
  return `${roomCode} 號房 ${trimmed}`;
}
