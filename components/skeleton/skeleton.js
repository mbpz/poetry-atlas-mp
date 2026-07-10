/**
 * 骨架屏组件 — 数据加载时的灰色占位，传递"内容即将到来"的诚实信号
 * 用法: <skeleton rows="3" wx:if="{{loading}}" />
 * 行数 rows 控制骨架条数，avatar 控制是否显示圆形头像占位
 */
Component({
  properties: {
    rows: { type: Number, value: 3 },
    avatar: { type: Boolean, value: false },
  },
  data: { rowArr: [] },
  observers: {
    'rows': function (rows) {
      this.setData({ rowArr: Array.from({ length: rows }, (_, i) => i) })
    },
  },
  lifetimes: {
    attached() {
      this.setData({ rowArr: Array.from({ length: this.data.rows }, (_, i) => i) })
    },
  },
})
