const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  MAP_FILTER_STORAGE_KEY,
  PLACE_CONTEXT_STORAGE_KEY,
  normalizePlaceContext,
  readStoredMapFilter,
  writeStoredMapFilter,
  readStoredPlaceContext,
  writeStoredPlaceContext,
} = require('../utils/discovery-context.js')
const { mergeUniquePoems } = require('../utils/poem-list.js')

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

function memoryStorage() {
  const values = {}
  return {
    values,
    getStorageSync: (key) => values[key],
    setStorageSync: (key, value) => { values[key] = value },
  }
}

test('map dynasty filter survives navigation without storing location', () => {
  const storage = memoryStorage()
  assert.strictEqual(writeStoredMapFilter(storage, { selectedDynasty: '唐', longitude: 120 }), true)
  assert.deepStrictEqual(readStoredMapFilter(storage), { selectedDynasty: '唐' })
  assert.deepStrictEqual(storage.values[MAP_FILTER_STORAGE_KEY], { selectedDynasty: '唐' })
})

test('place context is scoped, bounded and restorable', () => {
  const storage = memoryStorage()
  assert.strictEqual(writeStoredPlaceContext(storage, {
    placeId: 'hangzhou', selectedDynasty: '宋', scrollTop: 830.4, loadedCount: 999,
  }), true)
  assert.deepStrictEqual(storage.values[PLACE_CONTEXT_STORAGE_KEY], {
    placeId: 'hangzhou', selectedDynasty: '宋', scrollTop: 830, loadedCount: 200,
  })
  assert.deepStrictEqual(readStoredPlaceContext(storage, 'hangzhou'), storage.values[PLACE_CONTEXT_STORAGE_KEY])
  assert.strictEqual(readStoredPlaceContext(storage, 'xian'), null)
  assert.strictEqual(normalizePlaceContext({}), null)
})

test('database poems replace hot previews without duplicate cards', () => {
  const preview = {
    canonical_id: 'poem_1', title: '钱塘湖春行', author: '白居易', content: '孤山寺北…', isPreview: true,
  }
  const canonical = {
    _id: 'poem_1', canonical_id: 'poem_1', title: '钱塘湖春行', author: '白居易', content: '全诗', isPreview: false,
  }
  const poems = mergeUniquePoems([preview], [canonical, canonical])
  assert.strictEqual(poems.length, 1)
  assert.strictEqual(poems[0].content, '全诗')
  assert.strictEqual(poems[0].isPreview, false)
})

test('map and place pages expose loading, error, empty and retry states', () => {
  const root = path.join(__dirname, '..')
  const map = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  const place = fs.readFileSync(path.join(root, 'pages-sub/info/place/place.wxml'), 'utf8')
  assert.ok(map.includes('onRetryMarkers'))
  assert.ok(map.includes('onClearMapFilter'))
  assert.ok(place.includes('onRetryPlace'))
  assert.ok(place.includes('onRetryPoems'))
  assert.ok(place.includes('暂未收录相关诗词'))
})

if (failed) process.exitCode = 1
