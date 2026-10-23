import { appSettings } from './appSettings'
import type { TdxEtaRow, TdxStopOfRoute } from './tdxClient'

// Mock 產生「長得像 TDX 原始回應」的資料，讓 mock 與真實資料走同一條解析路徑。
// 每條路線的 TDX Direction 與上班/下班的對應刻意不一致（真實資料也是如此），
// 用來驗證 App 不依賴 TDX Direction 的意義。
interface MockRoute {
  busNumber: string
  tdxDirection: number
  towardSchool: boolean // true：沿路線往玉成國小（上班方向）
  // 每台車距離「沿線第一站」的分鐘數，負值代表已經過了
  buses: number[]
}

const MOCK_ROUTES: MockRoute[] = [
  { busNumber: '28', tdxDirection: 1, towardSchool: true, buses: [2, -9] },
  { busNumber: '205', tdxDirection: 1, towardSchool: true, buses: [-1, 25] },
  { busNumber: '306', tdxDirection: 1, towardSchool: false, buses: [1, -6] },
  { busNumber: '711', tdxDirection: 0, towardSchool: false, buses: [4] },
  { busNumber: '306', tdxDirection: 0, towardSchool: true, buses: [7] },
]

const MINUTES_PER_STOP = 3
// 讓 mock 隨時間前進，並以 60 分鐘為週期循環
const CYCLE_MINUTES = 60
const startedAt = Date.now()

function routeStops(route: MockRoute): string[] {
  const stations = appSettings.stationNames
  return route.towardSchool ? stations : [...stations].reverse()
}

function tdxStopName(stop: string): string {
  return stop === '松山車站' ? '松山車站(八德)' : stop
}

export function buildMockStopOfRoute(): TdxStopOfRoute[] {
  return MOCK_ROUTES.map((route) => ({
    RouteName: { Zh_tw: route.busNumber },
    Direction: route.tdxDirection,
    Stops: routeStops(route).map((stop, i) => ({ StopName: { Zh_tw: tdxStopName(stop) }, StopSequence: 20 + i })),
  }))
}

export function buildMockEtaRows(): TdxEtaRow[] {
  const elapsed = (Date.now() - startedAt) / 60000
  const rows: TdxEtaRow[] = []

  for (const route of MOCK_ROUTES) {
    const offsets = route.buses.map((minutes) => {
      const t = minutes - elapsed + CYCLE_MINUTES / 2
      return (((t % CYCLE_MINUTES) + CYCLE_MINUTES) % CYCLE_MINUTES) - CYCLE_MINUTES / 2
    })

    routeStops(route).forEach((stop, i) => {
      // 每站只回報下一台要到的車
      const etas = offsets.map((o) => o + i * MINUTES_PER_STOP).filter((eta) => eta >= 0)
      rows.push({
        RouteName: { Zh_tw: route.busNumber },
        Direction: route.tdxDirection,
        StopName: { Zh_tw: tdxStopName(stop) },
        EstimateTime: etas.length > 0 ? Math.round(Math.min(...etas) * 60) : null,
      })
    })
  }

  return rows
}
