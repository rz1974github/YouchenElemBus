import appSettingsJson from '../data/appsettings.json'
import type { AppSettings } from '../types'

function assertSettings(settings: AppSettings): AppSettings {
  if (settings.timeThresholdMinutes <= 0) {
    throw new Error('timeThresholdMinutes must be > 0')
  }

  if (settings.pollingIntervalSeconds <= 0) {
    throw new Error('pollingIntervalSeconds must be > 0')
  }

  if (settings.busNumbers.length === 0 || settings.stationNames.length < 2) {
    throw new Error('busNumbers and stationNames must be configured')
  }

  return settings
}

export const appSettings = assertSettings(appSettingsJson as AppSettings)
