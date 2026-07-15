const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  MAP_VIEW_STORAGE_KEY,
  CITY_CENTERS,
  normalizeMapView,
  readStoredMapView,
  writeStoredMapView,
} = require('../utils/map-view.js')

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

test('quantizes a map view and clamps scale', () => {
  assert.deepStrictEqual(
    normalizeMapView({ longitude: 121.473701, latitude: 31.230416, scale: 22 }, { minScale: 3, maxScale: 18 }),
    { longitude: 121.47, latitude: 31.23, scale: 18 }
  )
})

test('rejects invalid or out-of-range views', () => {
  assert.strictEqual(normalizeMapView({ longitude: 181, latitude: 31, scale: 8 }), null)
  assert.strictEqual(normalizeMapView({ longitude: 121, latitude: 'bad', scale: 8 }), null)
})

test('manual city centers are unique and valid GCJ-02 map inputs', () => {
  assert.ok(CITY_CENTERS.length >= 10)
  assert.strictEqual(new Set(CITY_CENTERS.map((city) => city.id)).size, CITY_CENTERS.length)
  CITY_CENTERS.forEach((city) => {
    assert.ok(normalizeMapView(city, { minScale: 3, maxScale: 18 }))
  })
})

test('stores only a quantized local map view and tolerates storage failures', () => {
  const values = {}
  const storage = {
    getStorageSync: (key) => values[key],
    setStorageSync: (key, value) => { values[key] = value },
  }
  assert.strictEqual(writeStoredMapView(storage, { longitude: 116.4074, latitude: 39.9042, scale: 9.6 }), true)
  assert.deepStrictEqual(values[MAP_VIEW_STORAGE_KEY], { longitude: 116.41, latitude: 39.90, scale: 10 })
  assert.deepStrictEqual(readStoredMapView(storage), values[MAP_VIEW_STORAGE_KEY])
  assert.strictEqual(writeStoredMapView({ setStorageSync: () => { throw new Error('quota') } }, { longitude: 116, latitude: 39, scale: 9 }), false)
})

test('fallback panel exposes retry, manual city and nationwide actions', () => {
  const root = path.join(__dirname, '..')
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.ok(wxml.includes('重试定位'))
  assert.ok(wxml.includes('手动选择城市'))
  assert.ok(wxml.includes('浏览全国地图'))
})

if (failed) process.exitCode = 1
