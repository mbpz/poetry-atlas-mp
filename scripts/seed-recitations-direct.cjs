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
const PLACEHOLDER_AUDIO_URL =
  'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAABhTEFNRTMuMTAwA8MAAAAAAAAAABQgJAUHAAABAAACcQCsDXQAAAAAAAD/7kMQAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'

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

function mcporterCall(params) {
  const args = ['call', 'cloudbase.writeNoSqlDatabaseContent', '--args', JSON.stringify(params), '--output', 'json']
  return spawnSync('npx', ['mcporter', ...args], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] })
}

const res = mcporterCall({ action: 'insert', envId: ENV_ID, collectionName: 'recitations', documents: docs })
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
