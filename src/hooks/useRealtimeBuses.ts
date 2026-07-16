import { useEffect, useMemo, useState } from 'react'
import { appSettings } from '../lib/appSettings'
import { buildBusLanes, getOrderedStations } from '../lib/busProjection'
import { fetchEtaSnapshots } from '../lib/tdxClient'
import type { BusLane, Direction, EtaSnapshot } from '../types'

const TOP = 90
const GAP = 82

function createStationY(count: number): number[] {
  return Array.from({ length: count }, (_, idx) => TOP + idx * GAP)
}

export function useRealtimeBuses(direction: Direction) {
  const stationNames = useMemo(() => getOrderedStations(direction), [direction])
  const stationY = useMemo(() => createStationY(stationNames.length), [stationNames])

  const [snapshots, setSnapshots] = useState<EtaSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let canceled = false

    const pull = async () => {
      try {
        const rows = await fetchEtaSnapshots()
        if (canceled) {
          return
        }

        setSnapshots(rows)
        setUpdatedAt(new Date())
        setError(null)
      } catch (err) {
        if (canceled) {
          return
        }

        const message = err instanceof Error ? err.message : '讀取即時資料失敗'
        setError(message)
      } finally {
        if (!canceled) {
          setLoading(false)
        }
      }
    }

    void pull()
    const timer = window.setInterval(
      () => void pull(),
      appSettings.pollingIntervalSeconds * 1000,
    )

    return () => {
      canceled = true
      window.clearInterval(timer)
    }
  }, [])

  const lanes: BusLane[] = useMemo(
    () => buildBusLanes(snapshots, direction, stationY),
    [direction, snapshots, stationY],
  )

  return {
    lanes,
    stationNames,
    stationY,
    loading,
    error,
    updatedAt,
  }
}
