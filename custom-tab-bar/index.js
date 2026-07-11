/**
 * TabBar — 沉浸水墨·自定义 tabBar（framework: custom:true）
 *   入口：[🗺地图] [🔍发现] [📜朝代] [♡收藏] [👤我的]
 *   右下浮动：🔎 搜索珠
 *
 * 注意事项：
 *   微信小程序在每个 tab 页各实例化一份本组件；active 高亮不能自推断，
 *   必须由各 tab 页的 onShow() 主动 getTabBar().setData({ active }) 推送。
 */
// eslint-disable-next-line
const ICO = {
  map: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSI3IiBvcGFjaXR5PSIwLjE2Ii8+PHBhdGggZD0iTTEyIDQgOCA3IDggMTBjMCA0LjUgNCA5IDQgOXM0LTQuNSA0LTljMC0yLjItMi00LTQuNS00eiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjIiLz48L3N2Zz4=',
  find: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  dynasty: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cmVjdCB4PSI1IiB5PSI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PGxpbmUgeDE9IjgiIHkxPSI4IiB4Mj0iMTYiIHkyPSI4Ii8+PGxpbmUgeDE9IjgiIHkxPSIxMiIgeDI9IjE2IiB5Mj0iMTIiLz48bGluZSB4MT0iOCIgeTE9IjE2IiB4Mj0iMTMiIHkyPSIxNiIvPjwvc3ZnPg==',
  fav: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy5zMy5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuNXMtNy00LjgtNy41LTguNWEzLjUgMy41IDAgMCAxIDYuNS0yLjIgMy41IDMuNSAwIDAgMSA2LjUgMi4yYy0uNSAzLjctNy41IDguNS03LjUgOC41eiIgb3BhY2l0eT0iMC4xNiIvPjxwYXRoIGQ9Ik0xMiAyMC41cy03LTQuOC03LjUtOC41YTMuNSAzLjUgMCAwIDEgNi41LTIuMiAzLjUgMy41IDAgMCAxIDYuNSAyLjJjLS41IDMuNy03LjUgOC41LTcuNSA4LjV6Ii8+PC9zdmc+',
  me: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQuNSIvPjxwYXRoIGQ9Ik00IDIyYzAtNSA0LTggOC04czggMyA4IDgiLz48L3N2Zz4=',
  search: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2FhODZhIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc=',
}

const TAB_DEFS = [
  { key: 'map',     label: '地图', icon: 'map',     url: '/pages/index/index' },
  { key: 'find',    label: '发现', icon: 'find',    url: '/pages/search/search' },
  { key: 'dynasty', label: '朝代', icon: 'dynasty', url: '/pages/dynasty/dynasty' },
  { key: 'fav',     label: '收藏', icon: 'fav',     url: '/pages/favorites/favorites' },
  { key: 'me',      label: '我的', icon: 'me',      url: '/pages/profile/profile' },
]

Component({
  data: {
    active: 'map',
    ico: ICO,
    tabs: TAB_DEFS,
  },
  methods: {
    switchTab(e) {
      const key = e.currentTarget.dataset.key
      const tab = TAB_DEFS.find((t) => t.key === key)
      if (!tab) return
      this.setData({ active: key })
      wx.switchTab({ url: tab.url })
    },
    // 搜索珠 → 直接切到搜索 Tab（不能用 navigateTo 打开 tab 页）
    enterSearch() {
      this.setData({ active: 'find' })
      wx.switchTab({ url: '/pages/search/search' })
    },
    noop() {},
  },
})
