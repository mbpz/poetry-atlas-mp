/**
 * 朝代浏览页 — 按朝代时间轴浏览诗词分布
 * 数据：dynasties 集合（排序）+ 每朝代热门诗词抽样
 */
const { getDB, wrapPromise } = require('../../utils/cloudbase.js')
const { splitPoemLines } = require('../../utils/util.js')
const config = require('../../config.js')

Page({
  data: {
    dynasties: [],
    poemsByDynasty: {},  // dynasty -> 诗词数组
    loading: true,
    expanded: '',         // 当前展开的朝代
  },

  onLoad() {
    this.loadDynasties()
  },

  async loadDynasties() {
    const { db } = getDB()
    try {
      // 按 sort_order 排序，仅展示有数据的朝代
      const res = await db.collection('dynasties')
        .where({ poem_count: db.command.gt(0) })
        .orderBy('sort_order', 'asc')
        .get()

      const dynasties = res.data
      this.setData({ dynasties, loading: false })

      // 预加载每个朝代 Top1 诗词（避免一次性全量）
      for (const d of dynasties) {
        this.loadTopPoems(d.name)
      }
    } catch (err) {
      console.error('[dynasty] loadDynasties error:', err)
      this.setData({ loading: false })
    }
  },

  async loadTopPoems(dynasty) {
    const { db } = getDB()
    try {
      const res = await db.collection('poems')
        .where({ dynasty })
        .orderBy('popularity', 'desc')
        .limit(5)
        .get()
      const poems = res.data.map((p) => ({
        title: p.title, author: p.author, dynasty: p.dynasty,
        lines: splitPoemLines(p.content),
      }))
      this.setData({ [`poemsByDynasty.${dynasty}`]: poems })
    } catch (e) { /* 忽略 */ }
  },

  onToggle(e) {
    const d = e.currentTarget.dataset.dynasty
    this.setData({ expanded: this.data.expanded === d ? '' : d })
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    getApp().globalData.currentPoem = poem
    wx.navigateTo({ url: '/pages/poem/poem' })
  },
})
