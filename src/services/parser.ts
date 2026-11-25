import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { TextItem, Entry } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const LEAVE = ["產檢", "共識", "體側", "息", "例", "國", "補", "特", "公", "病", "喪"];
const UNIT = `(?:[DENC][新#]?|${LEAVE.join("|")})`;
const TOKEN_SRC = `${UNIT}(?:\\/${UNIT})?`;

const NOT_NAME = new Set([
  ...LEAVE,
  "姓名", "職稱", "日期", "星期", "護理師", "護理長", "副護理長",
  "小計", "總計", "合計", "備註", "排班表", "加護病房", "班別",
]);

export async function extract(file: File): Promise<TextItem[]> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const raws: any[] = (content.items as any[]).filter(
      (r) => typeof r.str === "string" && r.str.trim() !== ""
    );
    const mats = raws.map((r) => pdfjsLib.Util.transform(viewport.transform, r.transform));

    // 判斷這一頁文字的主要方向（處理旋轉過的頁面）
    const votes = new Map<string, number>();
    for (const m of mats) {
      const len = Math.hypot(m[0], m[1]) || 1;
      const key = Math.round(m[0] / len) + "," + Math.round(m[1] / len);
      votes.set(key, (votes.get(key) || 0) + 1);
    }
    let dir = "1,0";
    let best = 0;
    votes.forEach((v, k) => {
      if (v > best) {
        best = v;
        dir = k;
      }
    });
    const parts = dir.split(",").map(Number);
    const dx = parts[0];
    const dy = parts[1];

    // 把座標轉回「文字水平、上方為大」的方向
    raws.forEach((r, i) => {
      const m = mats[i];
      const X = dx * m[4] + dy * m[5];
      const Y = -dy * m[4] + dx * m[5];
      out.push({ text: r.str, x: X, y: -Y, width: r.width || 0, page: p });
    });
  }
  return out;
}

function charX(it: TextItem, index: number): number {
  const n = Math.max(it.text.length, 1);
  return it.x + (it.width * (index + 0.5)) / n;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ===== 年月 =====
function detectMonth(items: TextItem[]): number {
  const count = new Map<number, number>();
  for (const it of items) {
    const re = /(1[0-2]|[1-9])\/(\d)/g;
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
  const ad = all.match(/(20\d{2})\s*年/);
  const roc = all.match(/(1\d{2})\s*年/);
  if (ad) year = Number(ad[1]);
  else if (roc) year = Number(roc[1]) + 1911;
  return { year, month };
}

// ===== 日期欄：只採用「日期最多的那一橫排」 =====
type Col = { day: number; x: number };
type Header = { cols: Col[]; y: number };

function findHeader(items: TextItem[], page: number, month: number): Header {
  const key = `${month}/`;
  const hits: { day: number; x: number; y: number }[] = [];

  for (const it of items) {
    if (it.page !== page) continue;
    const t = it.text;
    let idx = t.indexOf(key);
    while (idx !== -1) {
      const dayStart = idx + key.length;
      const next = t.indexOf(key, dayStart);
      const end = next === -1 ? t.length : next;
      const digits = (t.slice(dayStart, end).match(/^\d{1,2}/) || [""])[0];
      const day = Number(digits);
      if (day >= 1 && day <= 31) {
        const mid = idx + (key.length + digits.length - 1) / 2;
        hits.push({ day, x: charX(it, mid), y: it.y });
      }
      idx = next;
    }
  }

  // 依 y 分組，挑出不同日期數最多的一組
  const groups: { y: number; list: typeof hits }[] = [];
  for (const h of hits) {
    const g = groups.find((g) => Math.abs(g.y - h.y) < 4);
    if (g) g.list.push(h);
    else groups.push({ y: h.y, list: [h] });
  }
  let bestGroup: { y: number; list: typeof hits } | null = null;
  let bestCount = 0;
  for (const g of groups) {
    const n = new Set(g.list.map((h) => h.day)).size;
    if (n > bestCount) { bestCount = n; bestGroup = g; }
  }
  if (!bestGroup || bestCount < 5) return { cols: [], y: 0 };

  const map = new Map<number, Col>();
  for (const h of bestGroup.list) if (!map.has(h.day)) map.set(h.day, { day: h.day, x: h.x });
  return { cols: [...map.values()].sort((a, b) => a.x - b.x), y: bestGroup.y };
}

// ===== 姓名 =====
type NameRow = { name: string; page: number; y: number };

function nameRows(items: TextItem[]): NameRow[] {
  const month = detectMonth(items);
  const pages = [...new Set(items.map((i) => i.page))];
  const rows: NameRow[] = [];
  for (const page of pages) {
    const { cols, y: headerY } = findHeader(items, page, month);
    if (!cols.length) continue;
    const firstX = cols[0].x;
    for (const it of items) {
      if (it.page !== page) continue;
      const t = it.text.trim();
      if (!/^[\u4e00-\u9fff]{2,4}$/.test(t)) continue;
      if (NOT_NAME.has(t)) continue;
      if (it.x >= firstX - 5) continue;     // 在日期欄左邊
      if (it.y >= headerY - 2) continue;    // 在表頭下方
      rows.push({ name: t, page, y: it.y });
    }
  }
  return rows.sort((a, b) => a.page - b.page || b.y - a.y);
}

export function names(items: TextItem[]): string[] {
  return [...new Set(nameRows(items).map((r) => r.name))];
}

// ===== 診斷資訊 =====
export function debugInfo(items: TextItem[]): string {
  const month = detectMonth(items);
  const pages = [...new Set(items.map((i) => i.page))];
  const lines: string[] = [`文字段數=${items.length}`, `偵測月份=${month}`];
  for (const p of pages) {
    const h = findHeader(items, p, month);
    lines.push(
      `第${p}頁：日期欄=${h.cols.length}` +
      (h.cols.length ? ` 第一欄x=${h.cols[0].x.toFixed(0)} 表頭y=${h.y.toFixed(0)}` : "")
    );
  }
  const sample = items
    .filter((i) => i.page === 1 && /[\u4e00-\u9fff]{2,4}/.test(i.text))
    .slice(0, 12)
    .map((i) => `「${i.text.trim()}」x=${i.x.toFixed(0)} y=${i.y.toFixed(0)}`);
  lines.push("第1頁中文樣本：", ...sample);
  const dateSample = items
    .filter((i) => i.page === 1 && /\d+\/\d+/.test(i.text))
    .slice(0, 5)
    .map((i) => `「${i.text.slice(0, 30)}」x=${i.x.toFixed(0)} y=${i.y.toFixed(0)}`);
  lines.push("第1頁日期樣本：", ...dateSample);
  return lines.join("\n");
}

// ===== 單格解析 =====
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

// ===== 某人的整月班表 =====
export function rowFor(items: TextItem[], name: string, _month?: number): Entry[] {
  const rows = nameRows(items);
  const row = rows.find((r) => r.name === name);
  if (!row) return [];

  const month = detectMonth(items);
  const { cols } = findHeader(items, row.page, month);
  if (!cols.length) return [];

  const colW = median(cols.slice(1).map((c, i) => c.x - cols[i].x)) || 15;
  const ys = rows.filter((r) => r.page === row.page).map((r) => r.y).sort((a, b) => b - a);
  const rowGap = median(ys.slice(1).map((y, i) => ys[i] - y)) || 12;
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
    return { day: c.day, raw: tokens.join(" "), main, note, enabled: ["D", "E", "N", "C"].includes(main) };
  });
}
