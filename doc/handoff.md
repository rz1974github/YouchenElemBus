# Handoff for Next Session

## Current State（2026-07-19）
應用程式已完整實作並可運行。主要檔案：

| 檔案 | 說明 |
|------|------|
| `src/data/appsettings.json` | 靜態設定（站名、門檻、公車號碼） |
| `src/lib/appSettings.ts` | 讀取 appsettings.json |
| `src/lib/tdxClient.ts` | TDX 即時 API 介接、token 快取、物理方向投票、mock 模式 |
| `src/lib/busProjection.ts` | ETA → 畫面 Y 座標投影、車道分配、篩選邏輯 |
| `src/lib/runtimeEnv.ts` | localStorage 環境變數管理（TDX client_id / secret） |
| `src/hooks/useRealtimeBuses.ts` | polling、車道排數持久化、方向切換 |
| `src/components/RouteDiagram.tsx` | SVG 路線圖渲染 |
| `src/App.tsx` | 主畫面、環境設定 dialog、debug 面板 |

## 已確認的架構決策

### 方向判斷（重要）
- **完全不使用 TDX API 回傳的 `Direction` 欄位**。
- 方向由各站 ETA 的物理遞增規律做投票決定（`getCandidateDirection`）。
- 票數相等時預設 `'outbound'`。

### 車輛顯示位置（`busProjection.ts`）
- **狀態 1**：ETA = 0 → 車子貼在站點上（`stationY[approachIdx]`）。
- **狀態 2**：在兩站之間 → 固定置於前後兩站正中間（不依 ETA 比例）。
- **狀態 3**：尚未進入路線（首站外側） → 放在「想像前一站」與首站的中間（半個站距）。

### 車道排數持久化（`useRealtimeBuses.ts`）
- 每次 poll 後，已在線公車的排數（`laneIndex`）保持不變。
- 新公車填入最小可用排數。
- 切換方向時清空排數記錄。

### SVG 繪圖座標
- `SVG_WIDTH = 900`，`SVG_HEIGHT = 870`
- `MAIN_LINE_X = 160`（主幹線 x）
- `RIGHT_START_X = 260`（第一條公車車道 x）
- `RIGHT_GAP = 101`（相鄰車道間距）
- 整個繪圖內容包在 `<g transform="translate(5, 0)">` 中，整體右移 5px。
- 站點 Y：`TOP = 101`，站距 `GAP = 107`，去程由下往上，回程由上往下。

### 篩選規則（`busProjection.ts`）
- 全域：最小非負 ETA > 20 分鐘 → 排除。
- 規則 1：距監測站（去程 `玉成里`、回程 `西新里`）≤ 10 分鐘內 → 顯示。
- 規則 3：**車輛必須已在區間內**，判定條件為 `approachIdx > 0 || ruleMinEta === 0`：
  - `approachIdx > 0`：即將抵達的站不是首站，代表前一站也在區間內，車輛確實在兩站之間 → 顯示。
  - `ruleMinEta === 0`：車輛已停在某站上（ETA = 0）→ 顯示。
  - `approachIdx === 0 && ruleMinEta > 0`：車輛在首站外側趨近，尚未進入區間 → **不顯示**。

### 環境設定
- TDX `client_id` / `client_secret` 儲存於 `localStorage`（key: `tdx_client_id` / `tdx_client_secret`）。
- 首次開啟或未設定時自動跳出 dialog。
- Mock 模式：`localStorage` 設 `USE_MOCK=true` 啟用。

## 已知限制 / 待處理
- 目前無 PWA manifest / Service Worker（`plan.md` 有列但尚未實作）。
- Debug 面板（工程模式）在生產環境仍可透過 `localStorage` 開啟，若需隱藏請加環境變數判斷。

## 設計規則（不可改動）
- `stationNames` 只有一份，去程正序、回程倒序讀取，不重複儲存。
- `direction` 只是 UI state，不存入 `appsettings.json`。
- 畫面寬度以手機為主，SVG 用 `viewBox` 自適應。
