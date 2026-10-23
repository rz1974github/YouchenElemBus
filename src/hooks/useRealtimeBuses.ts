import { useEffect, useMemo, useState } from 'react'
import { appSettings, getTripStops } from '../lib/appSettings'
import { computeBusY, isVisible } from '../lib/busProjection'
import { fetchEtaRows, fetchStopOfRoute, type TdxEtaRow } from '../lib/tdxClient'
import { buildTripIndex, rowsToVehicles } from '../lib/vehicles'
import type { BusLane, Trip, Vehicle } from '../types'

const TOP = 101
const GAP = 107

type LaneMap = Record<string, number>

// 畫面上松山車站固定在最下方、玉成國小固定在最上方
function createStationY(count: number, trip: Trip): number[] {
  const bottom = TOP + (count - 1) * GAP
  return Array.from({ length: count }, (_, idx) => (trip === 'toWork' ? bottom - idx * GAP : TOP + idx * GAP))
}

// 已在線上的車保持原本的車道；新車填入最小的空車道
function assignLanes(prev: LaneMap, vehicles: Vehicle[]): LaneMap {
  const next: LaneMap = {}
  for (const v of vehicles) {
    if (prev[v.id] !== undefined) next[v.id] = prev[v.id]
  }

  const occupied = new Set(Object.values(next))
  for (const v of vehicles) {
    if (next[v.id] !== undefined) continue
    let index = 0
    while (occupied.has(index)) index++
    next[v.id] = index
    occupied.add(index)
  }
  return next
}

async function fetchVehicles(): Promise<{ rows: TdxEtaRow[]; vehicles: Vehicle[] }> {
  const [routes, rows] = await Promise.all([fetchStopOfRoute(), fetchEtaRows()])
  return { rows, vehicles: rowsToVehicles(rows, buildTripIndex(routes)) }
}

export function useRealtimeBuses(trip: Trip, enabled = true) {
  const stationNames = useMemo(() => getTripStops(trip), [trip])
  const stationY = useMemo(() => createStationY(stationNames.length, trip), [stationNames, trip])

  const [rawRows, setRawRows] = useState<TdxEtaRow[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  // 上班、下班各自記住車道分配
  const [laneMaps, setLaneMaps] = useState<Record<Trip, LaneMap>>({ toWork: {}, toHome: {} })
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const pull = () =>
    fetchVehicles()
      .then(({ rows, vehicles: next }) => {
        setRawRows(rows)
        setVehicles(next)
        setLaneMaps((prev) => ({
          toWork: assignLanes(prev.toWork, next.filter((v) => isVisible(v, 'toWork'))),
          toHome: assignLanes(prev.toHome, next.filter((v) => isVisible(v, 'toHome'))),
        }))
        setUpdatedAt(new Date())
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '讀取即時資料失敗')
      })
      .finally(() => {
        setLoading(false)
      })

  useEffect(() => {
    if (!enabled) {
      return
    }

    void pull()

    if (paused) {
      return
    }

    const timer = window.setInterval(() => {
      void pull()
    }, appSettings.pollingIntervalSeconds * 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [enabled, paused])

  const lanes: BusLane[] = useMemo(
    () =>
      vehicles
        .filter((v) => isVisible(v, trip) && laneMaps[trip][v.id] !== undefined)
        .map((v) => ({
          ...v,
          busY: computeBusY(v.etas, stationY)!,
          laneIndex: laneMaps[trip][v.id],
        })),
    [trip, vehicles, laneMaps, stationY],
  )

  const refetch = async () => {
    setLoading(true)
    await pull()
  }

  const togglePause = () => {
    setPaused((prev) => !prev)
  }

  return {
    lanes,
    rawRows,
    stationNames,
    stationY,
    loading,
    error,
    updatedAt,
    paused,
    togglePause,
    refetch,
  }
}
