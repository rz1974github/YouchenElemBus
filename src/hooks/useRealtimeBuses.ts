import { useEffect, useMemo, useState } from 'react'
import { appSettings } from '../lib/appSettings'
import { buildBusLanes, getOrderedStations } from '../lib/busProjection'
import { fetchEtaSnapshots } from '../lib/tdxClient'
import type { BusLane, Direction, EtaSnapshot } from '../types'

// 將 TOP 從 90 調整至 110，把整個公車路線、站點圓圈、車道線以及車子主體整體往下平移
// 同時維持 GAP = 82，這樣底部也會預留更舒適的空間，不會頂到邊界
const TOP = 110
const GAP = 82

function createStationY(count: number, direction: Direction): number[] {
  const bottom = TOP + (count - 1) * GAP
  return Array.from({ length: count }, (_, idx) => {
    return direction === 'outbound'
      ? bottom - idx * GAP  // 去程：第一站松山車站在最下(bottom)，最後一站玉成國小在最上(TOP)
      : TOP + idx * GAP     // 回程：第一站玉成國小在最上(TOP)，最後一站松山車站在最下(bottom)
  })
}

export function useRealtimeBuses(direction: Direction) {
  const stationNames = useMemo(() => getOrderedStations(direction), [direction])
  const stationY = useMemo(() => createStationY(stationNames.length, direction), [stationNames, direction])

  const [snapshots, setSnapshots] = useState<EtaSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const pull = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const rows = await fetchEtaSnapshots()
      setSnapshots(rows)
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
    void pull()
    const timer = window.setInterval(
      () => void pull(),
      appSettings.pollingIntervalSeconds * 1000,
    )

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const lanes: BusLane[] = useMemo(
    () => buildBusLanes(snapshots, direction, stationY),
    [direction, snapshots, stationY],
  )

  const refetch = async () => {
    await pull(true)
  }

  return {
    lanes,
    snapshots,
    stationNames,
    stationY,
    loading,
    refreshing,
    error,
    updatedAt,
    refetch,
  }
}
