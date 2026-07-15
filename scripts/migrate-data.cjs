/**
 * 数据迁移脚本：原版 places.json → CloudBase NoSQL 6 集合
 *
 * 转换逻辑：
 *   places  : 原始地点 + GeoPoint + dynasty_stats + hot_poems(内嵌 Top5)
 *   poems   : 按 title+author 去重，places 数组记录关联地点
 *   authors : 从诗词聚合，含 poem_count 与代表作
 *   dynasties: 固定朝代列表（含起止年/排序）
 *   favorites / imagery_network : 留空（运行时写入）
 *
 * 用法：node scripts/migrate-data.cjs
 *       node scripts/migrate-data.cjs --dry-run   # 仅预览不写入
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const config = require('../config.js')
const {
  CorpusConflictError,
  sourceKey,
  buildCanonicalPoems,
} = require('./lib/canonical-poems.cjs')
const corpusConfig = require('../data/poem-overrides.json')

const DRY_RUN = process.argv.includes('--dry-run')
const DATA_FILE = path.join(__dirname, '..', 'data', 'places.json')

// ─── 朝代参考数据（与原版 DATABASE.md 一致） ───
const DYNASTY_REF = {
  先秦: { name_en: 'Pre-Qin', start_year: -1046, end_year: -221, capital: '—', sort_order: 1 },
  汉: { name_en: 'Han', start_year: -202, end_year: 220, capital: '长安/洛阳', sort_order: 2 },
  魏晋: { name_en: 'Wei-Jin', start_year: 220, end_year: 420, capital: '洛阳/建康', sort_order: 3 },
  南北朝: { name_en: 'N-S Dynasties', start_year: 420, end_year: 589, capital: '建康/洛阳', sort_order: 4 },
  隋: { name_en: 'Sui', start_year: 581, end_year: 618, capital: '大兴', sort_order: 5 },
  唐: { name_en: 'Tang', start_year: 618, end_year: 907, capital: '长安', sort_order: 6 },
  五代: { name_en: 'Five Dynasties', start_year: 907, end_year: 960, capital: '开封', sort_order: 7 },
  宋: { name_en: 'Song', start_year: 960, end_year: 1279, capital: '开封/临安', sort_order: 8 },
  元: { name_en: 'Yuan', start_year: 1271, end_year: 1368, capital: '大都', sort_order: 9 },
  明: { name_en: 'Ming', start_year: 1368, end_year: 1644, capital: '南京/北京', sort_order: 10 },
  清: { name_en: 'Qing', start_year: 1636, end_year: 1912, capital: '北京', sort_order: 11 },
  近现代: { name_en: 'Modern', start_year: 1912, end_year: 2024, capital: '北京', sort_order: 12 },
  当代: { name_en: 'Contemporary', start_year: 1949, end_year: 2024, capital: '北京', sort_order: 13 },
  晋: { name_en: 'Jin', start_year: 266, end_year: 420, capital: '洛阳', sort_order: 3 },
  三国: { name_en: 'Three Kingdoms', start_year: 220, end_year: 280, capital: '洛阳/成都/建业', sort_order: 2 },
  金: { name_en: 'Jin (Jurchen)', start_year: 1115, end_year: 1234, capital: '会宁/中都', sort_order: 9 },
}

// ─── 读取原始数据 ───
const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
console.log(`[migrate] 读取原始数据: ${raw.length} 个地点`)

// ─── 1. 构建规范诗词（冲突默认阻止导入） ───
let poems
try {
  poems = buildCanonicalPoems(raw, {
    dataVersion: process.env.POETRY_DATA_VERSION || corpusConfig.data_version,
    overrides: corpusConfig.overrides,
  })
} catch (err) {
  if (err instanceof CorpusConflictError) {
    console.error(`[migrate] 阻止导入：${err.message}`)
    err.conflicts.forEach((item) => console.error(`  - ${item.key}: ${item.type}`))
    console.error('[migrate] 请在 data/poem-overrides.json 中完成有来源的人工裁决')
    process.exit(1)
  }
  throw err
}
const canonicalByKey = new Map(poems.map((poem) => [sourceKey(poem), poem]))
console.log(`[migrate] 规范诗词: ${poems.length} 首`)

// ─── 2. 聚合作者 ───
const authorMap = new Map()
poems.forEach((poem) => {
  const name = poem.author
  if (!authorMap.has(name)) {
    authorMap.set(name, {
      name,
      dynasty: poem.dynasty,
      poem_count: 0,
      poems: [],
      route: [],
    })
  }
  const a = authorMap.get(name)
  a.poem_count += 1
  if (a.poems.length < 10) a.poems.push(poem.title)
})
const authors = [...authorMap.values()]
console.log(`[migrate] 聚合作者: ${authors.length} 人`)

// ─── 3. 构建地点（含 GeoPoint + dynasty_stats + hot_poems） ───
const dynastyStats = {}
const places = raw.map((place) => {
  const stats = {}
  const hotPoems = []
  ;(place.poems || []).forEach((poem) => {
    stats[poem.dynasty] = (stats[poem.dynasty] || 0) + 1
    dynastyStats[poem.dynasty] = (dynastyStats[poem.dynasty] || 0) + 1
    const canonical = canonicalByKey.get(sourceKey(poem))
    if (hotPoems.length < 5 && canonical) {
      hotPoems.push({
        canonical_id: canonical.canonical_id,
        title: canonical.title,
        author: canonical.author,
        dynasty: canonical.dynasty,
        excerpt: canonical.content.slice(0, 120),
        content_kind: canonical.content_kind,
        data_version: canonical.data_version,
      })
    }
  })
  return {
    _id: place.id,
    name: place.name,
    name_en: '',
    name_alias: [],
    type: place.type,
    location: {
      type: 'Point',
      coordinates: [parseFloat(place.lng), parseFloat(place.lat)],
    },
    modern_name: place.name,
    parent_id: '',
    region_path: '',
    poem_count: place.poems ? place.poems.length : 0,
    author_count: 0,
    dynasty_stats: stats,
    hot_poems: hotPoems,
    description: '',
    images: [],
  }
})
console.log(`[migrate] 构建地点: ${places.length} 个`)

// ─── 4. 构建朝代 ───
const dynasties = Object.entries(DYNASTY_REF)
  .filter(([name]) => dynastyStats[name]) // 仅包含有数据的朝代
  .map(([name, ref]) => ({
    _id: name,
    name,
    name_en: ref.name_en,
    start_year: ref.start_year,
    end_year: ref.end_year,
    capital: ref.capital,
    sort_order: ref.sort_order,
    description: '',
    poem_count: dynastyStats[name] || 0,
  }))
  .sort((a, b) => a.sort_order - b.sort_order)
console.log(`[migrate] 朝代: ${dynasties.length} 个`)

// ─── 预览 ───
console.log('\n[migrate] === 预览 ===')
console.log('places[0]:', JSON.stringify(places[0], null, 2).slice(0, 400))
console.log('poems[0]:', JSON.stringify(poems[0], null, 2).slice(0, 400))
console.log('authors[0]:', JSON.stringify(authors[0], null, 2).slice(0, 400))
console.log('dynasties[0]:', JSON.stringify(dynasties[0]))

if (DRY_RUN) {
  console.log('\n[migrate] --dry-run 模式，跳过写入')
  process.exit(0)
}

// ─── 5. 通过 MCP 写入 CloudBase ───
function mcporterCall(toolName, params) {
  const res = spawnSync(
    'npx',
    ['mcporter', 'call', toolName, '--args', JSON.stringify(params), '--output', 'json'],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], timeout: 60000 }
  )
  return res
}

function bindCloudBaseEnvironment() {
  const res = mcporterCall('cloudbase.auth', {
    action: 'set_env',
    envId: config.ENV_ID,
  })
  let outcome = {}
  try {
    outcome = JSON.parse(res.stdout)
  } catch (e) {
    throw new Error(`CloudBase 环境绑定响应无法解析: ${res.stdout.slice(0, 200)}`)
  }
  if (res.status !== 0 || outcome.success === false || outcome.error) {
    throw new Error(`CloudBase 环境绑定失败: ${outcome.error || outcome.message || res.stderr || 'unknown error'}`)
  }
  console.log(`[migrate] 已显式绑定 CloudBase 环境: ${config.ENV_ID}`)
}

function writeCollection(collectionName, documents) {
  if (!documents.length) {
    console.log(`[migrate] ${collectionName}: 无数据，跳过`)
    return
  }
  // writeNoSqlDatabaseContent 一次写入全部
  const res = mcporterCall('cloudbase.writeNoSqlDatabaseContent', {
    action: 'insert',
    collectionName,
    documents,
  })
  let outcome = {}
  try {
    outcome = JSON.parse(res.stdout)
  } catch (e) {
    console.error(`[migrate] ${collectionName} 响应解析失败:`, res.stdout.slice(0, 300))
    if (res.stderr) console.error(res.stderr.slice(0, 300))
    return
  }
  const ok = outcome.success !== false && !outcome.error
  console.log(
    `[migrate] ${collectionName}: ${ok ? '✓' : '✗'} 写入 ${documents.length} 条` +
      (outcome.message ? ` — ${outcome.message}` : '') +
      (outcome.error ? ` — ERROR: ${outcome.error}` : '')
  )
  if (!ok && outcome) console.error('  detail:', JSON.stringify(outcome).slice(0, 400))
}

console.log('\n[migrate] === 开始写入 CloudBase ===')
bindCloudBaseEnvironment()
writeCollection('places', places)
writeCollection('poems', poems)
writeCollection('authors', authors)
writeCollection('dynasties', dynasties)

console.log('\n[migrate] === 完成 ===')
console.log('提示：favorites / imagery_network 由运行时写入，无需迁移')
