/**
 * 云函数：searchPoems
 * 多字段模糊搜索：标题 / 作者 / 正文内容 / 地点名
 *
 * 入参: { keyword, type?: 'all'|'poem'|'author'|'place', limit? }
 * 返回: { ok, data: { poems, authors, places }, total }
 *
 * 注意：NoSQL 正则通过 db.RegExp 构造，可匹配子串。
 */
const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

async function searchPoems(keyword, limit) {
  if (!keyword) return []
  const reg = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), options: "i" })
  // 标题 / 作者 / 正文 OR 匹配，按热度排序
  const res = await db.collection("poems").where(
    _.or([
      { title: reg },
      { author: reg },
      { content: reg },
      { place_names: reg },
    ])
  ).orderBy("popularity", "desc")
    .limit(limit)
    .get()
  return res.data
}

async function searchAuthors(keyword, limit) {
  if (!keyword) return []
  const reg = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), options: "i" })
  const res = await db.collection("authors").where({ name: reg })
    .orderBy("poem_count", "desc").limit(limit).get()
  return res.data
}

async function searchPlaces(keyword, limit) {
  if (!keyword) return []
  const reg = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), options: "i" })
  const res = await db.collection("places").where(
    _.or([{ name: reg }, { name_alias: reg }, { modern_name: reg }])
  ).orderBy("poem_count", "desc").limit(limit).get()
  return res.data
}

exports.main = async (event) => {
  const keyword = (event.keyword || "").trim()
  const type = event.type || "all"
  const limit = Math.min(event.limit || 30, 50)
  console.log("[searchPoems]", JSON.stringify({ keyword, type, limit }))

  if (!keyword) return { ok: true, data: { poems: [], authors: [], places: [] }, total: 0 }

  try {
    const result = { poems: [], authors: [], places: [] }
    if (type === "all" || type === "poem") {
      result.poems = await searchPoems(keyword, limit)
    }
    if (type === "all" || type === "author") {
      result.authors = await searchAuthors(keyword, limit)
    }
    if (type === "all" || type === "place") {
      result.places = await searchPlaces(keyword, limit)
    }
    const total = result.poems.length + result.authors.length + result.places.length
    return { ok: true, data: result, total }
  } catch (err) {
    console.error("[searchPoems] error:", err)
    return { ok: false, error: err.errMsg || err.message || "搜索失败" }
  }
}
