/**
 * 自定义 tabBar — 纯文字无图标，flex 居中消除上方空白
 * 参考：miniprogram-development 推荐 default（text-only custom tabBar）
 */
const config = require('../config.js')

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '地图' },
      { pagePath: '/pages/dynasty/dynasty', text: '朝代' },
      { pagePath: '/pages/search/search', text: '发现' },
      { pagePath: '/pages/favorites/favorites', text: '收藏' },
      { pagePath: '/pages/profile/profile', text: '我的' },
    ],
    version: config.VERSION,
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.url
      wx.switchTab({ url })
    },
  },
})
