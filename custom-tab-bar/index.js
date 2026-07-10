/**
 * 自定义 tabBar — 国际化设计（参考 Apple TabBar / Telegram / 微信国际版）
 * 特点：大图标居中 + 极小文字 + 选中态填色 + 顶部凸起分割线
 */
const config = require('../config.js')

// 内嵌 SVG data URL（无需 CDN、无需本地文件路径）
const ICONS = {
  map: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiAyQzguMTMgMiA1IDUuMTMgNSA5YzAgNS4yNSAxMyAxMyAxMyAxM3M3LTcuNzUgNy0xM2MwLTMuODctMy4xMy03LTctN3oiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjkiIHI9IjIuNSIvPjxwYXRoIGQ9Ik0yIDIybDUtNSIvPjxwYXRoIGQ9Ik0yMiAyMmwtNS01Ii8+PC9zdmc+',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTIgMkM4LjEzIDIgNSA1LjEzIDUgOWMwIDUuMjUgMTMgMTMgMTMgMTNzNy03Ljc1IDctMTNjMC0zLjg3LTMuMTMtNy03LTd6bTAgOS41YTIuNSAyLjUgMCAxIDEgMC01IDIuNSAyLjUgMCAwIDEgMCA1eiIvPjwvc3ZnPg==',
  },
  search: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjExIiBjeT0iMTgiIHI9IjciLz48cGF0aCBkPSJNMjEgMjFsLTQuMy00LjMiLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTEgN2E0IDQgMCAxIDAgOCAwIDQgNCAwIDAgMC04IDB6bTAtNWE5IDkgMCAxIDAgNy4wNyAxNS4zbDQuMjUgNC4yNSAxLjQyLTEuNDItNC4yNS00LjI1QTkgOSAwIDAgMCAxMSAyeiIvPjwvc3ZnPg==',
  },
  fav: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMC44NCA0LjYxYS44NDUgNS41IDAgMCAwLTcuNzggMEwxMiA1LjY3bC0xLjA2LTEuMDZhLjUgNS41IDAgMCAwLTcuNzggNy43OGwxLjA2IDEuMDZMMTIgMjEuMjNsNy43OC03Ljc4IDEuMDYtMS4wNmEuNSA1LjUgMCAwIDAgMC03Ljc4eiIvPjwvc3ZnPg==',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNMTIgMjEuMzVsLTEuNDUtMS4zMkM1LjQgMTUuMzYgMiAxMi4yOCAyIDguNSAyIDUuNDIgNC40MiAzIDcuNSAzYzEuNzQgMCAzLjQxLjgxIDQuNSAyLjA5QzEzLjA5IDMuODEgMTQuNzYgMyAxNi41IDMgMTkuNTggMyAyMiA1LjQyIDIyIDguNWMwIDMuOC0zLjQgNi45LTguNTUgMTEuNTRMMTIgMjEuMzV6Ii8+PC9zdmc+',
  },
  dynasty: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik00IDVjMC0xIDEtMiAyLTJoMTJjMSAwIDIgMSAyIDJ2MTRjMCAxLTEgMi0yIDZINGMtMSAwLTItMS0yLTJWNXoiLz48cGF0aCBkPSJNNiA1aDEyIi8+PHBhdGggZD0iTTYgOWgxMiIvPjxwYXRoIGQ9Ik02IDEzaDEyIi8+PC9zdmc+',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48cGF0aCBkPSJNNCA1YzAtMSAxLTIgMi0yaDEyYzEgMCAgMiAxIDIgMnYxNGMwIDEtMSAyLTItMkg0Yy0xIDAtMi0xLTItMlY1eiIvPjxwYXRoIGQ9Ik02IDVoMTIiLz48cGF0aCBkPSJNNiA5aDEyIi8+PHBhdGggZD0iTTYgMTNoMTIiLz48L3N2Zz4=',
  },
  me: {
    normal: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMS44IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iOCIgcj0iNCIvPjxwYXRoIGQ9Ik00IDIxYzAtNCA0LTcgOC03czggMyA4IDciLz48L3N2Zz4=',
    active: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iY3VycmVudENvbG9yIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQiLz48cGF0aCBkPSJNNCAyMWMwLTQgNC03IDgtN3M4IDMgOCA3djFIMHYtMXoiLz48L3N2Zz4=',
  },
}

const TAB_LIST = [
  { pagePath: '/pages/index/index', text: '地图', icon: 'map' },
  { pagePath: '/pages/search/search', text: '发现', icon: 'search' },
  { pagePath: '/pages/dynasty/dynasty', text: '朝代', icon: 'dynasty' },
  { pagePath: '/pages/favorites/favorites', text: '收藏', icon: 'fav' },
  { pagePath: '/pages/profile/profile', text: '我的', icon: 'me' },
]

Component({
  data: {
    selected: 0,
    list: TAB_LIST.map((t) => ({
      ...t,
      iconUrl: ICONS[t.icon].normal,
      activeIconUrl: ICONS[t.icon].active,
    })),
    version: config.VERSION,
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.url
      wx.switchTab({ url })
    },
  },
})
