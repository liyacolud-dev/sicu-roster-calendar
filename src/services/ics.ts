import type { Entry, ShiftRule } from "../types";

const pad = (n: number): string => String(n).padStart(2, "0");

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function hms(d: Date): string {
  return `${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

export function makeICS(
  entries: Entry[],
  rules: ShiftRule[],
  year: number,
  month: number,
  name: string
): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SICU Roster//TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SICU班表",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Taipei",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const e of entries) {
    if (!e.enabled) continue;

    const rule = rules.find((r) => r.code === e.main);
    if (!rule) continue;

    const day = new Date(year, month - 1, e.day);
    const uid = `${ymd(day)}-${e.main}-${encodeURIComponent(name)}@sicu-roster`;

    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`);

    if (rule.allDay) {
      const next = new Date(year, month - 1, e.day + 1);
      lines.push(
        `DTSTART;VALUE=DATE:${ymd(day)}`,
        `DTEND;VALUE=DATE:${ymd(next)}`
      );
    } else {
      const [sh, sm] = rule.start.split(":").map(Number);
      const [eh, em] = rule.end.split(":").map(Number);

      const start = new Date(year, month - 1, e.day, sh, sm);
      const end = new Date(year, month - 1, e.day, eh, em);

      // 結束時間早於或等於開始時間，視為跨日（例如 E 班 16:00–00:00）
      if (end <= start) end.setDate(end.getDate() + 1);

      lines.push(
        `DTSTART;TZID=Asia/Taipei:${ymd(start)}T${hms(start)}`,
        `DTEND;TZID=Asia/Taipei:${ymd(end)}T${hms(end)}`
      );
    }

    const desc = `原始代碼：${e.raw}${e.note ? `；註記：${e.note}` : ""}`;

    lines.push(
      `SUMMARY:${esc(rule.label)}`,
      `DESCRIPTION:${esc(desc)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
