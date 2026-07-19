import { useEffect, useMemo, useRef, useState } from 'react'
import { appSettings } from '../lib/appSettings'
import { buildBusLanes, getOrderedStations } from '../lib/busProjection'
import { fetchEtaSnapshots } from '../lib/tdxClient'
import type { BusLane, Direction, EtaSnapshot } from '../types'

// 縮小繪圖區上方留白，將路線整體上移。
const TOP = 78
const GAP = 82

function createStationY(count: number, direction: Direction): number[] {
  const bottom = TOP + (count - 1) * GAP
  return Array.from({ length: count }, (_, idx) => {
    return direction === 'outbound'
      ? bottom - idx * GAP  // 去程：第一站松山車站在最下(bottom)，最後一站玉成國小在最上(TOP)
      : TOP + idx * GAP     // 回程：第一站玉成國小在最上(TOP)，最後一站松山車站在最下(bottom)
  })
}

export function useRealtimeBuses(direction: Direction, enabled = true) {
  const stationNames = useMemo(() => getOrderedStations(direction), [direction])
  const stationY = useMemo(() => createStationY(stationNames.length, direction), [stationNames, direction])

  const [snapshots, setSnapshots] = useState<EtaSnapshot[]>([])
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
  const lastDirectionRef = useRef<Direction>(direction)

  if (lastDirectionRef.current !== direction) {
    laneAssignmentRef.current = {}
    lastDirectionRef.current = direction
  }

  const lanes: BusLane[] = useMemo(() => {
    const rawLanes = buildBusLanes(snapshots, direction, stationY)
    const prevMap = laneAssignmentRef.current
    const nextMap: Record<string, number> = {}
    const activePlates = new Set(rawLanes.map((l) => l.plateNumb))

    // 保留目前仍在線上的公車的排數設定
    for (const plate of Object.keys(prevMap)) {
      if (activePlates.has(plate)) {
        nextMap[plate] = prevMap[plate]
      }
    }

    // 為新加入的公車分配最小的可用排數（空排）
    const occupiedLanes = new Set(Object.values(nextMap))
    for (const lane of rawLanes) {
      if (nextMap[lane.plateNumb] === undefined) {
        let index = 0
        while (occupiedLanes.has(index)) {
          index++
        }
        nextMap[lane.plateNumb] = index
        occupiedLanes.add(index)
      }
    }

    // 更新 reference 以供下次比較
    laneAssignmentRef.current = nextMap

    return rawLanes.map((lane) => ({
      ...lane,
      laneIndex: nextMap[lane.plateNumb] ?? 0,
    }))
  }, [direction, snapshots, stationY])

  const refetch = async () => {
    await pull(true)
  }

  const togglePause = () => {
    setPaused((prev) => !prev)
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
    paused,
    togglePause,
    refetch,
  }
}
