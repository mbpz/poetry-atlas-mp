/**
 * TabBar — 墨染扩散（Ink Diffusion）
 * 设计规范（frontend-design skill）
 *   状态 A: [🗺][📜][☆]        [搜索珠]   (玻璃胶囊 + 朱砂搜索)
 *   状态 B: [⌂] [🔍 输入...........]         (坍缩 + 墨扩散)
 * 配色: paper-base #f5f0e8 / ink-black #2c2c2c / cinnabar #8b1a1a / ink-blue #2d5d7b
 */
const config = require('../config.js')

// SVG 图标 base64（线性 1.5px 极细笔触）
const ICO = {
  map: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSI3IiBvcGFjaXR5PSIwLjEzIi8+PHBhdGggZD0iTTEyIDQgOCA3IDggMTBjMCA1IDQgOSA0IDlzNC00IDQtOWMwLTItMi00LTQtOXoiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiIgcj0iMiIvPjwvc3ZnPg==',
  dynasty: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cmVjdCB4PSI1IiB5PSI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PGxpbmUgeDE9IjguNSIgeTE9IjgiIHgyPSIxNS41IiB5Mj0iOCIvPjxsaW5lIHgxPSI4LjUiIHkxPSIxMiIgeTI9IjEyIiB4Mj0iMTUuNSIvPjxsaW5lIHgxPSI4LjUiIHkxPSIxNiIgeTI9IjE2IiB4Mj0iMTMiLz48L3N2Zz4=',
  fav: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTIgMjAuNXMtNy01LTcuNWEzLjUgMy41IDAgMCAxIDYuNS0yLjIgMy41IDMuNSAwIDAgMSA2LjUgMi4yYy0uNSA0LTcuNSA5LTcuNSA5eiIgb3BhY2l0eT0iMC4xMyIvPjxwYXRoIGQ9Ik0xMiAyMC41cy03LTUtNy41YTMuNSAzLjUgMCAwIDEgNi41LTIuMiAzLjUgMy41IDAgMCAxIDYuNSAyLjJjLS41IDQtNy41IDktNy41IDl6Ii8+PC9zdmc+',
  search: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOGIxYTFhIiBzdHJva2Utd2lkdGg9IjEuOCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI3Ii8+PHBhdGggZD0iTTIwIDIwbC00LjUtNC41Ii8+PC9zdmc+',
  home: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmMyYzJjIiBzdHJva2Utd2lkdGg9IjEuNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMyAxMmw5LTkgOSA5Ii8+PHBhdGggZD0iTTYgMTBoMTJ2MTBINnoi8+PC9zdmc+',
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
      const key = e.currentTarget.dataset.key
      const map = { map:'/pages/index/index', dyn:'/pages/dynasty/dynasty', fav:'/pages/favorites/favorites' }
      if (!map[key]) return
      this.setData({ active: key, searchMode: false, query: '' })
      wx.switchTab({ url: map[key] })
    },
    enterSearch() { this.setData({ searchMode: true }) },
    exitSearch()  { this.setData({ searchMode: false, query: '', active: 'map' }); wx.switchTab({ url: '/pages/index/index' }) },
    onInput(e) { this.setData({ query: e.detail.value }) },
    onConfirm(e) {
      const q = (e.detail.value || '').trim()
      if (!q) return
      this.triggerEvent('search', { query: q })
      wx.navigateTo({ url: '/pages/search/search?kw=' + encodeURIComponent(q) })
    },
    noop() {},
  },
})
