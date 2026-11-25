import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { TextItem, Entry } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ===== 班別字典 =====
const LEAVE = ["產檢", "共識", "體側", "息", "例", "國", "補", "特", "公", "病", "喪"];
const UNIT = `(?:[DENC][新#]?|${LEAVE.join("|")})`;
const TOKEN_SRC = `${UNIT}(?:\\/${UNIT})?`;

const NOT_NAME = new Set([
  ...LEAVE,
  "姓名", "職稱", "日期", "星期", "護理師", "護理長", "副護理長",
  "小計", "總計", "合計", "備註", "排班表", "加護病房", "班別",
]);

// ===== 讀取 PDF（保留原始字串，方便估算每個字的位置）=====
export async function extract(file: File): Promise<TextItem[]> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items as any[]) {
      const text: string = raw.str || "";
      if (!text.trim()) continue;
      out.push({ text, x: raw.transform[4], y: raw.transform[5], width: raw.width || 0, page: p });
    }
  }
  return out;
}

// 估算一段文字中第 index 個字的水平中心位置
function charX(it: TextItem, index: number): number {
  const n = Math.max(it.text.length, 1);
  return it.x + (it.width * (index + 0.5)) / n;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ===== 年月偵測 =====
function detectMonth(items: TextItem[]): number {
  const count = new Map<number, number>();
  for (const it of items) {
    const re = /(1[0-2]|[1-9])\/\d/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(it.text))) {
      const mo = Number(m[1]);
      count.set(mo, (count.get(mo) || 0) + 1);
    }
  }
  let best = new Date().getMonth() + 1;
  let max = 0;
  count.forEach((v, k) => { if (v > max) { max = v; best = k; } });
  return best;
}

export function detectYearMonth(items: TextItem[]): { year: number; month: number } {
  const all = items.map((i) => i.text).join(" ");
  const month = detectMonth(items);
  let year = new Date().getFullYear();
  const roc = all.match(/(1\d{2})\s*年/);
  const ad = all.match(/(20\d{2})\s*年/);
  if (ad) year = Number(ad[1]);
  else if (roc) year = Number(roc[1]) + 1911;
  return { year, month };
}

// ===== 日期欄位（處理 12/1012/11 這種黏在一起的表頭）=====
type Col = { day: number; x: number };

function dateColumns(items: TextItem[], page: number, month: number): Col[] {
  const key = `${month}/`;
  const cols = new Map<number, Col>();
  for (const it of items) {
    if (it.page !== page) continue;
    const t = it.text;
    let idx = t.indexOf(key);
    while (idx !== -1) {
      const dayStart = idx + key.length;
      let next = t.indexOf(key, dayStart + 1);
      let end = next === -1 ? t.length : next;
      const digits = (t.slice(dayStart, end).match(/^\d{1,2}/) || [""])[0];
      const day = Number(digits);
      if (day >= 1 && day <= 31 && !cols.has(day)) {
        const mid = idx + (key.length + digits.length - 1) / 2;
        cols.set(day, { day, x: charX(it, mid) });
      }
      idx = next;
    }
  }
  return [...cols.values()].sort((a, b) => a.x - b.x);
}

// ===== 姓名列 =====
type NameRow = { name: string; page: number; y: number };

function nameRows(items: TextItem[]): NameRow[] {
  const month = detectMonth(items);
  const pages = [...new Set(items.map((i) => i.page))];
  const rows: NameRow[] = [];
  for (const page of pages) {
    const cols = dateColumns(items, page, month);
    if (!cols.length) continue;
    const firstX = cols[0].x;
    for (const it of items) {
      if (it.page !== page) continue;
      const t = it.text.trim();
      if (!/^[\u4e00-\u9fff]{2,4}$/.test(t)) continue;
      if (NOT_NAME.has(t)) continue;
      if (it.x + it.width > firstX - 5) continue; // 必須在日期欄左邊
      rows.push({ name: t, page, y: it.y });
    }
  }
  return rows.sort((a, b) => a.page - b.page || b.y - a.y);
}

export function names(items: TextItem[]): string[] {
  return [...new Set(nameRows(items).map((r) => r.name))];
}

// ===== 拆解單格內容 =====
function parseCell(tokens: string[]): { main: string; note: string } {
  if (!tokens.length) return { main: "", note: "" };
  const first = tokens[0];
  const rest = tokens.slice(1).join(" ");
  let main: string;
  let note: string;
  if (/^[DENC]/.test(first)) {
    main = first[0];
    note = first.slice(1);
  } else {
    const parts = first.split("/");
    main = parts[0];
    note = parts.length > 1 ? "/" + parts.slice(1).join("/") : "";
  }
  return { main, note: [note, rest].filter(Boolean).join(" ") };
}

// ===== 取出某人的整月班表 =====
export function rowFor(items: TextItem[], name: string, _month?: number): Entry[] {
  const rows = nameRows(items);
  const row = rows.find((r) => r.name === name);
  if (!row) return [];

  const month = detectMonth(items);
  const cols = dateColumns(items, row.page, month);
  if (!cols.length) return [];

  const colW = median(cols.slice(1).map((c, i) => c.x - cols[i].x)) || 15;
  const samePage = rows.filter((r) => r.page === row.page).map((r) => r.y).sort((a, b) => b - a);
  const rowGap = median(samePage.slice(1).map((y, i) => samePage[i] - y)) || 12;
  const tolY = Math.min(6, rowGap * 0.45);

  const minX = cols[0].x - colW / 2;
  const maxX = cols[cols.length - 1].x + colW / 2;
  const cells = new Map<number, string[]>();

  for (const it of items) {
    if (it.page !== row.page) continue;
    if (Math.abs(it.y - row.y) > tolY) continue;
    const re = new RegExp(TOKEN_SRC, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(it.text))) {
      const cx = charX(it, m.index + (m[0].length - 1) / 2);
      if (cx < minX || cx > maxX) continue;
      let best = cols[0];
      for (const c of cols) if (Math.abs(c.x - cx) < Math.abs(best.x - cx)) best = c;
      if (Math.abs(best.x - cx) > colW * 0.6) continue;
      const list = cells.get(best.day) || [];
      list.push(m[0]);
      cells.set(best.day, list);
    }
  }

  return cols.map((c) => {
    const tokens = cells.get(c.day) || [];
    const { main, note } = parseCell(tokens);
    return {
      day: c.day,
      raw: tokens.join(" "),
      main,
      note,
      enabled: ["D", "E", "N", "C"].includes(main),
    };
  });
}
