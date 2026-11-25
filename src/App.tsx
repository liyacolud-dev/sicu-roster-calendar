import { useState } from "react";

import {
  extract,
  names,
  rowFor,
  detectYearMonth,
  debugInfo,
  nameDebug,
} from "./services/parser";

import {
  makeICS,
  downloadICS,
} from "./services/ics";

import type {
  IcsOptions,
} from "./services/ics";

import type {
  Entry,
  ShiftRule,
  TextItem,
} from "./types";

import {
  buildTimeTreePayload,
  copyTimeTreePayload,
} from "./services/timetree";

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
    titles: {
      D: "白班",
      E: "小夜班",
      N: "大夜班",
    },
    notes: [
      "小夜班、大夜班只顯示在開始當天",
      "行程標題：白班／小夜班／大夜班",
      "TimeTree 專屬匯入支援白班／小夜班／大夜班標籤",
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
  {
    code: "D",
    label: "D班（白班）",
    start: "08:00",
    end: "16:00",
    crosses: false,
    defaultEnabled: true,
  },
  {
    code: "E",
    label: "E班（小夜）",
    start: "16:00",
    end: "00:00",
    crosses: true,
    defaultEnabled: true,
  },
  {
    code: "N",
    label: "N班（大夜）",
    start: "00:00",
    end: "08:00",
    crosses: false,
    defaultEnabled: true,
  },
  {
    code: "C",
    label: "C班",
    start: "08:00",
    end: "17:00",
    crosses: false,
    defaultEnabled: true,
  },
];

