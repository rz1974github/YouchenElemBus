import { appSettings } from './appSettings'
import type { Direction, EtaSnapshot } from '../types'

interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  EstimateTime?: number | null
}

const TDX_API =
  'https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Taipei?$format=JSON'

function normalizeDirection(raw: number | undefined): Direction {
  return raw === 1 ? 'inbound' : 'outbound'
}

function toMinute(value: number | null | undefined): number | null {
  if (value == null || value < 0) {
    return null
  }

  return Math.ceil(value / 60)
}

function createSnapshotMap(): Map<string, EtaSnapshot> {
  return new Map()
}

function pickSmaller(current: number | null, nextValue: number | null): number | null {
  if (current == null) {
    return nextValue
  }

  if (nextValue == null) {
    return current
  }

  return Math.min(current, nextValue)
}

function buildMockSnapshots(): EtaSnapshot[] {
  return appSettings.busNumbers.map((busNumber, idx) => {
    const etaByStop: Record<string, number | null> = {}
    const base = (idx % 5) + 2

    appSettings.stationNames.forEach((stop, stopIdx) => {
      etaByStop[stop] = base + stopIdx * 2
    })

    return {
      busNumber,
      direction: idx % 2 === 0 ? 'outbound' : 'inbound',
      etaByStop,
    }
  })
}

export async function fetchEtaSnapshots(signal?: AbortSignal): Promise<EtaSnapshot[]> {
  const accessToken = import.meta.env.VITE_TDX_ACCESS_TOKEN as string | undefined

  if (!accessToken) {
    return buildMockSnapshots()
  }

  const response = await fetch(TDX_API, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`TDX request failed (${response.status})`)
  }

  const rows = (await response.json()) as TdxEtaRow[]
  const snapshots = createSnapshotMap()

  for (const row of rows) {
    const busNumber = row.RouteName?.Zh_tw
    const stopName = row.StopName?.Zh_tw
    const direction = normalizeDirection(row.Direction)

    if (!busNumber || !stopName) {
      continue
    }

    if (!appSettings.busNumbers.includes(busNumber)) {
      continue
    }

    if (!appSettings.stationNames.includes(stopName)) {
      continue
    }

    const key = `${busNumber}-${direction}`
    const current = snapshots.get(key) ?? {
      busNumber,
      direction,
      etaByStop: {},
    }

    const etaMinute = toMinute(row.EstimateTime)
    const existingMinute = current.etaByStop[stopName] ?? null
    current.etaByStop[stopName] = pickSmaller(existingMinute, etaMinute)

    snapshots.set(key, current)
  }

  return Array.from(snapshots.values())
}
