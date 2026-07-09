/**
 * 验证迁移结果：通过 login 云函数（已部署）或直接查询。
 * 由于 writeNoSqlDatabaseContent 不支持 get，这里用云函数 verifyData 查询。
 * 先部署 verifyData 云函数，再调用。
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const FUNC_DIR = path.join(__dirname, '..', 'cloudfunctions', 'verifyData')
fs.mkdirSync(FUNC_DIR, { recursive: true })

// 写验证云函数
fs.writeFileSync(path.join(FUNC_DIR, 'index.js'), `
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
exports.main = async () => {
  const counts = {}
  for (const col of ['places','poems','authors','dynasties','favorites','imagery_network']) {
    const r = await db.collection(col).count()
    counts[col] = r.total
  }
  const hangzhou = await db.collection('places').doc('hangzhou').get()
  const suShi   = await db.collection('authors').where({ name: '苏轼' }).limit(1).get()
  const libai   = await db.collection('poems').where({ author: '李白' }).limit(3).get()
  return {
    counts,
    hangzhou: hangzhou.data || null,
    suShi: suShi.data[0] || null,
    libaiPoems: libai.data || [],
  }
}
`)
fs.writeFileSync(path.join(FUNC_DIR, 'config.json'), JSON.stringify({ permissions: {openapi:[]} }, null, 2))
fs.writeFileSync(path.join(FUNC_DIR, 'package.json'), JSON.stringify({
  name: 'verifyData', version: '1.0.0', main: 'index.js',
  dependencies: { 'wx-server-sdk': '~2.6.3' },
}, null, 2))

console.log('[verify] 已生成 cloudfunctions/verifyData/')
console.log('[verify] 请通过 MCP 部署后调用，或在微信开发者工具右键上传部署')
