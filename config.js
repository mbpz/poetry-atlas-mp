/**
 * 全局配置 — 诗词地图小程序
 * 集中管理 AppID、CloudBase EnvId、版本等常量
 */
module.exports = {
  // 小程序 AppID（微信公众平台 -> 开发管理 -> 开发设置）
  APP_ID: 'wx80df998176fa5338',

  // CloudBase 环境 ID（腾讯云开发控制台）
  ENV_ID: 'online-d2gyjoohe58cc4936',

  // 版本信息
  VERSION: '0.1.0',
  NAME: '诗词地图',

  // 地图初始视野（中国中心）
  MAP: {
    INITIAL_LONGITUDE: 104.0,
    INITIAL_LATITUDE: 37.5,
    INITIAL_SCALE: 4,
    MIN_SCALE: 3,
    MAX_SCALE: 18,
    // 聚合阈值：scale 以下启用省份聚合
    CLUSTER_THRESHOLD: 6,
  },

  // 默认分页大小
  PAGE_SIZE: 20,

  // 朝代顺序（与原版一致）
  DYNASTIES: [
    '先秦', '汉', '魏晋', '南北朝', '隋', '唐',
    '五代', '宋', '元', '明', '清', '近现代',
  ],
}
