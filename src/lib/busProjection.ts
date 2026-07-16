import { appSettings } from './appSettings'
import type { BusLane, Direction, EtaSnapshot } from '../types'

const MONITOR_STOP = '玉成里'

function getOrderedStops(direction: Direction): string[] {
  if (direction === 'outbound') {
    return appSettings.stationNames
  }

  return [...appSettings.stationNames].reverse()
}

function computeBusY(etas: Array<number | null>, stationY: number[]): number | null {
  let minEta = Number.POSITIVE_INFINITY
  let minIndex = -1

  etas.forEach((eta, index) => {
    if (eta != null && eta < minEta) {
      minEta = eta
      minIndex = index
    }
  })

  if (minIndex === -1) {
    return null
  }

  return stationY[minIndex] ?? null
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
        ?.etaByStop[MONITOR_STOP]

      if (monitorEta == null) {
        return false
      }

      return monitorEta <= appSettings.timeThresholdMinutes
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
