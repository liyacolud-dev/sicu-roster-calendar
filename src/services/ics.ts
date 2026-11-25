import type { Entry, ShiftRule } from "../types";

export type IcsOptions = {
  sameDayOnly: boolean;
  titles: Record<string, string>;
  onlyCodes: string[];
};

const pad = (n: number): string => String(n).padStart(2, "0");

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function ymd(d: Date): string {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

function hms(d: Date): string {
  return pad(d.getHours()) + pad(d.getMinutes()) + "00";
}

export function makeICS(
  entries: Entry[],
  rules: ShiftRule[],
  year: number,
  month: number,
  name: string,
  opts?: IcsOptions
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

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
    if (e.enabled === false) continue;
    if (opts && opts.onlyCodes.length > 0 && opts.onlyCodes.indexOf(e.main) < 0) continue;

    const rule = rules.find((r) => r.code === e.main);
    if (rule === undefined) continue;

    const custom = opts ? opts.titles[e.main] : undefined;
    const title = custom ? custom : rule.label;

    const day = new Date(year, month - 1, e.day);
    const uid = ymd(day) + "-" + e.main + "-" + encodeURIComponent(name) + "@sicu-roster";

    lines.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp);

    let desc = "原始代碼：" + e.raw;

    if (rule.allDay) {
      const next = new Date(year, month - 1, e.day + 1);
      lines.push("DTSTART;VALUE=DATE:" + ymd(day), "DTEND;VALUE=DATE:" + ymd(next));
    } else {
      const s = rule.start.split(":").map(Number);
      const t = rule.end.split(":").map(Number);
      const start = new Date(year, month - 1, e.day, s[0], s[1]);
      let end = new Date(year, month - 1, e.day, t[0], t[1]);

      if (end <= start) end.setDate(end.getDate() + 1);

      // 專屬設定：跨夜班只顯示在開始當天
      if (opts && opts.sameDayOnly && ymd(end) > ymd(start)) {
        end = new Date(year, month - 1, e.day, 23, 59);
      }

      lines.push(
        "DTSTART;TZID=Asia/Taipei:" + ymd(start) + "T" + hms(start),
        "DTEND;TZID=Asia/Taipei:" + ymd(end) + "T" + hms(end)
      );
      desc = "實際時間：" + rule.start + "–" + rule.end + "；" + desc;
    }

    if (e.note) desc = desc + "；註記：" + e.note;

    lines.push(
      "SUMMARY:" + esc(title),
      "CATEGORIES:" + esc(title),
      "DESCRIPTION:" + esc(desc),
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
