/**
 * TabBar — 悬浮透明 4 等分 + 右下搜索珠
 *  状态 A: [🗺] [🔍] [📜] [♡]       [🔎](浮动)
 *  状态 B: [⌂] [搜索输入 ..........  ]
 */
const config = require('../config.js')

// eslint-disable-next-line
const ICO = {
  map: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSI3IiBvcGFjaXR5PSIwLjEyIi8+PHBhdGggZD0iTTEyIDQgOCA3IDggMTBjMCA0LjUgNCA5IDQgOXM0LTQuNSA0LTljMC0yLjItMi00LTQuNS00eiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjIiLz48L3N2Zz4=',
  find: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  dynasty: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cmVjdCB4PSI1IiB5PSI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PGxpbmUgeDE9IjgiIHkxPSI4IiB4Mj0iMTYiIHkyPSI4Ii8+PGxpbmUgeDE9IjgiIHkxPSIxMiIgeDI9IjE2IiB5Mj0iMTIiLz48bGluZSB4MT0iOCIgeTE9IjE2IiB4Mj0iMTMiIHkyPSIxNiIvPjwvc3ZnPg==',
  fav: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuNXMtNy00LjgtNy41LTguNWEzLjUgMy41IDAgMCAxIDYuNS0yLjIgMy41IDMuNSAwIDAgMSA2LjUgMi4yYy0uNSAzLjctNy41IDguNS03LjUgOC41eiIgb3BhY2l0eT0iMC4xMiIvPjxwYXRoIGQ9Ik0xMiAyMC41cy03LTQuOC03LjUtOC41YTMuNSAzLjUgMCAwIDEgNi41LTIuMiAzLjUgMy41IDAgMCAxIDYuNSAyLjJjLS41IDMuNy03LjUgOC41LTcuNSA4LjV6Ii8+PC9zdmc+',
  search: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGIxYTFhIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMyAxMmw5LTkgOSA5Ii8+PHBhdGggZD0iTTYgMTBoMTJ2MTBINnoiLz48L3N2Zz4=',
}

const TAB_DEFS = [
  { key: 'map',    url: '/pages/index/index',         icon: 'map' },
  { key: 'find',   url: '/pages/search/search',       icon: 'find' },
  { key: 'dynasty',url: '/pages/dynasty/dynasty',     icon: 'dynasty' },
  { key: 'fav',    url: '/pages/favorites/favorites', icon: 'fav' },
]

Component({
  data: {
    searchMode: false,
    query: '',
    active: 'map',
    ico: ICO,
    tabs: TAB_DEFS.map((t) => ({ ...t, src: ICO[t.icon] })),
  },
  methods: {
    switchTab(e) {
      const key = e.currentTarget.dataset.key
      const tab = TAB_DEFS.find((t) => t.key === key)
      if (!tab) return
      this.setData({ active: key })
      wx.switchTab({ url: tab.url })
    },
    enterSearch() { this.setData({ searchMode: true }) },
    exitSearch() {
      this.setData({ searchMode: false, query: '', active: 'map' })
      wx.switchTab({ url: '/pages/index/index' })
    },
    onInput(e) { this.setData({ query: e.detail.value }) },
    onConfirm(e) {
      const q = (e.detail.value || '').trim()
      if (!q) return
      wx.navigateTo({ url: '/pages/search/search?kw=' + encodeURIComponent(q) })
    },
    noop() {},
  },
})
