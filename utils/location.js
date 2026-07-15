/**
 * 定位状态归类。
 *
 * 优先使用微信公开的系统/APP/小程序授权状态，errMsg 只用于补充判断
 * Android ROM、超时和网络等无法由同步设置直接表达的失败。
 */
const LOCATION_FAILURE = {
  MINI_PROGRAM_DENIED: 'mini-program-denied',
  APP_DENIED: 'app-denied',
  SYSTEM_DISABLED: 'system-disabled',
  REDUCED_ACCURACY: 'reduced-accuracy',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  PRECISION_OR_ROM: 'precision-or-rom',
  UNKNOWN: 'unknown',
}

function safeCall(fn, fallback) {
  try {
    return typeof fn === 'function' ? (fn() || fallback) : fallback
  } catch (e) {
    return fallback
  }
}

function readLocationSettings(wxApi, authSetting) {
  const api = wxApi || {}
  const system = safeCall(api.getSystemSetting && api.getSystemSetting.bind(api), {})
  const app = safeCall(api.getAppAuthorizeSetting && api.getAppAuthorizeSetting.bind(api), {})
  const legacy = safeCall(api.getSystemInfoSync && api.getSystemInfoSync.bind(api), {})
  const miniAuth = authSetting || {}

  return {
    miniProgramAuthorized: miniAuth['scope.userLocation'],
    systemLocationEnabled: typeof system.locationEnabled === 'boolean'
      ? system.locationEnabled
      : legacy.locationEnabled,
    appLocationAuthorized: app.locationAuthorized !== undefined
      ? app.locationAuthorized
      : legacy.locationAuthorized,
    locationReducedAccuracy: typeof app.locationReducedAccuracy === 'boolean'
      ? app.locationReducedAccuracy
      : !!legacy.locationReducedAccuracy,
    platform: legacy.platform || '',
    brand: legacy.brand || '',
    model: legacy.model || '',
    SDKVersion: legacy.SDKVersion || '',
  }
}

function failure(kind, overrides) {
  const base = {
    kind,
    title: '暂时无法定位',
    message: '当前未能获取位置，你仍可拖动地图继续浏览。',
    action: 'retry',
    confirmText: '重试',
  }
  return Object.assign(base, overrides || {})
}

function classifyLocationPrerequisite(settings) {
  const state = settings || {}
  if (state.miniProgramAuthorized === false) {
    return failure(LOCATION_FAILURE.MINI_PROGRAM_DENIED, {
      title: '需要小程序定位权限',
      message: '请在小程序设置中允许使用位置信息。不开启也可以继续浏览全国诗词地图。',
      action: 'open-mini-setting',
      confirmText: '去设置',
    })
  }
  if (state.systemLocationEnabled === false) {
    return failure(LOCATION_FAILURE.SYSTEM_DISABLED, {
      title: '系统定位未开启',
      message: '请先开启手机系统定位服务，再返回重试。不开启也可以继续浏览地图。',
      action: 'retry',
      confirmText: '已开启，重试',
    })
  }
  if (state.appLocationAuthorized === 'denied' || state.appLocationAuthorized === false) {
    return failure(LOCATION_FAILURE.APP_DENIED, {
      title: '微信定位权限未开启',
      message: '请在系统设置中允许微信使用位置信息，再返回重试。',
      action: 'open-app-setting',
      confirmText: '打开系统设置',
    })
  }
  return null
}

function classifyLocationFailure(error, settings) {
  const prerequisite = classifyLocationPrerequisite(settings)
  if (prerequisite) return prerequisite

  const state = settings || {}
  const err = error || {}
  const message = String(err.errMsg || err.message || '').toLowerCase()

  if (/scope\.userlocation|auth deny|authorize denied|permission denied/.test(message)) {
    return failure(LOCATION_FAILURE.MINI_PROGRAM_DENIED, {
      title: '需要小程序定位权限',
      message: '请在小程序设置中允许使用位置信息。不开启也可以继续浏览全国诗词地图。',
      action: 'open-mini-setting',
      confirmText: '去设置',
    })
  }
  if (/gps|location service|system location|service unavailable/.test(message)) {
    return failure(LOCATION_FAILURE.SYSTEM_DISABLED, {
      title: '系统定位不可用',
      message: '请检查手机系统定位服务及微信定位权限，然后返回重试。',
      action: 'retry',
      confirmText: '重试',
    })
  }
  if (/timeout|timed out/.test(message)) {
    return failure(LOCATION_FAILURE.TIMEOUT, {
      title: '定位响应超时',
      message: '当前定位响应较慢，请移动到网络良好的位置后重试。',
    })
  }
  if (/network|net unavailable|connection/.test(message)) {
    return failure(LOCATION_FAILURE.NETWORK, {
      title: '网络暂不可用',
      message: '请检查网络连接后重试，或先拖动地图浏览。',
    })
  }
  if (state.locationReducedAccuracy || /accuracy|precise|fuzzy|mock|rom/.test(message)) {
    return failure(LOCATION_FAILURE.PRECISION_OR_ROM, {
      title: '定位精度受限',
      message: '请在系统设置中为微信开启精确定位；部分 Android 手机还需允许后台或省电模式下定位。',
      action: 'open-app-setting',
      confirmText: '打开系统设置',
    })
  }
  return failure(LOCATION_FAILURE.UNKNOWN)
}

function buildLocationDiagnostic(error, settings) {
  const err = error || {}
  const state = settings || {}
  return {
    stage: 'getLocation',
    kind: classifyLocationFailure(err, state).kind,
    errCode: err.errCode !== undefined ? err.errCode : err.errno,
    errMsg: String(err.errMsg || err.message || ''),
    platform: state.platform || '',
    brand: state.brand || '',
    model: state.model || '',
    SDKVersion: state.SDKVersion || '',
  }
}

module.exports = {
  LOCATION_FAILURE,
  readLocationSettings,
  classifyLocationPrerequisite,
  classifyLocationFailure,
  buildLocationDiagnostic,
}
