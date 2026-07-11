/**
 * 地点详情页 — 地点信息 + 朝代筛选 + 诗词列表 + 小地图
 * 入参: id (地点 _id)
 */
const { getDB, wrapPromise } = require('../../../utils/cloudbase.js')
const { splitPoemLines } = require('../../../utils/util.js')
const { locToLngLat } = require('../../../utils/loc.js')

Page({
  data: {
    place: null,
    poems: [],
    dynasties: [],
    selectedDynasty: '',
    loading: true,
    page: 1,
    pageSize: 20,
    hasMore: true,
    mapLongitude: 0,
    mapLatitude: 0,
    markers: [],
    cardPressed: false,
  },

  onLoad(options) {
    this.placeId = options.id || ''
    if (!this.placeId) {
      wx.showToast({ title: '缺少地点参数', icon: 'none' })
      return
    }
    this.loadPlace()
  },

  onReady() {
    this.mapCtx = wx.createMapContext('place-map', this)
  },

  async loadPlace() {
    const { db } = getDB()
    try {
      const res = await wrapPromise(
        db.collection('places').doc(this.placeId).get(),
        { loadingText: '载入地点…' }
      )
      const place = res.data
      if (!place) {
        wx.showToast({ title: '地点不存在', icon: 'none' })
        return
      }

      const dynasties = place.dynasty_stats
        ? Object.keys(place.dynasty_stats).sort()
        : []

      const { longitude: lng, latitude: lat } = locToLngLat(place.location)

      this.setData({ place, dynasties, loading: false, mapLongitude: lng, mapLatitude: lat })
      this._setPlaceMarker(place.name, lng, lat)

      if (place.hot_poems && place.hot_poems.length) {
        this.setData({ poems: place.hot_poems.map(this.formatPoem) })
      }
      this.loadPoems()
    } catch (err) {
      console.error('[place] loadPlace error:', err)
      this.setData({ loading: false })
    }
  },

  /** 给小地图加单个定位标记（带点击气泡）*/
  _setPlaceMarker(name, lng, lat) {
    if (!lng && !lat) return
    this.setData({
      markers: [{
        id: 0,
        longitude: lng,
        latitude: lat,
        iconPath: '/images/marker-city.png',
        width: 32,
        height: 32,
        title: name,
        callout: { content: name, display: 'BYCLICK' },
      }],
    })
  },

  formatPoem(p) {
    return {
      title: p.title,
      author: p.author,
      dynasty: p.dynasty,
      content: p.content,
      lines: splitPoemLines(p.content),
    }
  },

  async loadPoems() {
    if (!this.data.hasMore || this._loadingPoems) return
    this._loadingPoems = true
    const { db } = getDB()
    try {
      const cond = { places: this.placeId }
      if (this.data.selectedDynasty) cond.dynasty = this.data.selectedDynasty
      const res = await db.collection('poems')
        .where(cond)
        .orderBy('popularity', 'desc')
        .skip((this.data.page - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .get()

      const newPoems = res.data.map(this.formatPoem)
      this.setData({
        poems: this.data.poems.concat(newPoems),
        page: this.data.page + 1,
        hasMore: newPoems.length === this.data.pageSize,
      })
    } catch (err) {
      console.error('[place] loadPoems error:', err)
    } finally {
      this._loadingPoems = false
    }
  },

  onCardTouch() { this.setData({ cardPressed: true }) },
  onCardTouchEnd() { this.setData({ cardPressed: false }) },

  onPoemCardTouch(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ ['touchedIndex']: idx })
  },
  onPoemCardEnd() { this.setData({ touchedIndex: -1 }) },

  onSelectDynasty(e) {
    const d = e.currentTarget.dataset.dynasty || ''
    this.setData({
      selectedDynasty: this.data.selectedDynasty === d ? '' : d,
      poems: [],
      page: 1,
      hasMore: true,
    })
    this.loadPoems()
  },

  onReachBottom() {
    this.loadPoems()
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    getApp().globalData.currentPoem = poem
    getApp().globalData.currentPoemPlace = this.data.place
    wx.navigateTo({ url: '/pages-sub/info/poem/poem' })
  },

  onShareAppMessage() {
    const name = this.data.place ? this.data.place.name : '诗词地点'
    return {
      title: `${name} — 诗词地图`,
      path: `/pages/place/place?id=${this.placeId}`,
    }
  },
})
