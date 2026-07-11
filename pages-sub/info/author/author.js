/**
 * 作者详情页 — 生平 + 轨迹地图 + 代表作
 * 入参: name (作者姓名)
 */
const { getDB } = require("../../../utils/cloudbase.js")
const { splitPoemLines } = require("../../../utils/util.js")

Page({
  data: {
    author: null,
    poems: [],
    loading: true,
  },

  onLoad(options) {
    this.authorName = decodeURIComponent(options.name || "")
    if (!this.authorName) {
      wx.showToast({ title: "缺少作者参数", icon: "none" })
      return
    }
    this.setData({ navigationBarTitleText: this.authorName })
    this.loadAuthor()
  },

  async loadAuthor() {
    const { db } = getDB()
    try {
      const res = await db.collection("authors").where({ name: this.authorName }).limit(1).get()
      const author = res.data[0]
      if (!author) {
        wx.showToast({ title: "作者不存在", icon: "none" })
        this.setData({ loading: false })
        return
      }
      this.setData({ author, loading: false })
      this.loadPoems()
    } catch (err) {
      console.error("[author] loadAuthor error:", err)
      this.setData({ loading: false })
    }
  },

  async loadPoems() {
    const { db } = getDB()
    try {
      const res = await db.collection("poems")
        .where({ author: this.authorName })
        .orderBy("popularity", "desc")
        .limit(30)
        .get()
      const poems = res.data.map((p) => ({
        title: p.title,
        dynasty: p.dynasty,
        content: p.content,
        lines: splitPoemLines(p.content),
      }))
      this.setData({ poems })
    } catch (err) {
      console.error("[author] loadPoems error:", err)
    }
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    wx.navigateTo({ url: "/pages-sub/info/poem/poem?id=" + poem._id })
  },

  onShareAppMessage() {
    return {
      title: this.authorName + " — 诗词地图",
      path: "/pages/author/author?name=" + encodeURIComponent(this.authorName),
    }
  },
})
