/**
 * 云函数：recitations（诗词朗诵 CRUD + 播放计数）
 * 动作:
 *   list       传入 poem_id → 返回该诗词的朗诵列表
 *   recordPlay 传入 recitation_id → play_count +1
 *   seedRecitations （一次性）为热门诗词写入占位朗诵记录
 *
 * 集合: recitations
 * schema: { _id, poem_id, audio_url, duration(秒), voice('male'/'female'), play_count, created_at }
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const COLLECTION = 'recitations'

// 占位静音 MP3（约 1 秒，base64 内嵌，避免 MVP 阶段外链失效）
// 来源：最小合法 MP3（静音帧），~0.6 KB — 仅用于 UI 占位，不发声
const PLACEHOLDER_AUDIO_URL =
  'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAABhTEFNRTMuMTAwA8MAAAAAAAAAABQgJAUHAAABAAACcQCsDXQAAAAAAAD/7kMQAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// 热门诗词 seed（poem_id 对应 seed.json 中的 _id）
const SEED_POEMS = [
  { poem_id: '春望_杜甫', voice: 'male' },
  { poem_id: '水调歌头_苏轼', voice: 'male' },
  { poem_id: '江雪_柳宗元', voice: 'female' },
  { poem_id: '登高_杜甫', voice: 'male' },
  { poem_id: '将进酒_李白', voice: 'male' },
]

async function listRecitations(db, poem_id) {
  if (!poem_id) return { ok: false, error: 'poem_id required' }
  const res = await db.collection(COLLECTION)
    .where({ poem_id })
    .orderBy('created_at', 'asc')
    .get()
  return { ok: true, data: res.data }
}

async function recordPlay(db, recitation_id) {
  if (!recitation_id) return { ok: false, error: 'recitation_id required' }
  const _ = db.command
  await db.collection(COLLECTION).doc(recitation_id).update({
    data: { play_count: _.inc(1) },
  })
  return { ok: true }
}

/**
 * 一次性 seed：为热门诗词写入 1 条 recitation 记录
 * 已存在则跳过；可重复调用（幂等）
 */
async function seedRecitations(db) {
  const _ = db.command
  let inserted = 0
  let skipped = 0
  for (const seed of SEED_POEMS) {
    const existing = await db.collection(COLLECTION)
      .where({ poem_id: seed.poem_id })
      .get()
    if (existing.data && existing.data.length > 0) {
      skipped++
      continue
    }
    // 查 poems 集合拿 content 以估算 duration
    let duration = 15
    try {
      const poemRes = await db.collection('poems').doc(seed.poem_id).get()
      if (poemRes.data && poemRes.data.content) {
        const lineCount = poemRes.data.content.split(/[。？！；\n]/).filter(Boolean).length
        duration = lineCount * 3
      }
    } catch (e) {}
    await db.collection(COLLECTION).add({
      data: {
        poem_id: seed.poem_id,
        audio_url: PLACEHOLDER_AUDIO_URL,
        duration,
        voice: seed.voice,
        play_count: 0,
        created_at: Date.now(),
      },
    })
    inserted++
  }
  return { ok: true, inserted, skipped }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  const db = cloud.database()

  try {
    switch (action) {
      case 'list':
        return await listRecitations(db, event.poem_id)

      case 'recordPlay':
        return await recordPlay(db, event.recitation_id)

      case 'seedRecitations':
        // 仅管理员可触发（MVP 阶段简化：有 openid 就行；生产可加 is_admin 校验）
        if (!openid) return { ok: false, error: 'admin only' }
        return await seedRecitations(db)

      default:
        return { ok: false, error: 'unknown action: ' + action }
    }
  } catch (err) {
    console.error('[recitations] action=' + action + ' error:', err)
    return { ok: false, error: err.errMsg || err.message || 'server error' }
  }
}
