import type { Entry, ShiftRule } from "../types";

export type TimeTreeImportEvent = {
  key: string;
  date: string;
  shift: string;
  title: string;
  labelName: string;
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

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateTime(
  year: number,
  month: number,
  day: number,
  time: string
): Date {
  const parts = time.split(":").map(Number);

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

function yyyyMmDd(year: number, month: number, day: number): string {
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
  const events: TimeTreeImportEvent[] = [];

  for (const entry of entries) {
    if (entry.enabled === false) continue;

    const title = TITLES[entry.main];
    if (title === undefined) continue;

    const rule = rules.find((r) => r.code === entry.main);
    if (rule === undefined) continue;

    const start = localDateTime(
      year,
      month,
      entry.day,
      rule.start
    );

    let end = localDateTime(
      year,
      month,
      entry.day,
      rule.end
    );

    /*
     * 謝佩娟專屬顯示規則：
     * 小夜或大夜若跨日，TimeTree 只顯示在開始日期。
     * 真正的排班結束時間仍保留在備註。
     */
    if (end <= start) {
      end = new Date(
        year,
        month - 1,
        entry.day,
        23,
        59,
        0,
        0
      );
    }

    const date = yyyyMmDd(year, month, entry.day);

    const marker =
      "SICU-ROSTER:" +
      year +
      "-" +
      pad(month) +
      ":" +
      person +
      ":" +
      pad(entry.day);

    events.push({
      key: marker,
      date,
      shift: entry.main,
      title,
      labelName: title,
      startAt: start.getTime(),
      endAt: end.getTime(),
      note:
        marker +
        "\n原始班別：" +
        entry.raw +
        "\n實際班別時間：" +
        rule.start +
        "–" +
        rule.end,
    });
  }

  return {
    schema: "sicu-roster-v1",
    createdAt: new Date().toISOString(),
    person,
    year,
    month,
    calendarName: "娟&翰",
    events,
  };
}

export async function copyTimeTreePayload(
  payload: TimeTreeImportPayload
): Promise<void> {
  const content = JSON.stringify(payload);

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const area = document.createElement("textarea");
  area.value = content;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.focus();
  area.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(area);

  if (copied === false) {
    throw new Error("瀏覽器無法使用剪貼簿");
  }
}
export function openTimeTreeImport(payload: TimeTreeImportPayload): void {
  window.name = JSON.stringify(payload);

  window.location.href = "https://timetreeapp.com/";
}
