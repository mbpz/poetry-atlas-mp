/**
 * 上线前批量下发 8 个集合的安全规则
 *  - 公开读+本人写：routes / recitations / posts / comments / likes / follows / quiz_questions
 *  - 本人读写：users
 *
 * 原因同 set-favorites-permission.cjs：mcporter CLI 会把 securityRule JSON 解析为对象而非字符串，
 * 导致云端报 "Expected string, received object"，故统一用 spawnSync + --args <json-string> 保留字符串类型。
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
    securityRule, // 字符串，JSON.stringify 会保留引号
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
  create: 'auth.openid != null',
  update: 'doc._openid == auth.openid',
  delete: 'doc._openid == auth.openid',
})

let ok = 0
const total = 8

console.log('公开读 + 本人写:')
for (const col of ['routes', 'recitations', 'posts', 'comments', 'likes', 'follows', 'quiz_questions']) {
  if (apply(col, PUBLIC_READ_RULE)) ok++
}

console.log('本人读写:')
if (apply('users', OWNER_ONLY_RULE)) ok++

console.log(`\nRESULT: ok=${ok} fail=${total - ok}`)
process.exit(ok === total ? 0 : 1)