const initialRules: ShiftRule[] = WORK_RULES.concat(
  LEAVE_RULES.map((rule) => ({
    code: rule.code,
    label: rule.label,
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

  const profile = PROFILES.find(
    (p) =>
      p.name.normalize("NFKC") ===
      person.normalize("NFKC")
  );

  const customActive =
    useCustom &&
    profile !== undefined;

  const workRules = rules.filter(
    (rule) =>
      WORK_CODES.includes(rule.code)
  );

  const noEntries =
    entries.length === 0;

  const altBtn = {
    background: "#115e59",
    marginTop: 8,
  };

  async function upload(file: File | null) {
    if (file === null) {
      return;
    }

    setMsg("正在讀取 PDF…");
    setDebug("");

    try {
      const extracted = await extract(file);
      const loadedNames = names(extracted);
      const ym = detectYearMonth(extracted);

      setYear(ym.year);
      setMonth(ym.month);
      setItems(extracted);
      setPeople(loadedNames);
      setUseCustom(false);

      if (loadedNames.length > 0) {
        const first =
          loadedNames.slice(0, 1).join("");

        setPerson(first);
        setEntries(
          rowFor(extracted, first)
        );

        setMsg(
          "找到 " +
            loadedNames.length +
            " 個可能姓名，請確認班表。"
        );

        setDebug(
          nameDebug(extracted)
        );
      } else {
        setPerson("");
        setEntries([]);

        setMsg(
          "找不到姓名，請把下方診斷資訊截圖回報。"
        );

        setDebug(
          debugInfo(extracted)
        );
      }
    } catch (error) {
      setMsg(
        "PDF 讀取失敗：" +
          String(error)
      );
    }
  }

  function onFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const list =
      event.target.files;

    if (list === null) {
      return;
    }

    upload(list.item(0));
  }

  function choose(name: string) {
    setPerson(name);
    setUseCustom(false);

    if (name === "") {
      setEntries([]);
      return;
    }

    setEntries(
      rowFor(items, name)
    );
  }

  function patch(
    index: number,
    values: Partial<Entry>
  ) {
    setEntries((list) =>
      list.map((entry, i) => {
        if (i === index) {
          return Object.assign(
            {},
            entry,
            values
          );
        }

        return entry;
      })
    );
  }

  function setRuleTime(
    code: string,
    field: "start" | "end",
    value: string
  ) {
    setRules((list) =>
      list.map((rule) => {
        if (rule.code !== code) {
          return rule;
        }

        if (field === "start") {
          return Object.assign(
            {},
            rule,
            { start: value }
          );
        }

        return Object.assign(
          {},
          rule,
          { end: value }
        );
      })
    );
  }

  function exportNow(
    onlyCodes: string[],
    suffix: string
  ) {
    if (person === "") {
      setMsg("請先選擇姓名");
      return;
    }

    let options: IcsOptions = {
      sameDayOnly: false,
      titles: {},
      onlyCodes: onlyCodes,
    };

    if (
      customActive &&
      profile !== undefined
    ) {
      options = {
        sameDayOnly:
          profile.sameDayOnly,

        titles:
          profile.titles,

        onlyCodes:
          onlyCodes,
      };
    }

    const mm =
      String(month).padStart(
        2,
        "0"
      );

    const filename =
      year +
      "-" +
      mm +
      "-" +
      person +
      suffix +
      ".ics";

    const content =
      makeICS(
        entries,
        rules,
        year,
        month,
        person,
        options
      );

    downloadICS(
      content,
      filename
    );

    setMsg(
      "已產生 " +
        filename +
        "，請在 iPhone 開啟並加入行事曆。"
    );
  }

  function previewTitle(
    code: string
  ): string {
    if (
      customActive &&
      profile !== undefined &&
      profile.titles[code]
    ) {
      return profile.titles[code];
    }

    return "";
  }

  async function copyForTimeTree() {
    if (person === "") {
      setMsg("請先選擇姓名");
      return;
    }

    if (person !== "謝佩娟") {
      setMsg(
        "目前 TimeTree 直接匯入只開放謝佩娟測試。"
      );
      return;
    }

    try {
      const payload =
        buildTimeTreePayload(
          entries,
          rules,
          year,
          month,
          person
        );

      if (
        payload.events.length === 0
      ) {
        setMsg(
          "沒有可匯入 TimeTree 的 D、E、N 班別。"
        );
        return;
      }

      await copyTimeTreePayload(
        payload
      );

      const total =
        payload.events.length;

      const dCount =
        payload.events.filter(
          (event) =>
            event.shift === "D"
        ).length;

      const eCount =
        payload.events.filter(
          (event) =>
            event.shift === "E"
        ).length;

      const nCount =
        payload.events.filter(
          (event) =>
            event.shift === "N"
        ).length;

      setMsg(
        "已複製 TimeTree 班表：" +
          total +
          " 筆（白班 " +
          dCount +
          "、小夜班 " +
          eCount +
          "、大夜班 " +
          nCount +
          "）。請開啟 TimeTree 網頁並執行 SICU匯入 書籤。"
      );
    } catch (error) {
      setMsg(
        "複製失敗：" +
          String(error)
      );
    }
  }

  return (
    <main>
      <header>
        <span className="badge">
          Local only
        </span>

        <h1>
          SICU 班表 → 行事曆
        </h1>

        <p>
          PDF 僅在裝置內解析，不會上傳伺服器。
        </p>
      </header>

      <section>
        <h2>
          1. 選擇班表
        </h2>

        <label className="upload">
          選擇 PDF

          <input
            type="file"
            accept="application/pdf"
            onChange={onFileChange}
          />
        </label>

        <p className="status">
          {msg}
        </p>

        {debug === "" ? null : (
          <pre
            style={{
              whiteSpace:
                "pre-wrap",
              fontSize: 12,
              background:
                "#fff7ed",
              color: "#333",
              padding: 10,
              borderRadius: 8,
            }}
          >
            {debug}
          </pre>
        )}

        <div className="grid">
          <label>
            年份

            <input
              type="number"
              value={year}
              onChange={(event) =>
                setYear(
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </label>

          <label>
            月份

            <input
              type="number"
              min="1"
              max="12"
              value={month}
              onChange={(event) =>
                setMonth(
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </label>

          <label>
            姓名

            <select
              value={person}
              onChange={(event) =>
                choose(
                  event.target.value
                )
              }
            >
              <option value="">
                請選擇
              </option>

{people.map((name) => (
  <option key={name} value={name}>
    {name}
  </option>
))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>
          2. 暫定班別時間
        </h2>

        <div className="rules">
          {workRules.map(
            (rule) => (
              <div
                className="rule"
                key={rule.code}
              >
                <b>
                  {rule.code}
                </b>

                <input
                  type="time"
                  value={
                    rule.start
                  }
                  onChange={(
                    event
                  ) =>
