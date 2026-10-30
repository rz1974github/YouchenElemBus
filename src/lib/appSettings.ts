import appSettingsJson from '../data/appsettings.json'
import type { AppSettings, Trip } from '../types'

function assertSettings(settings: AppSettings): AppSettings {
  if (settings.thresholdMinutes <= 0) {
    throw new Error('thresholdMinutes must be > 0')
  }

  if (settings.pollingIntervalSeconds <= 0) {
    throw new Error('pollingIntervalSeconds must be > 0')
  }

  if (settings.busNumbers.length === 0 || settings.stationNames.length < 2) {
    throw new Error('busNumbers and stationNames must be configured')
  }

  for (const trip of ['toWork', 'toHome'] as const) {
    if (!settings.stationNames.includes(settings.trips[trip].boardingStop)) {
      throw new Error(`trips.${trip}.boardingStop must be one of stationNames`)
    }
  }

  return settings
}

const BUS_NUMBERS_KEY = 'yuchen-bus-numbers'

export const defaultBusNumbers: string[] = appSettingsJson.busNumbers

// 使用者在環境設定編輯過的路線名單，存在 localStorage，蓋過設定檔
function readStoredBusNumbers(): string[] | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(BUS_NUMBERS_KEY) ?? 'null')
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((n) => typeof n === 'string')) {
      return parsed
    }
  } catch {
    // 讀不到就用設定檔
  }
  return null
}

// 與設定檔相同時清掉，之後設定檔改了才會跟著生效
export function saveBusNumbers(busNumbers: string[]): void {
  const sameAsDefault =
    busNumbers.length === defaultBusNumbers.length && busNumbers.every((n, i) => n === defaultBusNumbers[i])
  if (sameAsDefault) {
    window.localStorage.removeItem(BUS_NUMBERS_KEY)
  } else {
    window.localStorage.setItem(BUS_NUMBERS_KEY, JSON.stringify(busNumbers))
  }
}

// 以空白、逗號、頓號分隔，去重
export function parseBusNumbers(text: string): string[] {
  return [...new Set(text.split(/[\s,，、]+/).filter(Boolean))]
}

export const appSettings = assertSettings({
  ...(appSettingsJson as AppSettings),
  busNumbers: readStoredBusNumbers() ?? defaultBusNumbers,
})

// 該趟次依行駛順序排列的站名
export function getTripStops(trip: Trip): string[] {
  return trip === 'toWork' ? appSettings.stationNames : [...appSettings.stationNames].reverse()
}

// stationNames 的索引 → 該趟次行駛順序的索引
export function toTripIndex(trip: Trip, stationIdx: number): number {
  return trip === 'toWork' ? stationIdx : appSettings.stationNames.length - 1 - stationIdx
}
