const assert = require('assert')
const { TAB_DEFS } = require('../custom-tab-bar/tabs.js')
const { switchTabSafely, syncTabBar } = require('../utils/tab-bar.js')

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

test('switches optimistically and clears navigation state on success', () => {
  let state = { active: 'map', navigating: false }
  let callbacks
  const started = switchTabSafely({
    tabs: TAB_DEFS,
    currentKey: state.active,
    targetKey: 'find',
    navigating: state.navigating,
    setState: (patch) => { state = Object.assign({}, state, patch) },
    wxApi: { switchTab: (options) => { callbacks = options } },
  })
  assert.strictEqual(started, true)
  assert.strictEqual(state.active, 'find')
  callbacks.complete()
  assert.deepStrictEqual(state, { active: 'find', navigating: false })
})

test('restores the previous tab when wx.switchTab fails', () => {
  let state = { active: 'map', navigating: false }
  let callbacks
  switchTabSafely({
    tabs: TAB_DEFS,
    currentKey: state.active,
    targetKey: 'fav',
    navigating: false,
    setState: (patch) => { state = Object.assign({}, state, patch) },
    wxApi: { switchTab: (options) => { callbacks = options } },
  })
  callbacks.fail({ errMsg: 'switchTab:fail' })
  callbacks.complete()
  assert.deepStrictEqual(state, { active: 'map', navigating: false })
})

test('ignores duplicate, unknown and concurrent tab requests', () => {
  const base = { tabs: TAB_DEFS, currentKey: 'map', setState: () => {}, wxApi: { switchTab: () => {} } }
  assert.strictEqual(switchTabSafely(Object.assign({}, base, { targetKey: 'map' })), false)
  assert.strictEqual(switchTabSafely(Object.assign({}, base, { targetKey: 'missing' })), false)
  assert.strictEqual(switchTabSafely(Object.assign({}, base, { targetKey: 'find', navigating: true })), false)
})

test('syncs active state from a page onShow hook', () => {
  let state
  const page = { getTabBar: () => ({ syncActive: (key) => { state = key } }) }
  assert.strictEqual(syncTabBar(page, 'dynasty'), true)
  assert.strictEqual(state, 'dynasty')
})

if (failed) process.exitCode = 1
