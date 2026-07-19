import { appSettings } from './appSettings'
import { getRuntimeEnv, useMockFromRuntimeEnv } from './runtimeEnv'
import type { Direction, EtaSnapshot } from '../types'

interface TdxEtaRow {
  RouteName?: { Zh_tw?: string }
  Direction?: number
  StopName?: { Zh_tw?: string }
  EstimateTime?: number | null
  StopSequence?: number
  PlateNumb?: string
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
  const clientId = getRuntimeEnv('VITE_TDX_CLIENT_ID')
  const clientSecret = getRuntimeEnv('VITE_TDX_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('VITE_TDX_CLIENT_ID / VITE_TDX_CLIENT_SECRET 未設定，請先點擊「環境設定」')
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

function normalizeStopName(stopName: string | undefined): string | null {
  if (!stopName) return null

  // 處理松山車站的多種後綴（如：松山車站(八德)、松山車站(松山)、松山車站(終點)）
  if (stopName.includes('松山車站')) {
    return '松山車站'
  }

  // 模糊比對其餘設定檔中的站點名稱
  for (const name of appSettings.stationNames) {
    if (stopName === name || stopName.startsWith(name) || stopName.includes(name)) {
      return name
    }
  }

  return null
}

function toMinute(value: number | null | undefined): number | null {
  if (value == null) {
    return null
  }

  // 正值以 ceil 保守估算到站分鐘；負值以 floor 保留「已過站」訊號
  return value >= 0 ? Math.ceil(value / 60) : Math.floor(value / 60)
}

function buildMockSnapshots(): EtaSnapshot[] {
  const stops = appSettings.stationNames

  // 每輛 mock 車用「距監測站的分鐘數」定義位置，再往前/後推算各站 ETA
  const mockBuses: Array<{ busNumber: string; direction: Direction; etaToMonitor: number; plateNumb: string }> = [
    { busNumber: '28',   direction: 'outbound', etaToMonitor: 0, plateNumb: 'EAL-0028' },
    { busNumber: '205',  direction: 'outbound', etaToMonitor: 5, plateNumb: 'EAL-0205' },
    { busNumber: '306',  direction: 'inbound',  etaToMonitor: 8, plateNumb: '306-FL' },
    { busNumber: '306',  direction: 'inbound',  etaToMonitor: 2, plateNumb: 'EAL-3066' }, // 另一台 306！
    { busNumber: '306副', direction: 'outbound', etaToMonitor: 2, plateNumb: '306-FZ' },
    { busNumber: '605',  direction: 'outbound', etaToMonitor: 3, plateNumb: '605-FM' },
    { busNumber: '711',  direction: 'inbound',  etaToMonitor: 4, plateNumb: '711-FL' },
    { busNumber: '203',  direction: 'inbound',  etaToMonitor: 4, plateNumb: '203-U7' },
    { busNumber: '658',  direction: 'inbound',  etaToMonitor: 9, plateNumb: '658-FL' },
  ]

  const monitorStops: Record<Direction, string> = {
    outbound: '玉成里',
    inbound: '西新里',
  }

  return mockBuses.map(({ busNumber, direction, etaToMonitor, plateNumb }) => {
    const etaByStop: Record<string, number | null> = {}
    const minutesPerStop = 3
    const monitorStop = monitorStops[direction]
    
    // 回程時，站點順序在物理上是相反的
    const orderedStops = direction === 'outbound' ? stops : [...stops].reverse()
    const monitorIdx = orderedStops.indexOf(monitorStop)

    orderedStops.forEach((stop, idx) => {
      const delta = (idx - monitorIdx) * minutesPerStop
      const eta = etaToMonitor + delta
      etaByStop[stop] = eta
    })

    return { busNumber, direction, plateNumb, etaByStop }
  })
}

export async function fetchEtaSnapshots(signal?: AbortSignal): Promise<EtaSnapshot[]> {
  const useMock = useMockFromRuntimeEnv()

  // Mock mode is opt-in only. Default is OFF unless explicitly set to true.
  if (useMock) {
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

  const snapshots: EtaSnapshot[] = []
  let virtualPlateCounter = 1

  // 1. 分類與整理各公車、各車牌之觀測值
  // 結構：busNumber -> plateKey -> 觀測值列表
  const busGroupMap = new Map<string, Map<string, Array<{ index: number; eta: number; rawDir: Direction }>>>()

  for (const row of rows) {
    const busNumber = row.RouteName?.Zh_tw
    const stopName = row.StopName?.Zh_tw
    if (!busNumber || !stopName || !appSettings.busNumbers.includes(busNumber)) {
      continue
    }

    const normStopName = normalizeStopName(stopName)
    if (!normStopName) {
      continue
    }

    const etaMinute = toMinute(row.EstimateTime)
    if (etaMinute === null) {
      continue
    }

    const rawDir: Direction = row.Direction === 1 ? 'inbound' : 'outbound'
    const plate = row.PlateNumb?.trim()
    const isRealPlate = plate && plate !== '' && plate !== 'no-plate'
    const plateKey = isRealPlate ? plate : 'no-plate'

    const stationIdx = appSettings.stationNames.indexOf(normStopName)
    if (stationIdx === -1) {
      continue
    }

    if (!busGroupMap.has(busNumber)) {
      busGroupMap.set(busNumber, new Map())
    }
    const plateMap = busGroupMap.get(busNumber)!
    if (!plateMap.has(plateKey)) {
      plateMap.set(plateKey, [])
    }
    plateMap.get(plateKey)!.push({ index: stationIdx, eta: etaMinute, rawDir })
  }

  // 2. 定義候選車輛介面與物理規律驗證演算法
  interface Candidate {
    etas: Record<number, number> // index -> eta
    rawDirectionFallback: Direction
  }

  // 根據候選車輛包含的站點 ETA 物理遞增規律進行客觀方向投票，不信任或依賴 TDX 的 Direction
  function getCandidateDirection(c: Candidate): Direction {
    const indices = Object.keys(c.etas).map(Number).sort((a, b) => a - b)
    if (indices.length < 2) {
      return c.rawDirectionFallback
    }

    let outboundVotes = 0
    let inboundVotes = 0
    for (let i = 0; i < indices.length; i++) {
      const idxA = indices[i]
      const etaA = c.etas[idxA]
      for (let j = i + 1; j < indices.length; j++) {
        const idxB = indices[j]
        const etaB = c.etas[idxB]
        if (etaA < etaB) {
          outboundVotes++
        } else if (etaA > etaB) {
          inboundVotes++
        }
      }
    }

    if (outboundVotes > inboundVotes) {
      return 'outbound'
    } else if (inboundVotes > outboundVotes) {
      return 'inbound'
    }

    return c.rawDirectionFallback
  }

  // 驗證是否能將某個站點 ETA 歸類到既有的候選車輛中
  function canAddToCandidate(c: Candidate, newIdx: number, newEta: number): boolean {
    if (c.etas[newIdx] !== undefined) {
      return false
    }

    const existingIndices = Object.keys(c.etas).map(Number)
    if (existingIndices.length === 0) {
      return true
    }

    const tempEtas = { ...c.etas, [newIdx]: newEta }

    // 如果該候選車輛已有 2 個或以上的觀測值，則其行駛方向已固定
    // 否則，只要其在去程或回程的任何一種物理規律下成立即可
    const directionsToTest: Direction[] = existingIndices.length >= 2
      ? [getCandidateDirection(c)]
      : ['outbound', 'inbound']

    for (const dir of directionsToTest) {
      const travelIndices = Object.keys(tempEtas).map(Number)
      if (dir === 'outbound') {
        travelIndices.sort((a, b) => a - b)
      } else {
        travelIndices.sort((a, b) => b - a)
      }

      let dirValid = true
      for (let i = 0; i < travelIndices.length - 1; i++) {
        const idxA = travelIndices[i]
        const idxB = travelIndices[i + 1]
        const etaA = tempEtas[idxA]
        const etaB = tempEtas[idxB]

        const distance = Math.abs(idxB - idxA)
        const gap = etaB - etaA

        // 物理規律限制：平均每站行車時間在 -2 分鐘（Traffic Update / 誤差）到 6 分鐘之間
        if (gap < -2 * distance || gap > 6 * distance) {
          dirValid = false
          break
        }
      }

      if (dirValid) {
        return true
      }
    }

    return false
  }

  // 3. 循著物理連續性進行公車分拆
  for (const [busNumber, plateMap] of busGroupMap.entries()) {
    for (const [plateKey, obsList] of plateMap.entries()) {
      // 依 ETA 從小到大排序，由最靠近當前物理位置的觀測值開始處理
      obsList.sort((a, b) => a.eta - b.eta)

      const candidates: Candidate[] = []

      for (const obs of obsList) {
        let added = false
        for (const c of candidates) {
          if (canAddToCandidate(c, obs.index, obs.eta)) {
            c.etas[obs.index] = obs.eta
            added = true
            break
          }
        }

        if (!added) {
          candidates.push({
            etas: { [obs.index]: obs.eta },
            rawDirectionFallback: obs.rawDir,
          })
        }
      }

      // 將分割、驗證後的物理車輛加入 Snapshot 列表中
      for (const c of candidates) {
        const dir = getCandidateDirection(c)
        const plateNumb = plateKey === 'no-plate'
          ? `no-plate-${dir}-${virtualPlateCounter++}`
          : plateKey

        const etaByStop: Record<string, number | null> = {}
        for (const stopName of appSettings.stationNames) {
          etaByStop[stopName] = null
        }

        for (const [idxStr, eta] of Object.entries(c.etas)) {
          const idx = parseInt(idxStr, 10)
          const stopName = appSettings.stationNames[idx]
          if (stopName) {
            etaByStop[stopName] = eta
          }
        }

        snapshots.push({
          busNumber,
          direction: dir,
          plateNumb,
          etaByStop,
        })
      }
    }
  }

  return snapshots
}
