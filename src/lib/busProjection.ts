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

function getMinNonNegativeEta(etas: Array<number | null>): number | null {
  let minEta = Number.POSITIVE_INFINITY

  for (const eta of etas) {
    if (eta != null && eta >= 0 && eta < minEta) {
      minEta = eta
    }
  }

  return Number.isFinite(minEta) ? minEta : null
}

function splitNoPlateByNullSegments(
  snapshot: EtaSnapshot,
  orderedStops: string[],
): Array<{ plateNumb: string; etas: Array<number | null> }> {
  const baseEtas = orderedStops.map((stop) => snapshot.etaByStop[stop] ?? null)
  const isNoPlate = snapshot.plateNumb.startsWith('no-plate-')

  if (!isNoPlate) {
    return [{ plateNumb: snapshot.plateNumb, etas: baseEtas }]
  }

  const segments: Array<{ start: number; end: number }> = []
  let segmentStart = -1

  for (let i = 0; i < baseEtas.length; i++) {
    const eta = baseEtas[i]
    if (eta != null) {
      if (segmentStart === -1) {
        segmentStart = i
      }
      continue
    }

    if (segmentStart !== -1) {
      segments.push({ start: segmentStart, end: i - 1 })
      segmentStart = -1
    }
  }

  if (segmentStart !== -1) {
    segments.push({ start: segmentStart, end: baseEtas.length - 1 })
  }

  // 只有一段（或沒有有效資料）就維持原樣，不額外拆分。
  if (segments.length <= 1) {
    return [{ plateNumb: snapshot.plateNumb, etas: baseEtas }]
  }

  return segments.map((segment, idx) => {
    const etas = baseEtas.map(() => null as number | null)
    for (let i = segment.start; i <= segment.end; i++) {
      etas[i] = baseEtas[i]
    }

    return {
      plateNumb: `${snapshot.plateNumb}-split${idx + 1}`,
      etas,
    }
  })
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
    // 狀態 3：在外圍（首站外側固定位置，不依 ETA 比例）
    if (minEta > 0) {
      const firstY = stationY[0]
      const secondY = stationY[1] ?? (firstY - 82)
      const isOutbound = firstY > secondY // 去程首站在下方，值較大
      const gap = Math.abs(firstY - secondY)

      // 首站外等待時，放在「想像前一站」與首站中間（半個站距）。
      return isOutbound ? firstY + gap / 2 : firstY - gap / 2
    }

    // 狀態 1：在站上（ETA = 0）
    return stationY[approachIdx]
  }

  // 狀態 1：在站上（ETA = 0）
  if (minEta === 0) {
    return stationY[approachIdx]
  }

  // 狀態 2：在虛線上（固定放在前一站與下一站正中間，不依 ETA 比例）
  return (stationY[prevIdx] + stationY[approachIdx]) / 2
}

export function buildBusLanes(
  snapshots: EtaSnapshot[],
  direction: Direction,
  stationY: number[],
): BusLane[] {
  const orderedStops = getOrderedStops(direction)
  const lanes: BusLane[] = []

  for (const snapshot of snapshots) {
    if (snapshot.direction !== direction) {
      continue
    }

    const splitParts = splitNoPlateByNullSegments(snapshot, orderedStops)
    for (const part of splitParts) {
      lanes.push({
        busNumber: snapshot.busNumber,
        plateNumb: part.plateNumb,
        etas: part.etas,
        busY: computeBusY(part.etas, stationY),
      })
    }
  }

  return lanes
    .filter((lane) => {
      // 全域規則：只要該車目前最小非負 ETA 超過 20 分鐘，直接排除（不分去回程）
      const minNonNegativeEta = getMinNonNegativeEta(lane.etas)
      if (minNonNegativeEta == null || minNonNegativeEta > 20) {
        return false
      }

      // 依據篩選規則顯示候選車輛：
      // 規則 1：距監測站（去程 玉成里 / 回程 西新里）在 0 ~ 10 分鐘內。
      // 規則 3：車輛正在區間內的某個站上，或正在區間內某兩站之間。
      
      const monitorEta = lane.etas[orderedStops.indexOf(MONITOR_STOP[direction])]

      // 規則 1：在監測站 0 ~ 10 分鐘門檻內（準備進站中）
      if (monitorEta != null && monitorEta >= 0 && monitorEta <= appSettings.timeThresholdMinutes) {
        return true
      }

      // 規則 3：車輛正在區間內的某個站上，或正在區間內某兩站之間行駛。
      // - approachIdx > 0：即將抵達的站不是首站，代表前一站也在區間內，車輛確實在兩站之間。
      // - approachIdx === 0 且 ruleMinEta === 0：車輛已停在首站上。
      // （approachIdx === 0 但 ruleMinEta > 0 的情況表示車輛在首站外側趨近，尚未進入區間，不顯示）
      let ruleMinEta = Number.POSITIVE_INFINITY
      let approachIdx = -1
      lane.etas.forEach((eta, idx) => {
        if (eta != null && eta >= 0 && eta < ruleMinEta) {
          ruleMinEta = eta
          approachIdx = idx
        }
      })

      if (approachIdx > 0 || ruleMinEta === 0) {
        return true
      }

      return false
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
