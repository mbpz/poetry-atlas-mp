/**
 * TabBar — 自定义 cover-view（可盖过 map 原生层）
 *   入口：[地图] [发现] [朝代] [收藏] [我的]
 *   右下浮动：搜
 *
 * 每个 tab 页各有一份实例；active 需由各页 onShow → getTabBar().setData 同步。
 */
const { TAB_DEFS } = require('./tabs.js')
const { switchTabSafely } = require('../utils/tab-bar.js')

Component({
  data: {
    active: 'map',
    navigating: false,
    tabs: TAB_DEFS,
  },
  methods: {
    syncActive(key) {
      if (!TAB_DEFS.some((tab) => tab.key === key)) return
      this.setData({ active: key, navigating: false })
    },

    switchTab(e) {
      const key = e.currentTarget.dataset.key
      switchTabSafely({
        wxApi: wx,
        tabs: TAB_DEFS,
        currentKey: this.data.active,
        targetKey: key,
        navigating: this.data.navigating,
        setState: (patch) => this.setData(patch),
        onError: (err, tab) => console.warn('[tabbar] switchTab fail', tab.url, err && err.errMsg),
      })
    },
  },
})
