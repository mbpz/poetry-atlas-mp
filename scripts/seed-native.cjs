/**
 * 将 seed.json 写入 CloudBase 原生 NoSQL 集合（wx.cloud.database() 可读）
 *
 * 工具链（MCP 原生 NoSQL，非数据模型）：
 *   - writeNoSqlDatabaseStructure(action=createCollection)  已在之前步骤创建集合
 *   - writeNoSqlDatabaseContent(action=insert)             批量写入文档
 *
 * 用法：node scripts/seed-native.cjs
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const seed = require('../cloudfunctions/initData/seed.json')

function mcporterCall(tool, params) {
  return spawnSync(
    'npx',
    ['mcporter', 'call', tool, '--args', JSON.stringify(params), '--output', 'json'],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], timeout: 120000 }
  )
}

function insertCollection(name, docs) {
  // writeNoSqlDatabaseContent 一次写入全部
  const res = mcporterCall('cloudbase.writeNoSqlDatabaseContent', {
    action: 'insert',
    collectionName: name,
    documents: docs,
  })
  let outcome = {}
  try {
    outcome = JSON.parse(res.stdout)
  } catch (e) {
    console.error(`[${name}] 响应解析失败:`, res.stdout.slice(0, 300))
    return
  }
  const ok = outcome.success !== false && !outcome.error
  console.log(
    `[${name}] ${ok ? '✓' : '✗'} ${docs.length} 条` +
      (outcome.data && outcome.data.insertedCount != null ? ` (inserted ${outcome.data.insertedCount})` : '') +
      (outcome.message && !ok ? ` — ${outcome.message}` : '') +
      (outcome.error ? ` — ERROR: ${outcome.error}` : '')
  )
  if (!ok) console.error('  ', JSON.stringify(outcome).slice(0, 400))
}

console.log('\n[seed-native] === 写入原生 NoSQL 集合 ===')
insertCollection('places', seed.places)
insertCollection('poems', seed.poems)
insertCollection('authors', seed.authors)
insertCollection('dynasties', seed.dynasties)
console.log('\n[seed-native] === 完成 ===')
