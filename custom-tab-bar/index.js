/**
 * TabBar — Substack 液态玻璃风（iOS 风格）
 * 状态 A: [🗺][🔍][📜][♡]        [🔎]   (4 玻璃球 + 搜索)
 * 状态 B: [⌂]  [🔍 input.......]          (返回 + 搜索框)
 */
const config = require('../config.js')

// SVG base64 图标
const ICO = {
  map: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSI3IiBvcGFjaXR5PSIwLjE1Ii8+PHBhdGggZD0iTTEyIDQgOCA3IDggMTBjMCA1IDQgOSA0IDlzNC00IDQtOWMwLTItMi00LTQtOXoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiIgcj0iMiIvPjwvc3ZnPg==',
  dynasty: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cmVjdCB4PSI1IiB5PSI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PGxpbmUgeDE9IjguNSIgeTE9IjgiIHgyPSIxNS41IiB5Mj0iOCIvPjxsaW5lIHgxPSI4LjUiIHkxPSIxMiIgeDI9IjE1LjUiIHkyPSIxMiIvPjxsaW5lIHgxPSI4LjUiIHkxPSIxNiIgeTI9IjE2IiB4Mj0iMTMiLz48L3N2Zz4=',
  fav: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuNXMtNy01LTcuNS05YTMuNSAzLjUgMCAwIDEgNi41LTIuMiAzLjUgMy41IDAgMCAxIDYuNSAyLjJjLS41IDQtNy41IDktNy41IDl6IiBvcGFjaXR5PSIwLjE1Ii8+PHBhdGggZD0iTTEyIDIwLjVzLTctNS03LjUtOWEzLjUgMy41IDAgMCAxIDYuNS0yLjIgMy41IDMuNSAwIDAgMSA2LjUgMi4yYy0uNSA0LTcuNSA5LTcuNSA5eiIvPjwvc3ZnPg==',
  search: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMyAxMmw5LTkgOSA5Ii8+PHBhdGggZD0iTTYgMTBoMTJ2MTBINnoi8+PC9zdmc+',
}

const SUBTAB = { map:'地图', dynasty:'朝代', fav:'收藏' }

Component({
  data: {
    searchMode: false,
    query: '',
    active: 'map',
    version: config.VERSION,
    ico: ICO,
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.url
      this.setData({ searchMode: false, query: '', active: e.currentTarget.dataset.key })
      wx.switchTab({ url })
    },
    enterSearch() { this.setData({ searchMode: true }); wx.emit && wx.emit('focusSearch') },
    exitSearch()  { this.setData({ searchMode: false, query: '' }) },
    onInput(e) { this.setData({ query: e.detail.value }) },
    onConfirm(e) {
      this.triggerEvent('search', { query: e.detail.value })
      wx.navigateTo({ url: '/pages/search/search?kw=' + encodeURIComponent(e.detail.value) })
    },
    goHome() { this.setData({ searchMode: false, query: '', active: 'map' }); wx.switchTab({ url: '/pages/index/index' }) },
  },
})
