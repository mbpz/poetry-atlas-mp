const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  SEARCH_STATE_STORAGE_KEY,
  normalizeSearchState,
  readStoredSearchState,
  writeStoredSearchState,
} = require('../utils/search-state.js')

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

test('search state normalizes query, tab and scroll context', () => {
  assert.deepStrictEqual(normalizeSearchState({ keyword: '  李白  ', activeTab: 'author', scrollTop: 93.6 }), {
    keyword: '李白', activeTab: 'author', scrollTop: 94,
  })
  assert.deepStrictEqual(normalizeSearchState({ activeTab: 'invalid', scrollTop: -10 }), {
    keyword: '', activeTab: 'all', scrollTop: 0,
  })
})

test('search context survives detail navigation and tolerates storage failures', () => {
  const values = {}
  const storage = {
    getStorageSync: (key) => values[key],
    setStorageSync: (key, value) => { values[key] = value },
  }
  assert.strictEqual(writeStoredSearchState(storage, { keyword: '西湖', activeTab: 'place', scrollTop: 500 }), true)
  assert.deepStrictEqual(readStoredSearchState(storage), values[SEARCH_STATE_STORAGE_KEY])
  assert.strictEqual(writeStoredSearchState({ setStorageSync: () => { throw new Error('quota') } }, {}), false)
})

test('search and poem pages expose durable errors, metadata and guarded favorites', () => {
  const root = path.join(__dirname, '..')
  const searchJs = fs.readFileSync(path.join(root, 'pages/search/search.js'), 'utf8')
  const searchWxml = fs.readFileSync(path.join(root, 'pages/search/search.wxml'), 'utf8')
  const poemJs = fs.readFileSync(path.join(root, 'pages-sub/info/poem/poem.js'), 'utf8')
  const poemWxml = fs.readFileSync(path.join(root, 'pages-sub/info/poem/poem.wxml'), 'utf8')

  assert.ok(searchJs.includes('_searchRequestId'))
  assert.ok(searchWxml.includes('onRetrySearch'))
  assert.ok(poemJs.includes('favoriteBusy'))
  assert.ok(!/data:\s*\{\s*_openid\s*:/.test(poemJs))
  assert.ok(poemWxml.includes('poem.source_name'))
  assert.ok(poemWxml.includes('onTapAuthor'))
  assert.ok(poemWxml.includes('onRetryFavorite'))
})

if (failed) process.exitCode = 1
