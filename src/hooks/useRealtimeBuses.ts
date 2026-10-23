import { useEffect, useMemo, useRef, useState } from 'react'
import { appSettings, getTripStops } from '../lib/appSettings'
import { computeBusY, isWaitingForBoarding } from '../lib/busProjection'
import { fetchEtaRows, type TdxEtaRow } from '../lib/tdxClient'
import { rowsToVehicles } from '../lib/vehicles'
import type { BusLane, Trip, Vehicle } from '../types'

const TOP = 101
const GAP = 107

// 畫面上松山車站固定在最下方、玉成國小固定在最上方
function createStationY(count: number, trip: Trip): number[] {
  const bottom = TOP + (count - 1) * GAP
  return Array.from({ length: count }, (_, idx) => (trip === 'toWork' ? bottom - idx * GAP : TOP + idx * GAP))
}

export function useRealtimeBuses(trip: Trip, enabled = true) {
  const stationNames = useMemo(() => getTripStops(trip), [trip])
  const stationY = useMemo(() => createStationY(stationNames.length, trip), [stationNames, trip])

  const [rawRows, setRawRows] = useState<TdxEtaRow[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const pull = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const rows = await fetchEtaRows()
      setRawRows(rows)
      setVehicles(rowsToVehicles(rows))
      setUpdatedAt(new Date())
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '讀取即時資料失敗'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

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

  const laneAssignmentRef = useRef<Record<string, number>>({})
  const lastTripRef = useRef<Trip>(trip)

  if (lastTripRef.current !== trip) {
    laneAssignmentRef.current = {}
    lastTripRef.current = trip
  }

  // 已在線上的車保持原本的車道；新車填入最小的空車道
  const lanes: BusLane[] = useMemo(() => {
    const visible = vehicles.filter((v) => isWaitingForBoarding(v, trip))
    const prevMap = laneAssignmentRef.current
    const nextMap: Record<string, number> = {}

    for (const v of visible) {
      if (prevMap[v.id] !== undefined) nextMap[v.id] = prevMap[v.id]
    }

    const occupied = new Set(Object.values(nextMap))
    for (const v of visible) {
      if (nextMap[v.id] !== undefined) continue
      let index = 0
      while (occupied.has(index)) index++
      nextMap[v.id] = index
      occupied.add(index)
    }

    laneAssignmentRef.current = nextMap

    return visible.map((v) => ({
      ...v,
      busY: computeBusY(v.etas, stationY)!,
      laneIndex: nextMap[v.id],
    }))
  }, [trip, vehicles, stationY])

  const refetch = async () => {
    await pull(true)
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
    refreshing,
    error,
    updatedAt,
    paused,
    togglePause,
    refetch,
  }
}
