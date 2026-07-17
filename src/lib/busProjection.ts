import { appSettings } from './appSettings'
import type { BusLane, Direction, EtaSnapshot } from '../types'

const MONITOR_STOP: Record<Direction, string> = {
  outbound: '玉成里',
  inbound: '西新里',
}

function getOrderedStops(direction: Direction): string[] {
  if (direction === 'outbound') {
    return appSettings.stationNames
  }

  return [...appSettings.stationNames].reverse()
}

function computeBusY(etas: Array<number | null>, stationY: number[]): number | null {
  // 找下一個即將到達的站（最小非負 ETA，即 >= 0）
  let minEta = Number.POSITIVE_INFINITY
  let approachIdx = -1

  etas.forEach((eta, index) => {
    if (eta != null && eta >= 0 && eta < minEta) {
      minEta = eta
      approachIdx = index
    }
  })

  if (approachIdx === -1) return null

  const prevIdx = approachIdx - 1

  if (prevIdx < 0) {
    // 若剛好在第一站（ETA=0），顯示在該站；否則還未進入路線圖，不顯示
    return minEta === 0 ? stationY[approachIdx] : null
  }

  // 用前一站（已過）和下一站（即將到）之間做線性插值
  // 假設兩站間行駛時間 = 前站已過行駛時間（負值絕對值）+ 當站剩餘 ETA
  const prevEta = etas[prevIdx] // 已過站的 ETA 可能是負數（如 -0.5）或 null
  const elapsed = prevEta != null ? Math.max(0, -prevEta) : 0
  const total = elapsed + minEta
  const ratio = total > 0 ? minEta / total : 0

  // ratio=0 → 在 approachIdx 站；ratio=1 → 在 prevIdx 站
  return stationY[approachIdx] + ratio * (stationY[prevIdx] - stationY[approachIdx])
}

export function buildBusLanes(
  snapshots: EtaSnapshot[],
  direction: Direction,
  stationY: number[],
): BusLane[] {
  const orderedStops = getOrderedStops(direction)

  return snapshots
    .filter((snapshot) => snapshot.direction === direction)
    .map((snapshot) => {
      const etas = orderedStops.map((stop) => snapshot.etaByStop[stop] ?? null)

      return {
        busNumber: snapshot.busNumber,
        etas,
        busY: computeBusY(etas, stationY),
      }
    })
    .filter((lane) => {
      const monitorEta = snapshots
        .find(
          (snapshot) =>
            snapshot.busNumber === lane.busNumber && snapshot.direction === direction,
        )
        ?.etaByStop[MONITOR_STOP[direction]]

      // 條件1：監測站在 0-10 分內（初次進入）
      if (monitorEta != null && monitorEta >= 0 && monitorEta <= appSettings.timeThresholdMinutes) {
        return true
      }

      // 條件2：最後一站還沒過站（ETA >= 0），即使監測站已過站，仍保留
      const lastStationEta = lane.etas[lane.etas.length - 1]
      return lastStationEta != null && lastStationEta >= 0
    })
    .sort((a, b) => {
      const aEta = a.etas[0] ?? Number.POSITIVE_INFINITY
      const bEta = b.etas[0] ?? Number.POSITIVE_INFINITY

      return aEta - bEta
    })
}

export function getOrderedStations(direction: Direction): string[] {
  return getOrderedStops(direction)
}
