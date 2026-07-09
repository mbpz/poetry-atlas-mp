/**
 * 云函数：aggregateMap
 * 地图聚合：按省份/可视区域聚合地点诗词数量
 * TODO: M2 实现完整聚合逻辑
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { type = 'province', dynasty = '' } = event
  // 占位：返回空数组，M2 实现
  console.log('[aggregateMap]', { type, dynasty })
  return { ok: true, data: [] }
}
