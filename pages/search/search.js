/**
 * 发现/搜索页 — 多字段搜索 + 结果分 Tab 展示
 */
const { debounce } = require("../../utils/util.js")
const { syncTabBar } = require("../../utils/tab-bar.js")
const {
  readStoredSearchState,
  writeStoredSearchState,
} = require("../../utils/search-state.js")

Page({
  onShow() {
    syncTabBar(this, 'find')
  },

  data: {
    keyword: "",
    tabs: [
      { key: "all", label: "全部" },
      { key: "poem", label: "诗词" },
      { key: "author", label: "作者" },
      { key: "place", label: "地点" },
    ],
    activeTab: "all",
    poems: [],
    authors: [],
    places: [],
    loading: false,
    searched: false,
    searchError: "",
    hotKeywords: ["西湖", "李白", "月亮", "长江", "泰山", "杜甫"],
  },

  onLoad(options) {
    this._doSearch = debounce((kw) => this.search(kw), 300)
    this._fromPublish = (options || {}).from === 'publish'
    this._searchRequestId = 0
    if (!this._fromPublish) {
      const saved = readStoredSearchState(wx)
      const keyword = String((options || {}).keyword || (saved && saved.keyword) || '').trim()
      const activeTab = (saved && saved.activeTab) || 'all'
      this._restoreScrollTop = (saved && saved.scrollTop) || 0
      this.setData({ keyword, activeTab })
      if (keyword) this.search(keyword)
    }
  },

  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (!keyword.trim()) {
      this._searchRequestId += 1
      this.setData({ poems: [], authors: [], places: [], searched: false, loading: false, searchError: "" })
      this._saveSearchContext()
      return
    }
    this._doSearch(keyword)
  },

  onClear() {
    this._searchRequestId += 1
    this.setData({ keyword: "", poems: [], authors: [], places: [], searched: false, loading: false, searchError: "" })
    this._saveSearchContext()
  },

  onSelectTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
    this._saveSearchContext()
  },

  onTapHot(e) {
    const kw = e.currentTarget.dataset.keyword
    this.setData({ keyword: kw })
    this.search(kw)
  },

  async search(keyword) {
    const normalizedKeyword = String(keyword || '').trim()
    if (!normalizedKeyword) return
    const requestId = ++this._searchRequestId
    this.setData({
      keyword: normalizedKeyword,
      loading: true,
      searched: true,
      searchError: "",
      poems: [],
      authors: [],
      places: [],
    })
    this._saveSearchContext()
    try {
      const res = await wx.cloud.callFunction({
        name: "searchPoems",
        // 始终取全类型结果，切换 Tab 时无需二次请求，也不会丢失上下文。
        data: { keyword: normalizedKeyword, type: "all", limit: 30 },
      })
      if (requestId !== this._searchRequestId) return
      const result = res.result || {}
      if (result.ok) {
        this.setData({
          poems: result.data.poems || [],
          authors: result.data.authors || [],
          places: result.data.places || [],
          loading: false,
          searchError: "",
        })
        this._restoreSearchScroll()
      } else {
        this.setData({
          loading: false,
          searchError: result.error || "搜索失败，请稍后重试。",
        })
      }
    } catch (err) {
      if (requestId !== this._searchRequestId) return
      console.error('[search] search failed:', err)
      this.setData({ loading: false, searchError: "搜索异常，请检查网络后重试。" })
    }
  },

  onRetrySearch() {
    this.search(this.data.keyword)
  },

  onBrowseMap() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onPageScroll(e) {
    this._lastScrollTop = e.scrollTop || 0
  },

  _saveSearchContext() {
    if (this._fromPublish) return
    writeStoredSearchState(wx, {
      keyword: this.data.keyword,
      activeTab: this.data.activeTab,
      scrollTop: this._lastScrollTop || 0,
    })
  },

  _restoreSearchScroll() {
    if (this._didRestoreScroll || !this._restoreScrollTop) return
    this._didRestoreScroll = true
    const scrollTop = this._restoreScrollTop
    setTimeout(() => wx.pageScrollTo({ scrollTop, duration: 0 }), 0)
  },

  onHide() {
    this._saveSearchContext()
  },

  onUnload() {
    this._saveSearchContext()
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    // 来自发布器选诗 → 回写并返回
    if (this._fromPublish) {
      getApp()._publishReturn = {
        poem_id: poem._id,
        poem_title: poem.title,
        author_name: poem.author,
      }
      wx.navigateBack()
      return
    }
    this._saveSearchContext()
    wx.navigateTo({ url: "/pages-sub/info/poem/poem?id=" + poem._id + "&from=search" })
  },

  onTapAuthor(e) {
    const author = e.currentTarget.dataset.author
    if (!author) return
    // 来自发布器选诗 → 回写作者并返回（无 poem）
    if (this._fromPublish) {
      getApp()._publishReturn = {
        poem_id: '',
        poem_title: '',
        author_name: author.name,
      }
      wx.navigateBack()
      return
    }
    this._saveSearchContext()
    wx.navigateTo({ url: "/pages-sub/info/author/author?name=" + encodeURIComponent(author.name) })
  },

  onTapPlace(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    this._saveSearchContext()
    wx.navigateTo({ url: "/pages-sub/info/place/place?id=" + place._id + "&from=search" })
  },
})
