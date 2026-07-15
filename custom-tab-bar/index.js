/**
 * TabBar — 自定义 cover-view（可盖过 map 原生层）
 *   入口：[地图] [发现] [朝代] [收藏] [我的]
 *   右下浮动：搜
 *
 * 每个 tab 页各有一份实例；active 需由各页 onShow → getTabBar().setData 同步。
 */
const { TAB_DEFS } = require('./tabs.js')

Component({
  data: {
    active: 'map',
    tabs: TAB_DEFS,
  },
  methods: {
    switchTab(e) {
      const key = e.currentTarget.dataset.key
      const tab = TAB_DEFS.find((t) => t.key === key)
      if (!tab) return
      if (key === this.data.active) return
      this.setData({ active: key })
      wx.switchTab({
        url: tab.url,
        fail: (err) => console.warn('[tabbar] switchTab fail', tab.url, err && err.errMsg),
      })
    },
    enterSearch() {
      if (this.data.active === 'find') return
      this.setData({ active: 'find' })
      wx.switchTab({
        url: '/pages/search/search',
        fail: (err) => console.warn('[tabbar] enterSearch fail', err && err.errMsg),
      })
    },
  },
})
