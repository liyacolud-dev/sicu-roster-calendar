import { useState } from "react";
import { extract, names, rowFor, detectYearMonth, debugInfo } from "./services/parser";
import { makeICS, downloadICS } from "./services/ics";
import type { Entry, ShiftRule, TextItem } from "./types";

const LEAVE_RULES = [
  { code: "息", label: "休息日" },
  { code: "例", label: "例假日" },
  { code: "國", label: "國定假日" },
  { code: "補", label: "補休" },
  { code: "特", label: "特休" },
  { code: "公", label: "公假" },
  { code: "病", label: "病假" },
  { code: "產檢", label: "產檢假" },
  { code: "喪", label: "喪假" },
  { code: "共識", label: "共識活動" },
  { code: "體側", label: "體側" },
];

const WORK_RULES: ShiftRule[] = [
  { code: "D", label: "D班（白班）", start: "08:00", end: "16:00", crosses: false, defaultEnabled: true },
  { code: "E", label: "E班（小夜）", start: "16:00", end: "00:00", crosses: true, defaultEnabled: true },
  { code: "N", label: "N班（大夜）", start: "00:00", end: "08:00", crosses: false, defaultEnabled: true },
  { code: "C", label: "C班", start: "08:00", end: "17:00", crosses: false, defaultEnabled: true },
];

const initialRules: ShiftRule[] = WORK_RULES.concat(
  LEAVE_RULES.map((r) => ({
    code: r.code,
    label: r.label,
    start: "00:00",
    end: "00:00",
    crosses: false,
    allDay: true,
    defaultEnabled: false,
  }))
);

const WORK_CODES = ["D", "E", "N", "C"];

export default function App() {
  const now = new Date();
  const [items, setItems] = useState<TextItem[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [person, setPerson] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rules, setRules] = useState<ShiftRule[]>(initialRules);
  const [msg, setMsg] = useState("尚未選擇班表");
  const [debug, setDebug] = useState("");

  async function upload(f: File | null) {
    if (f === null) return;
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
      if (ns.length > 0) {
        const first = ns.slice(0, 1).join("");
        setPerson(first);
        setEntries(rowFor(x, first));
        setMsg("找到 " + ns.length + " 個可能姓名，請確認班表。");
      } else {
        setPerson("");
        setEntries([]);
        setMsg("找不到姓名，請把下方診斷資訊截圖回報。");
        setDebug(debugInfo(x));
      }
    } catch (e) {
      setMsg("PDF 讀取失敗：" + String(e));
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (list === null) return;
    upload(list.item(0));
  }

  function choose(n: string) {
    setPerson(n);
    if (n === "") {
      setEntries([]);
    } else {
      setEntries(rowFor(items, n));
    }
  }

  function patch(index: number, p: Partial<Entry>) {
    setEntries((list) =>
      list.map((e, j) => {
        if (j === index) return Object.assign({}, e, p);
        return e;
      })
    );
  }

  function setRuleTime(code: string, field: "start" | "end", value: string) {
    setRules((list) =>
      list.map((x) => {
        if (x.code !== code) return x;
        if (field === "start") return Object.assign({}, x, { start: value });
        return Object.assign({}, x, { end: value });
      })
    );
  }

  function exportNow() {
    if (person === "") {
      setMsg("請先選擇姓名");
      return;
    }
    const mm = String(month).padStart(2, "0");
    const filename = year + "-" + mm + "-" + person + "-班表.ics";
    downloadICS(makeICS(entries, rules, year, month, person), filename);
    setMsg("ICS 已產生。請在 iPhone 開啟下載檔並加入行事曆。");
  }

  const workRules = rules.filter((r) => WORK_CODES.includes(r.code));
  const noEntries = entries.length === 0;

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
          <input type="file" accept="application/pdf" onChange={onFileChange} />
        </label>
        <p className="status">{msg}</p>
        {debug === "" ? null : (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fff7ed", color: "#333", padding: 10, borderRadius: 8 }}>
            {debug}
          </pre>
        )}
        <div className="grid">
          <label>
            年份
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            月份
            <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))} />
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
          {workRules.map((r) => (
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
        {noEntries ? (
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
                <small>原文 {e.raw === "" ? "（空白）" : e.raw}</small>
              </div>
            ))}
          </div>
        )}
        <button className="primary" type="button" onClick={exportNow} disabled={noEntries}>
          匯出 ICS
        </button>
      </section>

      <footer>座標式辨識，匯入前請逐日確認，尤其是 #、/、新與跨日班。</footer>
    </main>
  );
}
