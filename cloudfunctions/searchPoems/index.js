/**
 * 云函数：searchPoems
 * 多字段模糊搜索（标题/作者/正文/地点/名句）
 * TODO: M3 实现
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  console.log('[searchPoems]', event)
  return { ok: true, data: [], total: 0 }
}
