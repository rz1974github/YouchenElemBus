import { appSettings, getTripStops } from './appSettings'
import type { Trip, Vehicle } from '../types'

// 顯示規則：
// - 還沒過上車站：距上車站 thresholdMinutes 分鐘內才顯示
// - 已過上車站：一直顯示到離開終點站（離開後 TDX 不再有它的 ETA，車輛自然消失）
// etas 依行駛順序遞增，第一個有值的站就是下一站；下一站在上車站之後，代表已過上車站。
export function isVisible(vehicle: Vehicle, trip: Trip): boolean {
  if (vehicle.trip !== trip) return false
  const boardingIdx = getTripStops(trip).indexOf(appSettings.trips[trip].boardingStop)
  const nextIdx = vehicle.etas.findIndex((eta) => eta != null)
  if (nextIdx === -1) return false
  if (nextIdx > boardingIdx) return true

  const eta = vehicle.etas[boardingIdx]
  return eta != null && eta <= appSettings.thresholdMinutes
}

// 車子的 Y 位置。etas 依行駛順序遞增，第一個有值的站就是下一站。
// - ETA = 0：貼在該站上
// - ETA > 0：放在前一站與下一站正中間；下一站是首站時，放在首站外側半個站距
export function computeBusY(etas: Array<number | null>, stationY: number[]): number | null {
  const nextIdx = etas.findIndex((eta) => eta != null)
  if (nextIdx === -1) return null
  if (etas[nextIdx] === 0) return stationY[nextIdx]

  const prevY = nextIdx > 0 ? stationY[nextIdx - 1] : stationY[0] - (stationY[1] - stationY[0])
  return (prevY + stationY[nextIdx]) / 2
}
