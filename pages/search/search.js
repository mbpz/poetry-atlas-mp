/**
 * 发现/搜索页 — 多字段搜索 + 结果分 Tab 展示
 */
const { debounce } = require("../../utils/util.js")
const { syncTabBar } = require("../../utils/tab-bar.js")

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
    hotKeywords: ["西湖", "李白", "月亮", "长江", "泰山", "杜甫"],
  },

  onLoad(options) {
    this._doSearch = debounce((kw) => this.search(kw), 300)
    this._fromPublish = (options || {}).from === 'publish'
  },

  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (!keyword.trim()) {
      this.setData({ poems: [], authors: [], places: [], searched: false })
      return
    }
    this._doSearch(keyword)
  },

  onClear() {
    this.setData({ keyword: "", poems: [], authors: [], places: [], searched: false })
  },

  onSelectTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
  },

  onTapHot(e) {
    const kw = e.currentTarget.dataset.keyword
    this.setData({ keyword: kw })
    this.search(kw)
  },

  async search(keyword) {
    this.setData({ loading: true, searched: true })
    try {
      const res = await wx.cloud.callFunction({
        name: "searchPoems",
        data: { keyword, type: this.data.activeTab, limit: 30 },
      })
      const result = res.result || {}
      if (result.ok) {
        this.setData({
          poems: result.data.poems || [],
          authors: result.data.authors || [],
          places: result.data.places || [],
          loading: false,
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: (result.error || "搜索失败"), icon: "none" })
      }
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: "搜索异常", icon: "none" })
    }
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
    wx.navigateTo({ url: "/pages-sub/info/poem/poem?id=" + poem._id })
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
    wx.navigateTo({ url: "/pages-sub/info/author/author?name=" + encodeURIComponent(author.name) })
  },

  onTapPlace(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    wx.navigateTo({ url: "/pages-sub/info/place/place?id=" + place._id })
  },
})
