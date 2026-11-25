import { useState } from "react";
import { extract, names, rowFor, detectYearMonth, debugInfo, nameDebug } from "./services/parser";
import { makeICS, downloadICS } from "./services/ics";
import type { IcsOptions } from "./services/ics";
import type { Entry, ShiftRule, TextItem } from "./types";
import {
  buildTimeTreePayload,
  copyTimeTreePayload,
  openTimeTreeImport,
} from "./services/timetree";

// ===== 個人專屬設定：以後要幫別人加，就在這裡多加一筆 =====
type Profile = {
  name: string;
  sameDayOnly: boolean;
  titles: Record<string, string>;
  notes: string[];
};

const PROFILES: Profile[] = [
  {
    name: "謝佩娟",
    sameDayOnly: true,
    titles: { D: "白班", E: "小夜班", N: "大夜班" },
    notes: [
      "小夜班、大夜班只顯示在開始當天",
      "行程標題：白班／小夜班／大夜班",
      "可分班別匯出，方便在 TimeTree 對應標籤",
    ],
  },
];

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
  const [useCustom, setUseCustom] = useState(false);

  const profile = PROFILES.find((p) => p.name.normalize("NFKC") === person.normalize("NFKC"));
  const customActive = useCustom && profile !== undefined;

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
      setUseCustom(false);
      if (ns.length > 0) {
        const first = ns.slice(0, 1).join("");
        setPerson(first);
        setEntries(rowFor(x, first));
        setMsg("找到 " + ns.length + " 個可能姓名，請確認班表。");
        setDebug(nameDebug(x));
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
    setUseCustom(false);
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

  function exportNow(onlyCodes: string[], suffix: string) {
    if (person === "") {
      setMsg("請先選擇姓名");
      return;
    }
    let opts: IcsOptions = { sameDayOnly: false, titles: {}, onlyCodes: onlyCodes };
    if (customActive && profile) {
      opts = { sameDayOnly: profile.sameDayOnly, titles: profile.titles, onlyCodes: onlyCodes };
    }
    const mm = String(month).padStart(2, "0");
    const filename = year + "-" + mm + "-" + person + suffix + ".ics";
    downloadICS(makeICS(entries, rules, year, month, person, opts), filename);
    setMsg("已產生 " + filename + "，請在 iPhone 開啟並加入行事曆。");
  }

  function previewTitle(code: string): string {
    if (customActive && profile && profile.titles[code]) return profile.titles[code];
    return "";
  }

  const workRules = rules.filter((r) => WORK_CODES.includes(r.code));
  const noEntries = entries.length === 0;
  const altBtn = { background: "#115e59", marginTop: 8 };
  async function copyForTimeTree() {
    if (person === "") {
      setMsg("請先選擇姓名");
      return;
    }

    if (person !== "謝佩娟") {
      setMsg("目前 TimeTree 直接匯入只開放謝佩娟測試。");
      return;
    }

    try {
      const payload = buildTimeTreePayload(
        entries,
        rules,
        year,
        month,
        person
      );

      if (payload.events.length === 0) {
        setMsg("沒有可匯入 TimeTree 的 D、E、N 班別。");
        return;
      }

      await copyTimeTreePayload(payload);

      const dayCount = payload.events.length;
      const dCount = payload.events.filter(
        (e) => e.shift === "D"
      ).length;
      const eCount = payload.events.filter(
        (e) => e.shift === "E"
      ).length;
      const nCount = payload.events.filter(
        (e) => e.shift === "N"
      ).length;

      setMsg(
        "已複製 TimeTree 班表：" +
          dayCount +
          " 筆（白班 " +
          dCount +
          "、小夜班 " +
          eCount +
          "、大夜班 " +
          nCount +
          "）。請開啟 TimeTree 網頁並執行「SICU匯入」書籤。"
      );
    } catch (error) {
      setMsg("複製失敗：" + String(error));
    }
  }
  function goToTimeTree() {
  if (person === "") {
    setMsg("請先選擇姓名");
    return;
  }

  if (person !== "謝佩娟") {
    setMsg("目前 TimeTree 直接匯入只開放謝佩娟測試。");
    return;
  }

  const payload = buildTimeTreePayload(
    entries,
    rules,
    year,
    month,
    person
  );

  if (payload.events.length === 0) {
    setMsg("沒有可匯入 TimeTree 的 D、E、N 班別。");
    return;
  }

  const dCount = payload.events.filter(
    (event) => event.shift === "D"
  ).length;

  const eCount = payload.events.filter(
    (event) => event.shift === "E"
  ).length;

  const nCount = payload.events.filter(
    (event) => event.shift === "N"
  ).length;

  const confirmed = window.confirm(
    person +
      "｜" +
      year +
      " 年 " +
      month +
      " 月" +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      "白班：" +
      dCount +
      " 筆" +
      String.fromCharCode(10) +
      "小夜班：" +
      eCount +
      " 筆" +
      String.fromCharCode(10) +
      "大夜班：" +
      nCount +
      " 筆" +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      "總計：" +
      payload.events.length +
      " 筆" +
      String.fromCharCode(10) +
      String.fromCharCode(10) +
      "確定前往 TimeTree？"
  );

  if (confirmed === false) {
    return;
  }

  openTimeTreeImport(payload);
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

        {profile === undefined ? null : (
          <div style={{ border: "2px solid #0f766e", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <button
              className="primary"
              type="button"
              style={{ marginTop: 0, background: customActive ? "#b45309" : "#0f766e" }}
              onClick={() => setUseCustom(useCustom === false)}
            >
              {customActive ? "已套用 " + profile.name + " 專屬設定（點此取消）" : "套用 " + profile.name + " 專屬設定"}
            </button>
            <ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13 }}>
              {profile.notes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

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
                <small>
                  原文 {e.raw === "" ? "（空白）" : e.raw}
                  {previewTitle(e.main) === "" ? "" : " → " + previewTitle(e.main)}
                </small>
              </div>
            ))}
          </div>
        )}
{person === "謝佩娟" ? (
  <button
    className="primary"
    type="button"
    onClick={copyForTimeTree}
    disabled={noEntries}
    style={{
      background: "#2563eb",
      marginBottom: 12,
    }}
  >
    複製班表到 TimeTree
  </button>
) : null}

 <p className="status">{msg}</p>
        
        {customActive ? (
          <div>
            <button className="primary" type="button" onClick={() => exportNow([], "-全部")} disabled={noEntries}>
              全部匯出
            </button>
            <button className="primary" type="button" style={altBtn} onClick={() => exportNow(["D"], "-白班")} disabled={noEntries}>
              只匯出白班
            </button>
            <button className="primary" type="button" style={altBtn} onClick={() => exportNow(["E"], "-小夜班")} disabled={noEntries}>
              只匯出小夜班
            </button>
            <button className="primary" type="button" style={altBtn} onClick={() => exportNow(["N"], "-大夜班")} disabled={noEntries}>
              只匯出大夜班
            </button>
          </div>
        ) : (
          <button className="primary" type="button" onClick={() => exportNow([], "-班表")} disabled={noEntries}>
            匯出 ICS
          </button>
        )}
      </section>

      <footer>座標式辨識，匯入前請逐日確認，尤其是 #、/、新與跨日班。</footer>
    </main>
  );
}
