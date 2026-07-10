/**
 * 朝代浏览页 — 下拉刷新 + 按朝代分页加载 + 滚动加载更多
 * 交互：scroll-view + refresher + scrolltolower
 */
const { getDB } = require('../../utils/cloudbase.js')
const { splitPoemLines } = require('../../utils/util.js')

const PAGE_SIZE = 5   // 每个朝代每次诗词加载条数

Page({
  data: {
    dynasties: [],
    poemsByDynasty: {},       // dynasty -> poems[]
    offsets: {},              // dynasty -> 当前偏移
    hasMoreDynasty: {},       // dynasty -> boolean
    expanded: '',             // 当前展开的朝代名称
    loading: true,
    refreshing: false,
    loadingMoreDynasty: '',   // 当前正在加载的朝代
    // 朝代列表本身也做分页
    dynastyOffset: 0,
    hasMoreDynasties: true,
    loadingMore: false,
  },

  onLoad() { this.resetAndLoad() },

  resetAndLoad() {
    this.setData({
      dynasties: [], poemsByDynasty: {}, offsets: {}, hasMoreDynasty: {},
      expanded: '', dynastyOffset: 0, hasMoreDynasties: true,
    })
    this.loadDynasties(true)
  },

  /** 加载朝代列表（分页）*/
  async loadDynasties(refresh) {
    const { db } = getDB()
    const offset = refresh ? 0 : this.data.dynastyOffset
    try {
      const res = await db.collection('dynasties')
        .where({ poem_count: db.command.gt(0) })
        .orderBy('sort_order', 'asc')
        .skip(offset)
        .limit(4)
        .get()

      const newDynasties = res.data
      const allDynasties = refresh ? newDynasties : this.data.dynasties.concat(newDynasties)

      this.setData({
        dynasties: allDynasties,
        dynastyOffset: offset + newDynasties.length,
        hasMoreDynasties: newDynasties.length === 4,
        loading: false,
        refreshing: false,
      })

      // 默认展开第一个
      if (refresh && newDynasties.length && !this.data.expanded) {
        this.setData({ expanded: newDynasties[0].name })
        this.loadPoemsForDynasty(newDynasties[0].name, true)
      }
    } catch (err) {
      console.error('[dynasty] loadDynasties error:', err)
      this.setData({ loading: false, refreshing: false })
    }
  },

  /** 切换展开/收起 */
  onToggle(e) {
    const d = e.currentTarget.dataset.dynasty
    const next = this.data.expanded === d ? '' : d
    this.setData({ expanded: next })
    if (next && !this.data.poemsByDynasty[d]) {
      this.loadPoemsForDynasty(d, true)
    }
  },

  /** 加载某个朝代的诗词（分页）*/
  async loadPoemsForDynasty(dynasty, refresh) {
    const { db } = getDB()
    const offset = refresh ? 0 : (this.data.offsets[dynasty] || 0)
    try {
      this.setData({ loadingMoreDynasty: dynasty })
      const res = await db.collection('poems')
        .where({ dynasty })
        .orderBy('popularity', 'desc')
        .skip(offset)
        .limit(PAGE_SIZE)
        .get()

      const poems = res.data.map((p) => ({
        title: p.title, author: p.author, dynasty: p.dynasty,
        lines: splitPoemLines(p.content), _id: p._id,
      }))
      const prev = refresh ? [] : (this.data.poemsByDynasty[dynasty] || [])
      const allPoems = prev.concat(poems)

      this.setData({
        [`poemsByDynasty.${dynasty}`]: allPoems,
        [`offsets.${dynasty}`]: offset + poems.length,
        [`hasMoreDynasty.${dynasty}`]: poems.length === PAGE_SIZE,
        loadingMoreDynasty: '',
      })
    } catch (err) {
      console.error('[dynasty] loadPoems error:', err)
      this.setData({ loadingMoreDynasty: '' })
    }
  },

  /** 朝代内“点击加载更多”*/
  onLoadMoreForDynasty(e) {
    const d = e.currentTarget.dataset.dynasty
    if (this.data.loadingMoreDynasty) return
    this.loadPoemsForDynasty(d, false)
  },

  /** 下拉刷新 */
  onRefresh() {
    this.setData({ refreshing: true })
    this.resetAndLoad()
  },

  /** 加载更多朝代列表（按 bindscrolltolower）*/
  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMoreDynasties) return
    this.setData({ loadingMore: true })
    this.loadDynasties(false).then(() => this.setData({ loadingMore: false }))
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    getApp().globalData.currentPoem = poem
    wx.navigateTo({ url: '/pages-sub/info/poem/poem' })
  },
})
