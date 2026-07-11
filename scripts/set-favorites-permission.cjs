/**
 * 设置 favorites 集合的 CUSTOM 安全规则（仅本人读写）
 * 原因：mcporter CLI 会把 securityRule 的 JSON 解析为对象而非字符串，
 *       导致云端报 "Expected string, received object"，故用脚本直接调用。
 *
 * 用法：node scripts/set-favorites-permission.cjs
 */
const { spawnSync } = require('child_process')

function mcporterCall(toolName, params) {
  // 注意：mcporter 会把 key={...} 的值解析为对象而非字符串，
  //       导致 securityRule 等字符串参数报 "Expected string, received object"。
  //       因此统一用 --args <json> 传入完整 payload，保留字符串类型。
  const args = ['call', toolName, '--args', JSON.stringify(params), '--output', 'json']
  const res = spawnSync('npx', ['mcporter', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  return res
}

const securityRule = JSON.stringify({
  read: "auth.loginType != 'ANONYMOUS'",
  create: "auth.loginType != 'ANONYMOUS'",
  update: 'doc._openid == auth.openid',
  delete: 'doc._openid == auth.openid',
})

console.log('securityRule payload:', securityRule)

const res = mcporterCall('cloudbase.managePermissions', {
  action: 'updateResourcePermission',
  resourceType: 'noSqlDatabase',
  resourceId: 'favorites',
  permission: 'CUSTOM',
  securityRule,
})

console.log('stdout:', res.stdout)
if (res.stderr) console.log('stderr:', res.stderr)
process.exit(res.status || 0)
