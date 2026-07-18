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

  // 如果最接近且尚未到站的是「玉成里」（index = 1，此時 prevIdx = 0，即松山車站）
  // 且首站松山車站已經過站為 null。這代表公車此時物理上行駛在：
  // 松山車站 (已過站 null) ➔ 玉成里 (剩 5 分鐘) 之間的虛線軌道上。
  // 我們同樣採用「平滑虛擬插值」邏輯（假定兩站間平均行進 3 分鐘），計算出其比例並平滑放置於兩站之間。
  const prevEta = prevIdx >= 0 ? etas[prevIdx] : null
  
  // 當前站已過站但無具體負值 ETA 時（為 null），我們假定站與站之間平均行駛 3 分鐘，
  // 從而估算已過時間為 Math.max(0, 3 - minEta)，使車子平滑出現在兩站之間，而非粘在前一站圈圈上
  // 若估算出來的已過時間 + minEta (剩餘時間) 小於等於 0，則 fallback 設為合理的 1 分鐘避免除以 0
  const elapsed = prevEta != null 
    ? Math.max(0, -prevEta) 
    : Math.max(0, 3 - minEta)
    
  const total = elapsed + minEta
  const ratio = total > 0 ? minEta / total : 0

  if (prevIdx < 0) {
    // 若目前最靠近的站是起點首站（index = 0），且其 ETA 大於 0，
    // 這在物理上代表車子還沒到達首站（正由外側向首站駛近，或正準備發車）
    // 應遵循使用者規則：只要車子還在起點外側，不限剩餘幾分鐘（如 2 分、6 分），其 Y 軸投影位置應該要完全一樣。
    // 這能提供完美的物理整齊度，不用考慮誰比較近，統一平穩地定位在首站外側的固定距離上。
    if (minEta > 0) {
      const firstY = stationY[0]
      const secondY = stationY[1] ?? (firstY - 82)
      const isOutbound = firstY > secondY // 去程首站在下方，值較大

      // 統一放置在距離首站外側 82 像素（一個完整站距）的整齊固定起跑點位置上
      return isOutbound ? firstY + 82 : firstY - 82
    }
    return stationY[approachIdx]
  }

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
        plateNumb: snapshot.plateNumb,
        etas,
        busY: computeBusY(etas, stationY),
      }
    })
    .filter((lane) => {
      // 依據全新規則篩選候選車輛：
      // 1. 去程：車子距監測站「玉成里」在 0 ~ 10 分鐘內；或車子目前處在「松山車站」到「玉成國小」之間的任何位置。
      // 2. 回程：車子距監測站「西新里」在 0 ~ 10 分鐘內；或車子目前處在「松山車站」到「玉成國小」之間的任何位置。
      
      const monitorEta = lane.etas[orderedStops.indexOf(MONITOR_STOP[direction])]

      // 規則 1：在監測站 0 ~ 10 分鐘門檻內（準備進站中）
      if (monitorEta != null && monitorEta >= 0 && monitorEta <= appSettings.timeThresholdMinutes) {
        return true
      }

      // 規則 2：車子目前處於「松山車站」到「玉成國小」之間的任何位置。
      // 由於去程與回程的 orderedStops 順序相反（去程:松山->玉成國小，回程:玉成國小->松山）
      // 「在松山車站與玉成國小之間」等同於：
      // 「已出發過起點站（本方向的首站 ETA 為 null 或已過站 < 0），且尚未抵達/通過終點站（本方向的最後一站 ETA >= 0）」
      const firstStopEta = lane.etas[0]
      const lastStopEta = lane.etas[lane.etas.length - 1]

      const hasPassedFirstStop = firstStopEta == null || firstStopEta < 0
      const hasNotPassedLastStop = lastStopEta != null && lastStopEta >= 0

      if (hasPassedFirstStop && hasNotPassedLastStop) {
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
