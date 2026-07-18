const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { ensureOpenId } = require('../utils/user-session.js')

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('openid readiness coalesces concurrent login cloud calls', async () => {
  const app = { globalData: {} }
  let calls = 0
  global.getApp = () => app
  global.wx = {
    cloud: {
      callFunction: async () => {
        calls += 1
        return { result: { openid: 'openid-1', user: { nickname: '测试' } } }
      },
    },
  }
  const [first, second] = await Promise.all([ensureOpenId(), ensureOpenId()])
  assert.strictEqual(first, 'openid-1')
  assert.strictEqual(second, 'openid-1')
  assert.strictEqual(calls, 1)
  assert.strictEqual(app.globalData.user.nickname, '测试')
  assert.strictEqual(await ensureOpenId(), 'openid-1')
  assert.strictEqual(calls, 1)
})

test('startup login accepts the current App instance before getApp is ready', async () => {
  const app = { globalData: {} }
  global.getApp = () => undefined
  global.wx = {
    cloud: {
      callFunction: async () => ({ result: { openid: 'startup-openid', user: { nickname: '启动用户' } } }),
    },
  }

  const openid = await ensureOpenId(app)
  assert.strictEqual(openid, 'startup-openid')
  assert.strictEqual(app.globalData.openid, 'startup-openid')
  assert.strictEqual(app.globalData.user.nickname, '启动用户')
})

test('private route cloud function authenticates every action and strips owner fields', () => {
  const root = path.join(__dirname, '..')
  const routes = fs.readFileSync(path.join(root, 'cloudfunctions/routes/index.js'), 'utf8')
  assert.ok(routes.includes("if (!openid) return { ok: false, error: 'no openid' }"))
  assert.ok(routes.includes('request_id: requestId'))
  assert.ok(routes.includes(".where({ openid, request_id: requestId })"))
  assert.ok(routes.includes("_openid: false"))
  assert.ok(routes.includes("'stats.routes_count': total"))
  assert.ok(routes.includes('removed.stats.removed !== 1'))
  assert.ok(routes.includes('result.stats.updated !== 1'))
})

test('profile, favorites and routes expose rollback and retry states', () => {
  const root = path.join(__dirname, '..')
  const profile = fs.readFileSync(path.join(root, 'pages/profile/profile.js'), 'utf8')
  const favorites = fs.readFileSync(path.join(root, 'pages/favorites/favorites.js'), 'utf8')
  const routeList = fs.readFileSync(path.join(root, 'pages-sub/routes/list/list.js'), 'utf8')
  const routeCreate = fs.readFileSync(path.join(root, 'pages-sub/routes/create/create.js'), 'utf8')
  const travel = fs.readFileSync(path.join(root, 'pages-sub/info/travel/travel.js'), 'utf8')

  assert.ok(profile.includes('previousNickname'))
  assert.ok(profile.includes('previousAvatar'))
  assert.ok(!profile.includes('fallback to db'))
  assert.ok(favorites.includes('listError'))
  assert.ok(favorites.includes('removingId'))
  assert.ok(routeList.includes('deletingId'))
  assert.ok(routeList.includes('onRetryRoutes'))
  assert.ok(routeCreate.includes('request_id: this._requestId'))
  assert.ok(routeCreate.includes('输入内容已保留'))
  assert.ok(!travel.includes('fallback static'))
  assert.ok(travel.includes('onRetryRoute'))
})

test('login uses the canonical uppercase WeChat context fields', () => {
  const login = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions/login/index.js'), 'utf8')
  assert.ok(login.includes('wxContext.OPENID'))
  assert.ok(login.includes('wxContext.APPID'))
  assert.ok(login.includes('wxContext.UNIONID'))
})

test('standalone favorites permission is owner-only', () => {
  const permission = fs.readFileSync(path.join(__dirname, '..', 'scripts/set-favorites-permission.cjs'), 'utf8')
  assert.ok(permission.includes("read: 'doc._openid == auth.openid'"))
  assert.ok(permission.includes("create: 'doc._openid == auth.openid'"))
  assert.ok(!permission.includes("read: \"auth.loginType != 'ANONYMOUS'\""))
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try {
      await item.fn()
      console.log('ok - ' + item.name)
    } catch (err) {
      failed += 1
      console.error('not ok - ' + item.name)
      console.error(err.stack || err)
    }
  }
  if (failed) process.exitCode = 1
})()
