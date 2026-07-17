import { appSettings } from './appSettings'
import type { Direction, EtaSnapshot } from '../types'

interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  EstimateTime?: number | null
}

const TDX_API_BASE =
  'https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Taipei'

function buildApiUrl(busNumbers: string[]): string {
  const filter = busNumbers
    .map((n) => `RouteName/Zh_tw eq '${encodeURIComponent(n)}'`)
    .join(' or ')
  return `${TDX_API_BASE}?$filter=${filter}&$format=JSON`
}
const TDX_TOKEN_URL =
  'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

// 快取 token，避免每次 poll 都重新換
let cachedToken: string | null = null
let tokenExpiresAt = 0

async function fetchAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_TDX_CLIENT_ID as string | undefined
  const clientSecret = import.meta.env.VITE_TDX_CLIENT_SECRET as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('VITE_TDX_CLIENT_ID / VITE_TDX_CLIENT_SECRET 未設定')
  }

  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(`TDX token request failed (${res.status})`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  // 提前 30 秒過期，避免邊界問題
  tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000
  return cachedToken
}

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
  const stops = appSettings.stationNames

  // 每輛 mock 車用「距監測站的分鐘數」定義位置，再往前/後推算各站 ETA
  const mockBuses: Array<{ busNumber: string; direction: Direction; etaToMonitor: number }> = [
    { busNumber: '28',   direction: 'outbound', etaToMonitor: 0 },
    { busNumber: '205',  direction: 'outbound', etaToMonitor: 5 },
    { busNumber: '306',  direction: 'inbound',  etaToMonitor: 8 },
    { busNumber: '306副', direction: 'outbound', etaToMonitor: 2 },
    { busNumber: '605',  direction: 'outbound', etaToMonitor: 3 },
    { busNumber: '711',  direction: 'inbound',  etaToMonitor: 4 },
    { busNumber: '203',  direction: 'inbound',  etaToMonitor: 4 },
    { busNumber: '658',  direction: 'inbound',  etaToMonitor: 9 },
  ]

  const monitorStops: Record<Direction, string> = {
    outbound: '玉成里',
    inbound: '西新里',
  }

  return mockBuses.map(({ busNumber, direction, etaToMonitor }) => {
    const etaByStop: Record<string, number | null> = {}
    const minutesPerStop = 3
    const monitorStop = monitorStops[direction]
    
    // 回程時，站點順序在物理上是相反的
    const orderedStops = direction === 'outbound' ? stops : [...stops].reverse()
    const monitorIdx = orderedStops.indexOf(monitorStop)

    orderedStops.forEach((stop, idx) => {
      const delta = (idx - monitorIdx) * minutesPerStop
      const eta = etaToMonitor + delta
      etaByStop[stop] = eta >= 0 ? eta : null  // 已過站回傳 null
    })

    // 特例：205 去程在西新里和玉成國小中間的虛線上
    if (busNumber === '205' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['南港路三段'] = null
      etaByStop['西新里'] = -1.0  // 已過站 1.0 分鐘
      etaByStop['玉成國小'] = 1.0  // 還剩 1.0 分鐘到站，此時公車正好處於兩站正中間
    }

    // 特例：28 去程剛好在南港路三段上
    if (busNumber === '28' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['南港路三段'] = 0  // 剛好在站上，所以顯示在圓圈上
      etaByStop['西新里'] = 2
      etaByStop['玉成國小'] = 5  // 最後一站未過，因此不消失
    }

    // 特例：306副 去程在玉成里跟松山磚廠中間的虛線上
    if (busNumber === '306副' && direction === 'outbound') {
      etaByStop['松山車站'] = null
      etaByStop['玉成里'] = -1.5   // 已過站 1.5 分鐘
      etaByStop['松山磚廠'] = 1.5  // 還剩 1.5 分鐘到站，此時公車正好處於兩站正中間
      etaByStop['南港路三段'] = 4.5
      etaByStop['西新里'] = 7.5
      etaByStop['玉成國小'] = 10.5 // 保留到最後一站
    }

    // 特例：711 回程剛好在玉成國小上
    if (busNumber === '711' && direction === 'inbound') {
      etaByStop['玉成國小'] = 0  // 剛好到站，顯示在玉成國小圓圈上
      etaByStop['西新里'] = 3
      etaByStop['南港路三段'] = 6
      etaByStop['松山磚廠'] = 9
      etaByStop['玉成里'] = 12
      etaByStop['松山車站'] = 15 // 後續站點正常保留虛線
    }

    // 特例：203 回程已過玉成國小和西新里，在西新里與南港路三段中間的虛線上
    if (busNumber === '203' && direction === 'inbound') {
      etaByStop['玉成國小'] = null
      etaByStop['西新里'] = -1.0  // 已過 1 分鐘，不顯示圓圈，用來跟下一站拉虛線
      etaByStop['南港路三段'] = 1.0  // 剩餘 1 分鐘，顯示圓圈
      etaByStop['松山磚廠'] = 4.0
      etaByStop['玉成里'] = 7.0
      etaByStop['松山車站'] = 10.0 // 最後一站未過，確保不消失
    }

    // 特例：658 回程已過前面大部分站點，剛好在玉成里上
    if (busNumber === '658' && direction === 'inbound') {
      etaByStop['玉成國小'] = null
      etaByStop['西新里'] = null
      etaByStop['南港路三段'] = null
      etaByStop['松山磚廠'] = null
      etaByStop['玉成里'] = 0     // 剛好在站上，顯示在玉成里圓圈上
      etaByStop['松山車站'] = null // 終點站設為 null
    }

    // 特例：306 回程還有 5 分到玉成國小
    if (busNumber === '306' && direction === 'inbound') {
      etaByStop['玉成國小'] = 5
      etaByStop['西新里'] = 8
      etaByStop['南港路三段'] = 11
      etaByStop['松山磚廠'] = 14
      etaByStop['玉成里'] = 17
      etaByStop['松山車站'] = 20
    }

    return { busNumber, direction, etaByStop }
  })
}

export async function fetchEtaSnapshots(signal?: AbortSignal): Promise<EtaSnapshot[]> {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true'
  const clientId = import.meta.env.VITE_TDX_CLIENT_ID as string | undefined

  if (useMock || !clientId) {
    return buildMockSnapshots()
  }

  const accessToken = await fetchAccessToken()

  const response = await fetch(buildApiUrl(appSettings.busNumbers), {
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
