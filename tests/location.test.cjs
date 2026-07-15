const assert = require('assert')
const {
  LOCATION_FAILURE,
  readLocationSettings,
  classifyLocationPrerequisite,
  classifyLocationFailure,
  buildLocationDiagnostic,
} = require('../utils/location.js')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log('ok - ' + name)
  } catch (err) {
    failed += 1
    console.error('not ok - ' + name)
    console.error(err.stack || err)
  }
}

test('reads modern system and app authorization settings', () => {
  const state = readLocationSettings({
    getSystemSetting: () => ({ locationEnabled: false }),
    getAppAuthorizeSetting: () => ({ locationAuthorized: 'denied', locationReducedAccuracy: false }),
    getSystemInfoSync: () => ({ platform: 'android', brand: 'Xiaomi', SDKVersion: '3.5.0' }),
  }, { 'scope.userLocation': true })
  assert.strictEqual(state.systemLocationEnabled, false)
  assert.strictEqual(state.appLocationAuthorized, 'denied')
  assert.strictEqual(state.platform, 'android')
})

test('mini program denial takes precedence', () => {
  const result = classifyLocationPrerequisite({
    miniProgramAuthorized: false,
    systemLocationEnabled: false,
    appLocationAuthorized: 'denied',
  })
  assert.strictEqual(result.kind, LOCATION_FAILURE.MINI_PROGRAM_DENIED)
  assert.strictEqual(result.action, 'open-mini-setting')
})

test('detects disabled system location', () => {
  const result = classifyLocationPrerequisite({
    miniProgramAuthorized: true,
    systemLocationEnabled: false,
    appLocationAuthorized: 'authorized',
  })
  assert.strictEqual(result.kind, LOCATION_FAILURE.SYSTEM_DISABLED)
})

test('detects denied WeChat app permission', () => {
  const result = classifyLocationPrerequisite({
    miniProgramAuthorized: true,
    systemLocationEnabled: true,
    appLocationAuthorized: 'denied',
  })
  assert.strictEqual(result.kind, LOCATION_FAILURE.APP_DENIED)
  assert.strictEqual(result.action, 'open-app-setting')
})

test('classifies timeout and Android precision failures', () => {
  const normal = { miniProgramAuthorized: true, systemLocationEnabled: true, appLocationAuthorized: 'authorized' }
  assert.strictEqual(
    classifyLocationFailure({ errMsg: 'getLocation:fail timeout' }, normal).kind,
    LOCATION_FAILURE.TIMEOUT
  )
  assert.strictEqual(
    classifyLocationFailure({ errMsg: 'getLocation:fail precise location disabled by ROM' }, normal).kind,
    LOCATION_FAILURE.PRECISION_OR_ROM
  )
})

test('diagnostic excludes coordinates and keeps stable device context', () => {
  const data = buildLocationDiagnostic(
    { errCode: 2, errMsg: 'getLocation:fail timeout', latitude: 31.2, longitude: 121.5 },
    { platform: 'android', brand: 'OPPO', model: 'demo', SDKVersion: '3.5.0' }
  )
  assert.strictEqual(data.kind, LOCATION_FAILURE.TIMEOUT)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'latitude'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'longitude'), false)
})

if (failed) process.exitCode = 1
