/**
 * 云函数：initData
 * 一次性数据迁移：seed.json → CloudBase 原生 NoSQL 集合
 *
 * 使用 wx-server-sdk 直接操作原生文档数据库，
 * 与小程序端 wx.cloud.database() 访问的是同一套集合。
 *
 * 调用方式（仅一次）：通过管理端 / manageFunctions action=invokeFunction 触发
 * 返回：各集合写入结果
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 打包在内的种子数据
const seed = require('./seed.json')

/**
 * 批量写入某集合（自动去重：已存在则更新，否则新增）
 */
async function batchWrite(collectionName, documents, idField = '_id') {
  const col = db.collection(collectionName)
  let inserted = 0
  let updated = 0
  let failed = 0

  for (const doc of documents) {
    try {
      const existing = await doc[idField]
        ? col.doc(doc[idField]).get().catch(() => ({ data: null }))
        : { data: null }
      if (existing.data) {
        const { _id, _openid, ...rest } = doc
        await col.doc(doc[idField]).update({ data: rest })
        updated++
      } else {
        await col.doc(doc[idField]).set({ data: doc })
        inserted++
      }
    } catch (err) {
      // 若 doc(id) 不存在会走 set；其他错误记录
      if (err.errCode === -1 || err.errMsg) {
        try {
          await col.add({ data: doc })
          inserted++
        } catch (e2) {
          failed++
          console.error(`[${collectionName}] write fail:`, doc[idField], e2.errMsg || e2.message)
        }
      } else {
        failed++
        console.error(`[${collectionName}] unexpected:`, err)
      }
    }
  }

  return { collection: collectionName, inserted, updated, failed, total: documents.length }
}

exports.main = async () => {
  console.log('[initData] start migration, env =', cloud.DYNAMIC_CURRENT_ENV)
  const results = {}

  results.places = await batchWrite('places', seed.places)
  results.poems = await batchWrite('poems', seed.poems)
  results.authors = await batchWrite('authors', seed.authors)
  results.dynasties = await batchWrite('dynasties', seed.dynasties)

  console.log('[initData] done:', JSON.stringify(results))
  return { ok: true, results }
}
