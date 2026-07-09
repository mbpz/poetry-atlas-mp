/**
 * 云函数：initData
 * 数据迁移：从原版 places.json 结构写入 NoSQL 集合
 * 一次性调用，M1 执行
 * TODO: M1 实现完整迁移逻辑
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  console.log('[initData] called', event)
  return { ok: true, message: '数据迁移脚本 M1 实现' }
}
