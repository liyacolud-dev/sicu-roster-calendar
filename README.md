# SICU 班表 → Calendar / TimeTree

將 SICU PDF 排班表轉換成個人行事曆的 Web App。

本專案主要針對 iPhone／Safari 使用情境設計，可從 PDF 自動辨識姓名與每日班別，確認後匯出為 `.ics`，並提供實驗性的 TimeTree 共享行事曆匯入功能。

## 線上使用

GitHub Pages：

https://liyacolud-dev.github.io/sicu-roster-calendar/

## 主要功能

### PDF 班表解析

- 直接選擇 SICU PDF 班表
- 自動偵測年份及月份
- 自動擷取班表中的人員姓名
- 使用 PDF 文字座標判斷每日班別
- 支援旋轉過的 PDF 頁面
- 支援部分 PDF 中姓名與班別文字黏在一起的情況
- 解析後可逐日人工確認及修改

目前支援的主要班別：

- `D`
- `E`
- `N`
- `C`

另外可辨識：

- `息`
- `例`
- `國`
- `補`
- `特`
- `公`
- `病`
- `產檢`
- `喪`
- `共識`
- `體側`
- `D新`
- `E新`
- `#`
- `/`

## 隱私設計

PDF 解析完全在使用者的瀏覽器內完成。

班表 PDF 不會上傳至 GitHub、伺服器或資料庫。

本專案沒有：

- 後端伺服器
- 使用者帳號系統
- 班表資料庫
- PDF 上傳 API

GitHub Pages 僅負責提供 HTML、CSS、JavaScript 與 PDF.js 等前端程式。

## 行事曆匯出

一般使用者可以將班表產生為標準 `.ics` 行事曆檔案。

可匯入：

- Apple Calendar
- Google Calendar
- Outlook Calendar
- 其他支援 iCalendar 的行事曆系統

班別時間可以在網頁上修改。

目前預設值：

| 班別 | 預設時間 |
|---|---|
| D | 08:00–16:00 |
| E | 16:00–00:00 |
| N | 00:00–08:00 |
| C | 08:00–17:00 |

以上時間屬於應用程式預設值，使用前應依實際班別調整。

## TimeTree 整合

本專案包含實驗性的 TimeTree 匯入功能。

由於 TimeTree 已停止公開 API，本功能使用 TimeTree Web App 目前使用的非官方內部 API。因此 TimeTree 若修改 Web App 或內部 API，本功能可能暫時失效。

`.ics` 匯出功能不依賴此非官方 API，可作為備用方案。

### 指定人員專屬模式

當所選姓名為「指定人員」時，可以使用專屬 TimeTree 匯入功能。

班別對應：

| PDF 班別 | TimeTree 標題 | TimeTree 標籤 |
|---|---|---|
| D | 白班 | 白班 |
| E | 小夜班 | 小夜班 |
| N | 大夜班 | 大夜班 |

TimeTree 中的 D／E／N 會建立為全天行程，使月曆上的標籤以實心色塊顯示。

實際上下班時間仍保留於行程備註中，例如：

```text
白班

SICU-ROSTER:2026-12:指定人員:05
原始班別：D
實際班別時間：08:00–16:00
```

`SICU-ROSTER` 識別碼用於辨識由本工具產生的活動，未來可用於防重複、同步更新或批次刪除。

## Safari TimeTree 匯入書籤

TimeTree 匯入功能需要 Safari JavaScript Bookmarklet。

原因是 TimeTree 的登入 Session 與 CSRF Token 只存在於 `timetreeapp.com` 網域，GitHub Pages 無法直接存取。

基本流程：

```text
SICU Web App
      ↓
複製 TimeTree 班表資料
      ↓
Safari 開啟 TimeTree Web
      ↓
執行「SICU匯入」書籤
      ↓
貼上班表資料
      ↓
確認
      ↓
寫入 TimeTree 共享行事曆
```

第一次使用需要安裝 Bookmarklet，之後每月不必重新設定。

## 安全注意事項

請勿將以下內容 Commit 至 GitHub：

- 真實 SICU PDF 班表
- 護理人員名單
- TimeTree 帳號及密碼
- TimeTree Session Cookie
- `_session_id`
- CSRF Token
- 個人匯出的 `.ics`
- 其他含個人排班資訊的檔案

TimeTree Bookmarklet 使用的是目前 Safari 中已登入的 TimeTree Session。

本專案不保存 TimeTree 密碼。

## 使用方式

### 1. 開啟 Web App

使用 Safari 開啟 GitHub Pages 網站。

### 2. 選擇 PDF 班表

點選「選擇 PDF」。所有 PDF 解析都在目前裝置內完成。

### 3. 選擇姓名

App 會列出從 PDF 辨識到的人員，選擇需要匯出的姓名。

### 4. 確認班表

逐日確認：

- 日期
- 班別
- 原始 PDF 文字
- 特殊註記

若辨識錯誤，可直接修改。

### 5A. 一般使用者

選擇「匯出 ICS」，再使用 Apple Calendar、Google Calendar、Outlook 等行事曆開啟。

### 5B. TimeTree 專屬模式

選擇「複製班表到 TimeTree」，接著：

1. 開啟 TimeTree Web
2. 執行 `SICU匯入` Safari 書籤
3. 在輸入框貼上班表資料
4. 確認月份、班別及筆數
5. 確認匯入

## 開發

本專案使用：

- React
- TypeScript
- Vite
- PDF.js
- GitHub Actions
- GitHub Pages

### 本機啟動

需要 Node.js。

```bash
npm install
npm run dev
```

瀏覽器開啟 Vite 顯示的 Local URL。

### Production build

```bash
npm run build
```

輸出位於：

```text
dist/
```

## 部署

Push 到 `main` branch 後，由 GitHub Actions 自動執行：

```text
Checkout
→ npm install
→ npm run build
→ GitHub Pages Deploy
```

不需要手動執行 production deployment。

## 專案架構

```text
src/
├── App.tsx
├── main.tsx
├── style.css
├── services/
│   ├── parser.ts
│   ├── ics.ts
│   ├── timetree.ts
│   └── bookmarklet.ts
└── types/
    └── index.ts

public/
└── manifest.webmanifest

.github/
└── workflows/
    └── deploy.yml
```

## 已知限制

### PDF 格式

目前 parser 是依照現有 SICU 班表版型開發。

如果未來排班表：

- 改變欄位位置
- 更換 PDF 產生方式
- 改成掃描圖片 PDF
- 新增未知班別代碼
- 大幅修改表格版型

可能需要調整 parser。匯出前仍應人工檢查辨識結果。

### TimeTree

TimeTree 整合使用非官方 Web API。

TimeTree 改版後，下列項目都有可能改變：

- Endpoint
- CSRF 機制
- Event Payload
- Label API
- Session 機制

因此 TimeTree 整合不保證永久可用。

## GitHub Pages

本專案為純靜態前端網站。

GitHub Pages 官方目前提供每月約 100 GB 的 soft bandwidth limit，發布的網站大小上限為 1 GB。以本專案規模及預期使用量而言，正常班表轉換使用不太可能接近限制。

## Disclaimer

This project is an independent personal utility project.

It is not affiliated with, endorsed by, or officially supported by TimeTree, Inc.

The TimeTree integration relies on undocumented Web APIs and may stop working without notice.

Before importing a roster, users should verify the parsed schedule and import preview.

Do not upload or commit real medical workplace rosters or TimeTree credentials to this repository.
