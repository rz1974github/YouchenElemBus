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

export const appSettings = assertSettings(appSettingsJson as AppSettings)

// 該趟次依行駛順序排列的站名
export function getTripStops(trip: Trip): string[] {
  return trip === 'toWork' ? appSettings.stationNames : [...appSettings.stationNames].reverse()
}

// stationNames 的索引 → 該趟次行駛順序的索引
export function toTripIndex(trip: Trip, stationIdx: number): number {
  return trip === 'toWork' ? stationIdx : appSettings.stationNames.length - 1 - stationIdx
}
