/**
 * 地点详情页 — 地点信息 + 朝代筛选 + 诗词列表 + 小地图
 * 入参: id (地点 _id)
 */
const { getDB, wrapPromise } = require('../../../utils/cloudbase.js')
const { splitPoemLines } = require('../../../utils/util.js')
const { locToLngLat } = require('../../../utils/loc.js')
const {
  readStoredPlaceContext,
  writeStoredPlaceContext,
} = require('../../../utils/discovery-context.js')
const { mergeUniquePoems } = require('../../../utils/poem-list.js')

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
    placeError: '',
    poemsError: '',
    loadingPoems: false,
  },

  onLoad(options) {
    this.placeId = options.id || ''
    if (!this.placeId) {
      this.setData({ loading: false, placeError: '缺少地点参数，无法打开地点详情。' })
      return
    }
    const saved = readStoredPlaceContext(wx, this.placeId)
    if (saved) {
      this._restoreTargetCount = saved.loadedCount
      this._restoreScrollTop = saved.scrollTop
      this.setData({ selectedDynasty: saved.selectedDynasty })
    }
    this.loadPlace()
  },

  onReady() {
    this.mapCtx = wx.createMapContext('place-map', this)
  },

  async loadPlace() {
    if (!this.placeId || this._loadingPlace) return
    this._loadingPlace = true
    const { db } = getDB()
    this.setData({ loading: true, placeError: '', poemsError: '' })
    try {
      const res = await wrapPromise(
        db.collection('places').doc(this.placeId).get(),
        { loadingText: '载入地点…' }
      )
      const place = res.data
      if (!place) {
        this.setData({ loading: false, placeError: '地点不存在或已下线。' })
        return
      }

      const dynasties = place.dynasty_stats
        ? Object.keys(place.dynasty_stats).sort()
        : []

      const { longitude: lng, latitude: lat } = locToLngLat(place.location)

      const previews = !this.data.selectedDynasty && place.hot_poems
        ? place.hot_poems.map((poem) => this.formatPoem(poem, true))
        : []
      this.setData({
        place,
        dynasties,
        poems: previews,
        page: 1,
        hasMore: true,
        loading: false,
        placeError: '',
        mapLongitude: lng,
        mapLatitude: lat,
      })
      this._setPlaceMarker(place.name, lng, lat)
      await this.loadPoems()
    } catch (err) {
      console.error('[place] loadPlace error:', err)
      this.setData({
        loading: false,
        placeError: '地点详情加载失败，请检查网络后重试。',
      })
    } finally {
      this._loadingPlace = false
    }
  },

  onRetryPlace() {
    this.loadPlace()
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

  formatPoem(p, isPreview) {
    const content = p.content || p.excerpt || ''
    return {
      _id: p._id || p.canonical_id || '',
      canonical_id: p.canonical_id || p._id || '',
      title: p.title,
      author: p.author,
      dynasty: p.dynasty,
      content,
      lines: splitPoemLines(content),
      content_kind: p.content_kind || '',
      data_version: p.data_version || '',
      review_status: p.review_status || '',
      source_name: p.source_name || '',
      source_url: p.source_url || '',
      source_license: p.source_license || '',
      source_checked_at: p.source_checked_at || '',
      review_note: p.review_note || '',
      places: p.places || [],
      place_names: p.place_names || [],
      isPreview: !!isPreview,
    }
  },

  async loadPoems() {
    if (!this.data.hasMore || this._loadingPoems) return
    this._loadingPoems = true
    this.setData({ loadingPoems: true, poemsError: '' })
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

      const newPoems = (res.data || []).map((poem) => this.formatPoem(poem, false))
      this.setData({
        poems: mergeUniquePoems(this.data.poems, newPoems),
        page: this.data.page + 1,
        hasMore: newPoems.length === this.data.pageSize,
        poemsError: '',
      })
    } catch (err) {
      console.error('[place] loadPoems error:', err)
      this.setData({ poemsError: '相关诗词加载失败，请稍后重试。' })
    } finally {
      this._loadingPoems = false
      this.setData({ loadingPoems: false })
    }

    if (
      this._restoreTargetCount &&
      !this.data.poemsError &&
      this.data.hasMore &&
      this.data.poems.length < this._restoreTargetCount
    ) {
      await this.loadPoems()
      return
    }
    this._restoreListScroll()
  },

  onRetryPoems() {
    this.loadPoems()
  },

  _restoreListScroll() {
    if (this._didRestoreScroll || !this._restoreScrollTop) return
    this._didRestoreScroll = true
    const scrollTop = this._restoreScrollTop
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop, duration: 0 })
    }, 0)
  },

  onPageScroll(e) {
    this._lastScrollTop = e.scrollTop || 0
  },

  _saveDiscoveryContext() {
    if (!this.placeId) return
    writeStoredPlaceContext(wx, {
      placeId: this.placeId,
      selectedDynasty: this.data.selectedDynasty,
      scrollTop: this._lastScrollTop || 0,
      loadedCount: this.data.poems.length,
    })
  },

  onHide() {
    this._saveDiscoveryContext()
  },

  onUnload() {
    this._saveDiscoveryContext()
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
    this._restoreTargetCount = 0
    this._restoreScrollTop = 0
    this._didRestoreScroll = true
    this.setData({
      selectedDynasty: this.data.selectedDynasty === d ? '' : d,
      poems: [],
      page: 1,
      hasMore: true,
      poemsError: '',
    })
    this._saveDiscoveryContext()
    this.loadPoems()
  },

  onReachBottom() {
    this.loadPoems()
  },

  onTapPoem(e) {
    const poem = e.currentTarget.dataset.poem
    if (!poem) return
    this._saveDiscoveryContext()
    getApp().globalData.currentPoem = poem
    getApp().globalData.currentPoemPlace = this.data.place
    const poemId = poem._id || poem.canonical_id || ''
    const query = poemId ? `?id=${poemId}&from=place&placeId=${this.placeId}` : ''
    wx.navigateTo({ url: '/pages-sub/info/poem/poem' + query })
  },

  onShareAppMessage() {
    const name = this.data.place ? this.data.place.name : '诗词地点'
    return {
      title: `${name} — 诗词地图`,
      path: `/pages-sub/info/place/place?id=${this.placeId}`,
    }
  },
})
