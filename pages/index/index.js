/**
 * 地图首页 — 诗词地图核心入口
 * 全屏 <map> + 地点 markers + 朝代筛选 + 缩放聚合
 */
const { getDB, wrapPromise } = require('../../utils/cloudbase.js')
const config = require('../../config.js')

Page({
  data: {
    // 地图区域
    longitude: config.MAP.INITIAL_LONGITUDE,
    latitude: config.MAP.INITIAL_LATITUDE,
    scale: config.MAP.INITIAL_SCALE,
    // 选中朝代（空=全部）
    dynasties: config.DYNASTIES,
    selectedDynasty: '',
    // 标记点（省份聚合 or 地点）
    markers: [],
    polyline: [],
    showCallout: false,
    calloutPlace: null,
    // 加载状态
    loading: true,
    showDynastyBar: true,
    // 是否定位到当前位置
    hasLocation: false,
  },

  onLoad() {
    this._pendingMapUpdate = null
  },

  onReady() {
    this.mapCtx = wx.createMapContext('poetry-map', this)
    this.loadMarkers()
  },

  onShow() {
    if (this.mapCtx) this.loadMarkers()
  },

  // ===== 数据加载 =====
  async loadMarkers() {
    this.setData({ loading: true })
    try {
      const { db } = getDB()
      const scale = this.data.scale
      let markers = []

      if (scale < config.MAP.CLUSTER_THRESHOLD) {
        // 小缩放级别：调用云函数做省份聚合
        markers = await this.loadProvinceClusters()
      } else {
        // 大缩放级别：直接读取地点集合
        const cond = {}
        if (this.data.selectedDynasty) {
          // 该朝代有诗词的地点
          cond[`dynasty_stats.${this.data.selectedDynasty}`] = db.command.gt(0)
        }
        const res = await wrapPromise(
          db.collection('places')
            .where(cond)
            .orderBy('poem_count', 'desc')
            .limit(200)
            .get(),
          { loadingText: '加载地点…' }
        )
        markers = (res.data || []).map((p) => this.placeToMarker(p))
      }

      this.setData({ markers, loading: false })
    } catch (err) {
      console.error('[index] loadMarkers error:', err)
      this.setData({ loading: false })
    }
  },

  /** 省份聚合：调用云函数 aggregateMap */
  async loadProvinceClusters() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'aggregateMap',
        data: {
          type: 'province',
          dynasty: this.data.selectedDynasty || '',
        },
      })
      const provinces = (res.result && res.result.data) || []
      return provinces.map((p) => ({
        id: `cluster-${p.provinceId || p._id || p.name}`,
        longitude: p.longitude,
        latitude: p.latitude,
        width: 80,
        height: 70,
        cluster: true,
        callout: {
          content: `${p.name} ${p.poem_count || 0}`,
          color: '#fff',
          fontSize: 22,
          borderRadius: 20,
          bgColor: '#8b1a1a',
          padding: 10,
          display: 'ALWAYS',
        },
      }))
    } catch (err) {
      console.error('[index] loadProvinceClusters error:', err)
      // 云函数可能尚未部署，返回空
      return []
    }
  },

  /**
   * 将 places 文档转为地图 marker
   * 兼容两种 GeoPoint 格式：
   *   客户端 SDK (wx.cloud.database) → { location: { longitude, latitude } }
   *   MCP readNoSql               → { location: { type:'Point', coordinates:[lng,lat] } }
   */
  placeToMarker(p) {
    let lng = 0, lat = 0
    const loc = p.location
    if (loc) {
      if (typeof loc.longitude === 'number') { lng = loc.longitude; lat = loc.latitude }
      else if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
        lng = loc.coordinates[0]; lat = loc.coordinates[1]
      }
    }
    return {
      id: p._id,
      longitude: lng,
      latitude: lat,
      width: 56,
      height: 52,
      cluster: false,
      placeId: p._id,
      callout: {
        content: `${p.name} ${p.poem_count || 0}`,
        color: '#2c2c2c',
        fontSize: 20,
        borderRadius: 16,
        bgColor: '#ffffff',
        padding: 8,
        display: 'BYCLICK',
        borderColor: '#8b1a1a',
        borderWidth: 1,
      },
    }
  },

  // ===== 交互事件 =====

  /** 地图视野变化（缩放 / 拖动）结束 */
  onRegionChange(e) {
    if (e.type === 'end' && (e.causedBy === 'scale' || e.causedBy === 'drag')) {
      this.mapCtx.getScale({
        success: (res) => {
          const scale = res.scale
          if (Math.abs(scale - this.data.scale) >= 1) {
            this.setData({ scale })
            this.loadMarkers()
          }
        },
      })
      // 更新中心点
      this.mapCtx.getCenterLocation({
        success: (res) => {
          this.setData({ longitude: res.longitude, latitude: res.latitude })
        },
      })
    }
  },

  /** 点击 marker */
  onMarkerTap(e) {
    const markerId = e.markerId
    const marker = this.data.markers.find((m) => m.id === markerId)
    if (!marker) return
    if (marker.cluster) {
      // 聚合点：缩放进入该区域
      this.moveToLocation(marker.longitude, marker.latitude, this.data.scale + 3)
    } else {
      // 地点 marker：进入地点详情
      wx.navigateTo({
        url: `/pages/place/place?id=${marker.placeId}`,
      })
    }
  },

  /** 移动到指定位置并刷新 */
  moveToLocation(lng, lat, scale) {
    this.setData({
      longitude: lng,
      latitude: lat,
      scale: scale || this.data.scale,
    })
    this.loadMarkers()
  },

  /** 朝代筛选切换 */
  onSelectDynasty(e) {
    const d = e.currentTarget.dataset.dynasty || ''
    this.setData({ selectedDynasty: this.data.selectedDynasty === d ? '' : d })
    this.loadMarkers()
  },

  /** 定位到当前位置 */
  onLocate() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.moveToLocation(res.longitude, res.latitude, 8)
        this.setData({ hasLocation: true })
      },
      fail: () => {
        wx.showToast({ title: '定位失败，请检查权限', icon: 'none' })
      },
    })
  },

  /** 切换朝代栏显隐 */
  onToggleDynastyBar() {
    this.setData({ showDynastyBar: !this.data.showDynastyBar })
  },

  // ===== 分享 =====
  onShareAppMessage() {
    return {
      title: '在地图上阅读中国 — 诗词地图',
      path: '/pages/index/index',
    }
  },
})
