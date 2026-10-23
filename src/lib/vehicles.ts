import { appSettings, getTripStops, toTripIndex } from './appSettings'
import type { TdxEtaRow, TdxStopOfRoute } from './tdxClient'
import type { Trip, Vehicle } from '../types'

// key：`${路線}|${TDX Direction}` → 上班或下班
export type TripIndex = Map<string, Trip>

function routeKey(busNumber: string, direction: number | undefined): string {
  return `${busNumber}|${direction ?? ''}`
}

// TDX 站名可能帶後綴，例如「松山車站(八德)」「西新里(新新公園)」，以前綴比對設定檔站名
function matchStation(stopName: string | undefined): number {
  if (!stopName) return -1
  return appSettings.stationNames.findIndex((name) => stopName.startsWith(name))
}

// 依 StopOfRoute 的站序判斷每個 (路線, TDX Direction) 是上班還是下班：
// 站序越後面、stationNames 索引越大 → 往玉成國小 → 上班。
// 同一組下的子路線方向不一致時，視為無法判斷。
export function buildTripIndex(routes: TdxStopOfRoute[]): TripIndex {
  const trips = new Map<string, Trip | null>()

  for (const route of routes) {
    const busNumber = route.RouteName?.Zh_tw
    if (!busNumber) continue

    const stops = (route.Stops ?? [])
      .map((s) => ({ stationIdx: matchStation(s.StopName?.Zh_tw), seq: s.StopSequence ?? 0 }))
      .filter((s) => s.stationIdx !== -1)
      .sort((a, b) => a.seq - b.seq)

    let score = 0
    for (let i = 1; i < stops.length; i++) {
      score += Math.sign(stops[i].stationIdx - stops[i - 1].stationIdx)
    }
    if (score === 0) continue

    const trip: Trip = score > 0 ? 'toWork' : 'toHome'
    const key = routeKey(busNumber, route.Direction)
    const existing = trips.get(key)
    trips.set(key, existing === undefined || existing === trip ? trip : null)
  }

  const index: TripIndex = new Map()
  for (const [key, trip] of trips) {
    if (trip) index.set(key, trip)
  }
  return index
}

// TDX 每站只給「下一台要到這站的車」的 ETA，沒有車牌。依行駛順序走過各站，
// 同一台車的 ETA 只會遞增；ETA 變小，代表換成前面的另一台車。
function splitIntoVehicles(busNumber: string, trip: Trip, etasByStop: Array<number | null>): Vehicle[] {
  const segments: Array<Array<{ tripIdx: number; eta: number }>> = []
  let current: Array<{ tripIdx: number; eta: number }> = []

  etasByStop.forEach((eta, tripIdx) => {
    if (eta == null) return
    const last = current[current.length - 1]
    if (last !== undefined && eta < last.eta) {
      segments.push(current)
      current = []
    }
    current.push({ tripIdx, eta })
  })
  if (current.length > 0) segments.push(current)

  // 以「由前往後第幾台」當識別，讓車道在 poll 之間盡量穩定
  return segments.reverse().map((segment, ordinal) => {
    const etas: Array<number | null> = etasByStop.map(() => null)
    for (const { tripIdx, eta } of segment) etas[tripIdx] = eta
    return { id: `${busNumber}-${trip}-${ordinal + 1}`, busNumber, trip, etas }
  })
}

export function rowsToVehicles(rows: TdxEtaRow[], tripIndex: TripIndex): Vehicle[] {
  const groups = new Map<string, { busNumber: string; trip: Trip; etasByStop: Array<number | null> }>()

  for (const row of rows) {
    const busNumber = row.RouteName?.Zh_tw
    if (!busNumber || !appSettings.busNumbers.includes(busNumber)) continue
    if (row.EstimateTime == null || row.EstimateTime < 0) continue

    const stationIdx = matchStation(row.StopName?.Zh_tw)
    if (stationIdx === -1) continue

    const key = routeKey(busNumber, row.Direction)
    const trip = tripIndex.get(key)
    if (!trip) continue

    if (!groups.has(key)) {
      groups.set(key, { busNumber, trip, etasByStop: getTripStops(trip).map(() => null) })
    }
    const group = groups.get(key)!

    // 同一站可能有多個站牌（如松山車站），取最早到的那筆
    const tripIdx = toTripIndex(trip, stationIdx)
    const eta = Math.ceil(row.EstimateTime / 60)
    const existing = group.etasByStop[tripIdx]
    if (existing == null || eta < existing) group.etasByStop[tripIdx] = eta
  }

  return [...groups.values()].flatMap((g) => splitIntoVehicles(g.busNumber, g.trip, g.etasByStop))
}
