# DESIGN.md

訂閱制電商 demo 前端的視覺系統。參考 EWK 汽車工具電商:深色工業風 + 橘金強調 + 粗體壓縮大寫標題 + bento 格狀展示。供 Vite + React demo 套用。

## 設計語言(一句話)

**Dark industrial e-commerce**:近黑底色 + 橘金 accent,粗壯壓縮的大寫標題,深色卡片 + utility 導向的精簡 header。

> 註:只取截圖的「視覺調性」(色彩/字體/質感),不採用其行銷首頁的 bento 格狀展示——本專案前端是功能性操作頁。

---

## 一、色彩 Tokens

```css
:root {
  /* 底色 */
  --bg:          #0e0e0e;  /* 頁面最底,近黑 */
  --surface:     #1a1a1a;  /* 卡片/header 表面 */
  --surface-alt: #242424;  /* 次層、hover */
  --border:      #2e2e2e;  /* 細分隔線 */

  /* 強調(橘金) */
  --accent:        #e8a33d;  /* 主強調:logo、CTA、標題亮字 */
  --accent-strong: #f0a030;  /* hover / 高亮 */
  --accent-muted:  #7a5a1e;  /* 低調金、背景色塊 */

  /* 文字 */
  --text:         #f5f5f5;  /* 主標題、主文字 */
  --text-muted:   #9a9a9a;  /* 副標、說明文字 */
  --text-on-gold: #141414;  /* 金底上的深色字 */

  /* 狀態(對應訂閱/訂單狀態機,demo 用) */
  --status-active:   #3ec46d;  /* ACTIVE / PAID / SUCCESS */
  --status-pending:  #e8a33d;  /* INCOMPLETE / PENDING */
  --status-warn:     #e0762e;  /* PAST_DUE */
  --status-failed:   #e05050;  /* FAILED / CANCELED */

  /* 警告色 — 品牌標誌磚紅(#df390d rgb 223,57,13) */
  /* 用途:破壞性動作提示,如 cancelAtPeriodEnd 文字、刪除確認等 */
  --danger: #df390d;
}
```

---

## 二、字體 Typography

- **標題**:粗體壓縮大寫無襯線(工業感)。建議 Google Fonts **Oswald** 或 **Anton**(免費、近似截圖風格)。
  - 全大寫 `text-transform: uppercase`,字重 700,行高緊(1.05),字距微緊(`letter-spacing: -0.01em`)。
  - 顏色交替:白(`--text`)與金(`--accent`)。
- **內文 / UI**:一般無襯線 **Inter** 或系統字。字重 400–500,顏色 `--text-muted`。

```css
--font-display: 'Oswald', 'Anton', sans-serif;
--font-body:    'Inter', system-ui, sans-serif;

/* 尺寸階 */
--h1: clamp(2.2rem, 5vw, 3.5rem);
--h2: clamp(1.6rem, 3vw, 2.4rem);
--body: 1rem;
--small: 0.875rem;
```

---

## 三、佈局 Layout

### Header(深色、精簡 utility)
- 左:logo(橘金色塊 + 品牌字)。
- 中左:主導覽,含下拉(caret ⌄):`All Products`、`Support`。
- 右:utility 圖示列 → 幣別選擇 `$⌄`、語言地球、搜尋、聊天、`Sign In`(人像 icon)。
- 透明/深色浮在內容上,高度約 56–64px,左右留白大。
- **本專案對應**:幣別選擇器直接接多幣別(USD/JPY/TWD);`Sign In` 接 JWT 登入。

### 主內容(plans / subscription / 訂單)
- 置中容器(max-width 約 960px),上下分區、留白大。
- 列表用**等寬卡片格**(`grid` 自動換行),每張深色卡片(`--surface`)+ 細邊框(`--border`),圓角 6–8px。
- 卡片標題用 display 字體,價格突出顯示(含 currency code,如 `USD 9.99` / `JPY 980`)。
- 訂閱/訂單狀態列以**表格或卡片 + 狀態 Badge** 呈現,重點是看得到狀態變化。

---

## 四、元件規範

### 按鈕
```css
/* 主要 CTA */
.btn-primary {
  background: var(--accent);
  color: var(--text-on-gold);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
}
.btn-primary:hover { background: var(--accent-strong); }

/* 次要 */
.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}
```

### 狀態 Badge(訂閱/訂單/付款狀態)
- 小圓角膠囊,深底 + 對應狀態色文字/邊框。
- `INCOMPLETE`/`PENDING` → `--status-pending`;`ACTIVE` → `--status-active`;`PAST_DUE` → `--status-warn`;`FAILED`/`CANCELED` → `--status-failed`。

### 價格顯示
- 一律 `currency code + 格式化金額`,依 ISO 4217 exponent 顯示(對應 DESIGN 與後端多幣別決策)。
- 範例:`amount=999, currency=USD` → 顯示 `$9.99`;`amount=980, currency=JPY` → 顯示 `¥980`。

---

## 五、Demo 動線對應的畫面

對應 `final-plan.md` 的 demo 流程(登入 → 訂閱 → 輪詢 INCOMPLETE→ACTIVE → 取消):

| 畫面 | 套用元素 |
|------|----------|
| 登入 | Header `Sign In`、深色表單卡片、主 CTA 按鈕 |
| Plans 列表 | Bento/卡片格狀,每張卡含 display 標題 + 多幣別價格 + 訂閱 CTA |
| 訂閱後狀態 | 狀態 Badge(先 `INCOMPLETE` 橘 → 輪詢變 `ACTIVE` 綠) |
| 取消 | `btn-ghost` 次要按鈕 + 確認,狀態轉 `CANCELED` 紅 |

---

## 六、原則

1. 深色為主,橘金只點綴在強調處(CTA、標題亮字、logo),不濫用。
2. 標題一律大寫 + display 字體,製造工業力量感。
3. 卡片化、留白大、對比強;功能清楚優先於裝飾。
4. demo 重點是「看得到非同步狀態變化」,狀態 Badge 的顏色轉換要明顯。
