/**
 * 云函数：verifyData（临时）
 * 验证原生 NoSQL 各集合文档数 + 抽样查询
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async () => {
  const counts = {}
  for (const col of ['places', 'poems', 'authors', 'dynasties']) {
    const r = await db.collection(col).count()
    counts[col] = r.total
  }

  const hangzhou = await db.collection('places').doc('hangzhou').get()
  const suShi = await db.collection('authors').doc('苏轼').get().catch(() => ({ data: null }))
  const libaiPoem = await db.collection('poems').where({ author: '李白' }).limit(2).get()

  return { ok: true, counts, sample: { hangzhou: hangzhou.data || null, suShi: suShi.data || null, libaiPoems: libaiPoem.data || [] } }
}
