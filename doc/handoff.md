# Handoff

規則與用語以 [plan.md](plan.md) 為準，先讀它。特別是：**本 App 的方向只叫「上班 / 下班」**，不要沿用 TDX 的去程 / 回程。

## 資料流

```
TDX 站序 (StopOfRoute，只抓一次)    tdxClient.ts（或 mockTdx.ts）
  → 路線+TDX Direction → 上班/下班    vehicles.ts buildTripIndex
TDX ETA 原始資料 (TdxEtaRow[])      tdxClient.ts（或 mockTdx.ts）
  → 一台一台的車 (Vehicle[])         vehicles.ts
  → 篩選 + 位置 (BusLane[])          busProjection.ts + useRealtimeBuses.ts
  → SVG                              RouteDiagram.tsx
```

| 檔案 | 職責 |
|---|---|
| `src/lib/tdxClient.ts` | 取 token、抓 TDX ETA 與 StopOfRoute 原始資料 |
| `src/lib/mockTdx.ts` | 產生「長得像 TDX 原始資料」的假資料，與真實資料走同一條解析路徑 |
| `src/lib/vehicles.ts` | 用 StopOfRoute 站序建立 (路線, TDX Direction) → 上班/下班 對照；ETA 依此分組再拆成一台台車 |
| `src/lib/busProjection.ts` | 顯示規則 `isVisible`、車子 Y 位置 `computeBusY` |
| `src/hooks/useRealtimeBuses.ts` | polling、車道分配 |
| `src/components/RouteDiagram.tsx` | SVG 繪圖 |
| `src/App.tsx` | 主畫面、環境設定、除錯面板 |

## 拆車邏輯（vehicles.ts）
TDX ETA 每站只回報「下一台要到這站的車」，**沒有車牌、沒有站序**。依行駛順序走過各站，
同一台車的 ETA 只會遞增；**ETA 變小**，就代表換成了前面的另一台車。沒有其他門檻或容錯值。

## 開發
- Mock：localStorage `yuchen-runtime-env` 內設 `VITE_USE_MOCK: "true"`，或 `.env` 設 `VITE_USE_MOCK=true`。
- 除錯面板：按「工程模式」或點任一台車開啟，可複製該車 JSON 與 TDX ETA 原始資料。
- 要調整行為時，先拿真實原始資料確認問題，再改規則；不要針對單一畫面寫特例。

## 已知事項
- `npm run lint` 有幾條 React hooks 規則的錯誤（effect 內 setState、render 時讀寫 ref），不影響 build。
