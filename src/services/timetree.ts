import type {
  Entry,
  ShiftRule,
} from "../types";

export type TimeTreeImportEvent = {
  key: string;
  date: string;
  shift: string;
  title: string;
  labelName: string;
  allDay: boolean;
  startAt: number;
  endAt: number;
  note: string;
};

export type TimeTreeImportPayload = {
  schema: "sicu-roster-v1";
  createdAt: string;
  person: string;
  year: number;
  month: number;
  calendarName: string;
  events: TimeTreeImportEvent[];
};

const TITLES: Record<string, string> = {
  D: "白班",
  E: "小夜班",
  N: "大夜班",
};

const NL =
  String.fromCharCode(10);

function pad(
  value: number
): string {
  return String(value).padStart(
    2,
    "0"
  );
}

function localDateTime(
  year: number,
  month: number,
  day: number,
  time: string
): Date {
  const parts =
    time
      .split(":")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    parts[0],
    parts[1],
    0,
    0
  );
}

function localMidnight(
  year: number,
  month: number,
  day: number
): Date {
  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0
  );
}

function yyyyMmDd(
  year: number,
  month: number,
  day: number
): string {
  return (
    year +
    "-" +
    pad(month) +
    "-" +
    pad(day)
  );
}

export function buildTimeTreePayload(
  entries: Entry[],
  rules: ShiftRule[],
  year: number,
  month: number,
  person: string
): TimeTreeImportPayload {
  const events:
    TimeTreeImportEvent[] = [];

  for (
    const entry of entries
  ) {
    if (
      entry.enabled === false
    ) {
      continue;
    }

    const title =
      TITLES[entry.main];

    if (
      title === undefined
    ) {
      continue;
    }

    const rule =
      rules.find(
        (r) =>
          r.code === entry.main
      );

    if (
      rule === undefined
    ) {
      continue;
    }

    /*
     * TimeTree 顯示規則：
     * 白班、小夜班、大夜班皆建立為全天行程，
     * 讓 TimeTree 月曆中的標籤顏色顯示為實心。
     *
     * 實際上下班時間仍保留在備註內。
     */
    const allDay = true;

    const start =
      localMidnight(
        year,
        month,
        entry.day
      );

    /*
     * TimeTree 的單日全天活動使用同一天作為
     * start_at 與 end_at，避免延伸到隔天。
     */
    const end =
      localMidnight(
        year,
        month,
        entry.day
      );

    /*
     * 這兩個值只用於備註，
     * 不影響 TimeTree 全天顯示。
     */
    const actualStart =
      localDateTime(
        year,
        month,
        entry.day,
        rule.start
      );

    let actualEnd =
      localDateTime(
        year,
        month,
        entry.day,
        rule.end
      );

    if (
      actualEnd.getTime() <=
      actualStart.getTime()
    ) {
      actualEnd = new Date(
        year,
        month - 1,
        entry.day + 1,
        actualEnd.getHours(),
        actualEnd.getMinutes(),
        0,
        0
      );
    }

    const date =
      yyyyMmDd(
        year,
        month,
        entry.day
      );

    const marker =
      "SICU-ROSTER:" +
      year +
      "-" +
      pad(month) +
      ":" +
      person +
      ":" +
      pad(entry.day);

    const noteLines = [
      marker,
      "原始班別：" +
        entry.raw,
      "實際班別時間：" +
        rule.start +
        "–" +
        rule.end,
    ];

    events.push({
      key: marker,
      date,
      shift:
        entry.main,
      title,
      labelName:
        title,
      allDay,
      startAt:
        start.getTime(),
      endAt:
        end.getTime(),
      note:
        noteLines.join(NL),
    });
  }

  return {
    schema:
      "sicu-roster-v1",

    createdAt:
      new Date()
        .toISOString(),

    person,
    year,
    month,

    calendarName:
      "娟&翰",

    events,
  };
}

export async function copyTimeTreePayload(
  payload:
    TimeTreeImportPayload
): Promise<void> {
  const content =
    JSON.stringify(payload);

  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      content
    );

    return;
  }

  const area =
    document.createElement(
      "textarea"
    );

  area.value =
    content;

  area.style.position =
    "fixed";

  area.style.left =
    "-9999px";

  document.body.appendChild(
    area
  );

  area.focus();
  area.select();

  const copied =
    document.execCommand(
      "copy"
    );

  document.body.removeChild(
    area
  );

  if (
    copied === false
  ) {
    throw new Error(
      "瀏覽器無法使用剪貼簿"
    );
  }
}
