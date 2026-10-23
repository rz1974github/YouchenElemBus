import { appSettings } from './appSettings'
import type { TdxEtaRow } from './tdxClient'

// Mock 產生「長得像 TDX 原始回應」的資料，讓 mock 與真實資料走同一條解析路徑。
// 每條路線的 TDX Direction 與上班/下班的對應刻意不一致，用來驗證 App 不依賴 TDX Direction。
interface MockRoute {
  busNumber: string
  tdxDirection: number
  towardSchool: boolean // true：沿路線往玉成國小（上班方向）
  // 每台車距離「沿線第一站」的分鐘數，負值代表已經過了
  buses: Array<{ plate: string; minutesToFirstStop: number }>
}

const MOCK_ROUTES: MockRoute[] = [
  { busNumber: '28', tdxDirection: 0, towardSchool: true, buses: [{ plate: 'EAL-0028', minutesToFirstStop: 2 }, { plate: '', minutesToFirstStop: -9 }] },
  { busNumber: '205', tdxDirection: 1, towardSchool: true, buses: [{ plate: '', minutesToFirstStop: -1 }] },
  { busNumber: '306', tdxDirection: 0, towardSchool: false, buses: [{ plate: '306-FL', minutesToFirstStop: 1 }, { plate: 'EAL-3066', minutesToFirstStop: -6 }] },
  { busNumber: '711', tdxDirection: 1, towardSchool: false, buses: [{ plate: '711-FL', minutesToFirstStop: 4 }] },
  { busNumber: '658', tdxDirection: 0, towardSchool: true, buses: [{ plate: '658-FL', minutesToFirstStop: 7 }] },
]

const MINUTES_PER_STOP = 3
// 讓 mock 隨時間前進，並以 40 分鐘為週期循環
const CYCLE_MINUTES = 40
const startedAt = Date.now()

export function buildMockRows(): TdxEtaRow[] {
  const elapsed = (Date.now() - startedAt) / 60000
  const stations = appSettings.stationNames
  const rows: TdxEtaRow[] = []

  for (const route of MOCK_ROUTES) {
    const stops = route.towardSchool ? stations : [...stations].reverse()
    const offsets = route.buses.map((bus) => {
      const t = bus.minutesToFirstStop - elapsed + CYCLE_MINUTES / 2
      return (((t % CYCLE_MINUTES) + CYCLE_MINUTES) % CYCLE_MINUTES) - CYCLE_MINUTES / 2
    })

    stops.forEach((stop, i) => {
      // 每站只回報下一台要到的車
      let next: { eta: number; plate: string } | null = null
      route.buses.forEach((bus, b) => {
        const eta = offsets[b] + i * MINUTES_PER_STOP
        if (eta >= 0 && (!next || eta < next.eta)) next = { eta, plate: bus.plate }
      })
      const nextBus = next as { eta: number; plate: string } | null

      rows.push({
        RouteName: { Zh_tw: route.busNumber },
        Direction: route.tdxDirection,
        StopName: { Zh_tw: stop === '松山車站' ? '松山車站(八德)' : stop },
        StopSequence: 20 + i,
        EstimateTime: nextBus ? Math.round(nextBus.eta * 60) : null,
        PlateNumb: nextBus?.plate ?? '',
      })
    })
  }

  return rows
}
