/**
 * 批量下发 NoSQL 集合安全规则（与当前产品定位一致）
 *
 *  - 公开读 + 本人写：recitations（预设朗诵资源）
 *  - 本人读写：users / routes / favorites
 *  - 客户端全拒：tts_cache（仅云函数读写）
 *
 * 原因：mcporter CLI 会把 securityRule JSON 解析为对象而非字符串，
 * 导致云端报 "Expected string, received object"，故用 spawnSync + --args 保留字符串类型。
 *
 * 用法：node scripts/set-launch-permissions.cjs
 */
const { spawnSync } = require('child_process')

const ENV_ID = 'online-d2gyjoohe58cc4936'

function mcporterCall(params) {
  const args = ['call', 'cloudbase.managePermissions', '--args', JSON.stringify(params), '--output', 'json']
  return spawnSync('npx', ['mcporter', ...args], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] })
}

function apply(resourceId, securityRule) {
  const res = mcporterCall({
    action: 'updateResourcePermission',
    envId: ENV_ID,
    resourceType: 'noSqlDatabase',
    resourceId,
    permission: 'CUSTOM',
    securityRule,
  })
  let ok = false
  try {
    const d = JSON.parse(res.stdout)
    ok = !!d.success
  } catch (e) {
    ok = false
  }
  const tag = ok ? '✅' : '❌'
  console.log(`  [${resourceId}] ${tag}`)
  if (!ok) {
    const msg = (res.stderr || res.stdout || '').slice(0, 200)
    if (msg) console.log('        ', msg)
  }
  return ok
}

const PUBLIC_READ_RULE = JSON.stringify({
  read: 'true',
  create: 'auth.openid != null',
  update: 'doc._openid == auth.openid',
  delete: 'doc._openid == auth.openid',
})

const OWNER_ONLY_RULE = JSON.stringify({
  read: 'doc._openid == auth.openid',
  create: 'doc._openid == auth.openid',
  update: 'doc._openid == auth.openid',
  delete: 'doc._openid == auth.openid',
})

const DENY_ALL_RULE = JSON.stringify({
  read: 'false',
  create: 'false',
  update: 'false',
  delete: 'false',
})

let ok = 0
const total = 5

console.log('公开读 + 本人写:')
if (apply('recitations', PUBLIC_READ_RULE)) ok++

console.log('本人读写:')
for (const col of ['users', 'routes', 'favorites']) {
  if (apply(col, OWNER_ONLY_RULE)) ok++
}

console.log('客户端拒绝（仅云函数）:')
if (apply('tts_cache', DENY_ALL_RULE)) ok++

console.log(`\nRESULT: ok=${ok} fail=${total - ok}`)
process.exit(ok === total ? 0 : 1)
