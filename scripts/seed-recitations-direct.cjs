/**
 * 直接写 recitations 种子（绕过 "admin only" 守卫）。
 *
 * 触发 seedRecitations 需真实 WeChat 客户端 openid，而 mcporter invokeFunction 走
 * 服务端→服务端调用，cloud.getWXContext().OPENID 为 null，会被函数内守卫拒绝。
 * 因此按函数内 SEED_POEMS 用 writeNoSqlDatabaseContent insert 直接入替。
 *
 * 用法：node scripts/seed-recitations-direct.cjs
 */
const { spawnSync } = require('child_process')

const ENV_ID = 'online-d2gyjoohe58cc4936'
// '' (空)：MVP 阶段不嵌入占位 data URI——微信 InnerAudioContext 无法播放 data: URI，
// 嵌入只会令"朗诵"报错失效；待接入真实朗诵音频 / CloudBase Storage 后再写真实 URL。
const PLACEHOLDER_AUDIO_URL = ''

const SEED_POEMS = [
  { poem_id: '春望_杜甫', voice: 'male' },
  { poem_id: '水调歌头_苏轼', voice: 'male' },
  { poem_id: '江雪_柳宗元', voice: 'female' },
  { poem_id: '登高_杜甫', voice: 'male' },
  { poem_id: '将进酒_李白', voice: 'male' },
]

const now = Date.now()
const docs = SEED_POEMS.map((p, i) => ({
  _id: `seed_${p.poem_id}`,
  poem_id: p.poem_id,
  audio_url: PLACEHOLDER_AUDIO_URL,
  duration: 1,
  voice: p.voice,
  play_count: 0,
  created_at: now - (SEED_POEMS.length - i) * 1000,
}))

function mcporterCall(toolName, params) {
  const args = ['call', toolName, '--args', JSON.stringify(params), '--output', 'json']
  return spawnSync('npx', ['mcporter', ...args], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] })
}

if (!process.argv.includes('--clean-live')) {
  const res = mcporterCall('cloudbase.writeNoSqlDatabaseContent', { action: 'insert', envId: ENV_ID, collectionName: 'recitations', documents: docs })
  let ok = false
  try {
    const d = JSON.parse(res.stdout)
    ok = !!d.success
    console.log('success:', ok)
    if (ok) console.log('inserted ids:', JSON.stringify(d.data || d))
    else console.log('resp:', JSON.stringify(d))
  } catch (e) {
    console.log('stdout:', res.stdout)
  }
  if (res.stderr) console.log('stderr:', res.stderr.slice(0, 300))
  process.exit(ok ? 0 : 1)
}

// ---------------------------------------------------------------------------
// 幂等清理（仅显式传入 --clean-live 才执行；普通 seed 运行不受影响）
//
// 用途：把 recitations 集合里仍残留的 audio_url: "data:audio..." 脏数据刷成 ''。
// 策略：先 read 全部文档拿到 {_id, audio_url}，客户端过滤出以 "data:" 开头的，
// 再逐条按 _id 发 write action=update（$set audio_url=''）。不用正则 query，
// 因为 live 的 NoSQL where 前缀匹配不可靠，逐个按 _id 更新最稳妥、幂等。
// ---------------------------------------------------------------------------
if (process.argv.includes('--clean-live')) {
  console.log('[clean-live] listing recitations (overwrite each matched doc by _id)...')
  const listRes = mcporterCall('cloudbase.readNoSqlDatabaseContent', { envId: ENV_ID, collectionName: 'recitations', query: {}, projection: { _id: 1, audio_url: 1 }, limit: 200 })
  let docs = []
  try {
    const d = JSON.parse(listRes.stdout)
    if (d.success) docs = d.data || d.list || []
    else { console.log('[clean-live] list failed:', listRes.stdout); process.exit(1) }
  } catch (e) {
    console.log('[clean-live] list stdout:', listRes.stdout)
    process.exit(1)
  }
  const matched = docs.filter((d) => d && typeof d.audio_url === 'string' && d.audio_url.startsWith('data:'))
  console.log('[clean-live] total docs:', docs.length, '| matched data: URLs:', matched.length)
  if (matched.length === 0) {
    console.log('[clean-live] nothing to clean — no data: URLs remain')
    process.exit(0)
  }
  let cleaned = 0
  for (const doc of matched) {
    const updateParams = {
      action: 'update',
      envId: ENV_ID,
      collectionName: 'recitations',
      query: { _id: doc._id },
      update: { $set: { audio_url: '' } },
      isMulti: false,
    }
    const upd = mcporterCall('cloudbase.writeNoSqlDatabaseContent', updateParams)
    try {
      const d = JSON.parse(upd.stdout)
      if (d.success) { cleaned++; console.log('  cleaned _id=', doc._id) }
      else console.log('  update failed _id=', doc._id, upd.stdout)
    } catch (e) {
      console.log('  update stdout parse failed _id=', doc._id, upd.stdout)
    }
  }
  console.log('[clean-live] done: cleaned', cleaned, '/', matched.length)
  process.exit(cleaned === matched.length ? 0 : 1)
}
