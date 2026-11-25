import { useState } from "react";
import { extract, names, rowFor, detectYearMonth, debugInfo } from "./services/parser";
import { makeICS, downloadICS } from "./services/ics";
import type { Entry, ShiftRule, TextItem } from "./types";

const LEAVE_RULES: [string, string][] = [
  ["息", "休息日"], ["例", "例假日"], ["國", "國定假日"], ["補", "補休"],
  ["特", "特休"], ["公", "公假"], ["病", "病假"], ["產檢", "產檢假"],
  ["喪", "喪假"], ["共識", "共識活動"], ["體側", "體側"],
];

const initial: ShiftRule[] = [
  { code: "D", label: "D班（白班）", start: "08:00", end: "16:00", crosses: false, defaultEnabled: true },
  { code: "E", label: "E班（小夜）", start: "16:00", end: "00:00", crosses: true, defaultEnabled: true },
  { code: "N", label: "N班（大夜）", start: "00:00", end: "08:00", crosses: false, defaultEnabled: true },
  { code: "C", label: "C班", start: "08:00", end: "17:00", crosses: false, defaultEnabled: true },
  ...LEAVE_RULES.map(([code, label]) => ({
    code, label, start: "00:00", end: "00:00", crosses: false, allDay: true, defaultEnabled: false,
  })),
];

export default function App() {
  const now = new Date();
  const [items, setItems] = useState<TextItem[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rules, setRules] = useState<ShiftRule[]>(initial);
  const [msg, setMsg] = useState("尚未選擇班表");
  const [debug, setDebug] = useState("");

  async function upload(f?: File) {
    if (!f) return;
    setMsg("正在讀取 PDF…");
    setDebug("");
    try {
      const x = await extract(f);
      const ns = names(x);
      const ym = detectYearMonth(x);
      setYear(ym.year);
      setMonth(ym.month);
      setItems(x);
      setPeople(ns);
      setPerson(ns[0] || "");
      setEntries(ns[0] ? rowFor(x, ns[0]) : []);
      if (ns.length) {
        setMsg("找到 " + ns.length + " 個可能姓名，請確認班表。");
      } else {
        setMsg("找不到姓名，請把下方診斷資訊截圖回報。");
        setDebug(debugInfo(x));
      }
    } catch (e) {
      setMsg("PDF 讀取失敗：" + String(e));
    }
  }

  function choose(n: string) {
    setPerson(n);
    setEntries(n ? rowFor(items, n) : []);
  }

  function patch(i: number, p: Partial<Entry>) {
    setEntries((v) => v.map((e, j) => (j === i ? { ...e, ...p } : e)));
  }

  function setRuleTime(code: string, field: "start" | "end", value: string) {
    setRules((v) => v.map((x) => (x.code === code ? { ...x, [field]: value } : x)));
  }

  function exportNow() {
    if (!person) {
      setMsg("請先選擇姓名");
      return;
    }
    const filename = year + "-" + String(month).padStart(2, "0") + "-" + person + "-班表.ics";
    downloadICS(makeICS(entries, rules, year, month, person), filename);
    setMsg("ICS 已產生。請在 iPhone 開啟下載檔並加入行事曆。");
  }

  return (
    <main>
      <header>
        <span className="badge">Local only</span>
        <h1>SICU 班表 → 行事曆</h1>
        <p>PDF 僅在裝置內解析，不會上傳伺服器。</p>
      </header>

      <section>
        <h2>1. 選擇班表</h2>
        <label className="upload">
          選擇 PDF
          <input type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="status">{msg}</p>
        {debug && (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fff7ed", color: "#333", padding: 10, borderRadius: 8 }}>
            {debug}
          </pre>
        )}
        <div className="grid">
          <label>
            年份
            <input type="number" value={year} onChange={(e) => setYear(+e.target.value)} />
          </label>
          <label>
            月份
            <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(+e.target.value)} />
          </label>
          <label>
            姓名
            <select value={person} onChange={(e) => choose(e.target.value)}>
              <option value="">請選擇</option>
              {people.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>2. 暫定班別時間</h2>
        <div className="rules">
          {rules
            .filter((r) => ["D", "E", "N", "C"].includes(r.code))
            .map((r) => (
              <div className="rule" key={r.code}>
                <b>{r.code}</b>
                <input type="time" value={r.start} onChange={(e) => setRuleTime(r.code, "start", e.target.value)} />
                <span>至</span>
                <input type="time" value={r.end} onChange={(e) => setRuleTime(r.code, "end", e.target.value)} />
              </div>
            ))}
        </div>
        <small>目前假設 D 08–16、E 16–00、N 00–08、C 08–17，可直接修改。</small>
      </section>

      <section>
        <h2>3. 確認辨識結果</h2>
        {entries.length === 0 ? (
          <div className="empty">選擇 PDF 與姓名後，班表會出現在這裡。</div>
        ) : (
          <div className="list">
            {entries.map((e, i) => (
              <div className="entry" key={i}>
                <input
                  aria-label="匯出"
                  type="checkbox"
                  checked={e.enabled}
                  onChange={(x) => patch(i, { enabled: x.target.checked })}
                />
                <b>{month}/{e.day}</b>
                <input value={e.main} onChange={(x) => patch(i, { main: x.target.value })} />
                <input placeholder="註記" value={e.note} onChange={(x) => patch(i, { note: x.target.value })} />
                <small>原文 {e.raw || "（空白）"}</small>
              </div>
            ))}
          </div>
        )}
        <button className="primary" type="button" onClick={exportNow} disableds.length}>
          匯出 ICS
        </button>
      </section>

      <footer>座標式辨識，匯入前請逐日確認，尤其是 #、/、新與跨日班。</footer>
    </main>
  );
}
