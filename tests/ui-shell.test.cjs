const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { TAB_DEFS } = require('../custom-tab-bar/tabs.js')

const root = path.join(__dirname, '..')
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

test('custom tab definitions match all app.json tab routes', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const appRoutes = app.tabBar.list.map((tab) => '/' + tab.pagePath)
  assert.strictEqual(TAB_DEFS.length, 5)
  assert.deepStrictEqual(TAB_DEFS.map((tab) => tab.url), appRoutes)
  assert.deepStrictEqual(TAB_DEFS.map((tab) => tab.label), ['地图', '发现', '朝代', '收藏', '我的'])
})

test('cover-view tab slots use deterministic 150rpx widths', () => {
  const wxss = fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxss'), 'utf8')
  assert.match(wxss, /\.tab-nav\s*\{[^}]*width:\s*750rpx/s)
  assert.match(wxss, /\.tab-item\s*\{[^}]*width:\s*150rpx/s)
  assert.match(wxss, /\.tab-item\s*\{[^}]*flex-shrink:\s*0/s)
  assert.match(wxss, /height:\s*calc\(112rpx \+ env\(safe-area-inset-bottom\)\)/)
})

test('dynasty filter hides the right tool group while expanded', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
  assert.match(wxml, /wx:if="\{\{!showDynastyBar\}\}" class="top-right"/)
  assert.match(wxss, /\.dynasty-chips\s*\{[^}]*right:\s*24rpx/s)
})

test('tab items expose accessibility labels and no duplicate search FAB', () => {
  const wxml = fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxml'), 'utf8')
  assert.ok(wxml.includes('aria-label="{{item.label}}"'))
  assert.strictEqual(wxml.includes('search-fab'), false)
})

test('all five tab pages synchronize through the safe tab helper', () => {
  const files = ['index', 'search', 'dynasty', 'favorites', 'profile']
  files.forEach((name) => {
    const source = fs.readFileSync(path.join(root, `pages/${name}/${name}.js`), 'utf8')
    assert.ok(source.includes('syncTabBar'))
  })
})

test('navigation-facing WXML uses local assets instead of emoji icons', () => {
  const files = [
    'pages/search/search.wxml',
    'pages/favorites/favorites.wxml',
    'pages/profile/profile.wxml',
    'pages-sub/routes/list/list.wxml',
  ]
  files.forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /🔒|🗺|🎧|🔍|📭/u)
  })
  assert.ok(fs.existsSync(path.join(root, 'tab-bar-icons/audio.svg')))
})

if (failed) process.exitCode = 1
