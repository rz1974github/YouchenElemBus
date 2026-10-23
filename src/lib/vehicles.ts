import { appSettings, getTripStops, toTripIndex } from './appSettings'
import type { TdxEtaRow } from './tdxClient'
import type { Trip, Vehicle } from '../types'

interface StopObservation {
  tripIdx: number
  eta: number
  plate: string | null
}

// TDX 站名可能帶後綴，例如「松山車站(八德)」，以前綴比對設定檔站名
function matchStation(stopName: string): number {
  return appSettings.stationNames.findIndex((name) => stopName.startsWith(name))
}

// TDX 無車牌時給空字串或 "-1"
function cleanPlate(plate: string | undefined): string | null {
  const value = plate?.trim()
  return value && value !== '-1' ? value : null
}

// 依 StopSequence 判斷這組 (路線, TDX Direction) 是上班還是下班：
// 站序越後面、stationNames 索引越大 → 往玉成國小 → 上班。
function detectTrip(stops: Array<{ stationIdx: number; stopSequence: number }>): Trip | null {
  const sorted = [...stops].sort((a, b) => a.stopSequence - b.stopSequence)
  let score = 0
  for (let i = 1; i < sorted.length; i++) {
    score += Math.sign(sorted[i].stationIdx - sorted[i - 1].stationIdx)
  }
  if (score > 0) return 'toWork'
  if (score < 0) return 'toHome'
  return null
}

// TDX 每站只給「下一台要到這站的車」的 ETA。依行駛順序走過各站，
// 同一台車的 ETA 只會遞增；ETA 變小或車牌不同，代表換成前面另一台車。
function splitIntoVehicles(
  busNumber: string,
  trip: Trip,
  byStop: Array<StopObservation | null>,
): Vehicle[] {
  const segments: StopObservation[][] = []
  let current: StopObservation[] = []

  for (const obs of byStop) {
    if (!obs) continue
    const last = current[current.length - 1]
    const currentPlate = current.find((o) => o.plate)?.plate ?? null
    const isNewVehicle =
      last !== undefined && (obs.eta < last.eta || (obs.plate !== null && currentPlate !== null && obs.plate !== currentPlate))
    if (isNewVehicle) {
      segments.push(current)
      current = []
    }
    current.push(obs)
  }
  if (current.length > 0) segments.push(current)

  // 無車牌時以「由前往後第幾台」當識別，讓車道在 poll 之間盡量穩定
  return segments.reverse().map((segment, ordinal) => {
    const plateNumb = segment.find((o) => o.plate)?.plate ?? null
    const etas: Array<number | null> = byStop.map(() => null)
    for (const o of segment) etas[o.tripIdx] = o.eta
    return {
      id: plateNumb ?? `${busNumber}-${trip}-${ordinal + 1}`,
      busNumber,
      plateNumb,
      trip,
      etas,
    }
  })
}

export function rowsToVehicles(rows: TdxEtaRow[]): Vehicle[] {
  // 以 (路線, TDX Direction) 分組。TDX 的 Direction 只當分組鍵，
  // 它對每條路線的意義不同，不能直接當成上班或下班。
  const groups = new Map<
    string,
    { busNumber: string; sequences: Array<{ stationIdx: number; stopSequence: number }>; rows: Array<{ stationIdx: number; row: TdxEtaRow }> }
  >()

  for (const row of rows) {
    const busNumber = row.RouteName?.Zh_tw
    const stopName = row.StopName?.Zh_tw
    if (!busNumber || !stopName || !appSettings.busNumbers.includes(busNumber)) continue

    const stationIdx = matchStation(stopName)
    if (stationIdx === -1) continue

    const key = `${busNumber}|${row.Direction ?? ''}`
    if (!groups.has(key)) groups.set(key, { busNumber, sequences: [], rows: [] })
    const group = groups.get(key)!
    if (row.StopSequence != null) group.sequences.push({ stationIdx, stopSequence: row.StopSequence })
    group.rows.push({ stationIdx, row })
  }

  const vehicles: Vehicle[] = []
  for (const group of groups.values()) {
    const trip = detectTrip(group.sequences)
    if (!trip) continue

    // 同一站可能有多個站牌（如松山車站），取最早到的那筆
    const byStop: Array<StopObservation | null> = getTripStops(trip).map(() => null)
    for (const { stationIdx, row } of group.rows) {
      if (row.EstimateTime == null || row.EstimateTime < 0) continue
      const tripIdx = toTripIndex(trip, stationIdx)
      const eta = Math.ceil(row.EstimateTime / 60)
      const existing = byStop[tripIdx]
      if (!existing || eta < existing.eta) {
        byStop[tripIdx] = { tripIdx, eta, plate: cleanPlate(row.PlateNumb) }
      }
    }

    vehicles.push(...splitIntoVehicles(group.busNumber, trip, byStop))
  }

  return vehicles
}
