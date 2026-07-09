# 诗词地图小程序 (poetry-atlas-mp)

> 在地图上阅读中国，在诗词中穿越历史。

参考开源项目 [mbpz/poetry-atlas](https://github.com/mbpz/poetry-atlas)（Web 版，部署于 https://poetry-atlas.vercel.app/）实现的**微信小程序版**，使用 **CloudBase 腾讯云开发** 作为后端。

## 技术栈

| 层 | 选型 |
|---|---|
| 小程序 | 微信原生小程序（WXML / WXSS / JS） |
| 地图 | 原生 `<map>` 组件 + markers |
| 数据库 | CloudBase NoSQL 文档数据库（`wx.cloud.database()`） |
| 后端逻辑 | Cloud Functions（Node.js，`wx-server-sdk`） |
| AI | CloudBase 内置大模型（DeepSeek / Hunyuan） |
| 资源管理 | CloudBase MCP（`config/mcporter.json`） |

## 关键配置

- **AppID** / **CloudBase EnvId**：详见 `config.js`（代码内维护，未在文档中明文写出）
- `project.config.json` 同步持有 AppID，供微信开发者工具识别
- **运行时**：NoSQL 文档数据库（无 PostgreSQL）

## 目录结构

```
poetry-atlas-mp/
├── app.js / app.json / app.wxss     # 小程序入口与全局样式
├── config.js                        # 全局配置（AppID / EnvId / 朝代 / 地图）
├── project.config.json              # 微信开发者工具配置
├── sitemap.json
├── config/
│   └── mcporter.json                # CloudBase MCP 配置
├── utils/
│   ├── cloudbase.js                 # wx.cloud 初始化 + DB 封装
│   └── util.js                      # 通用工具
├── custom-tab-bar/                  # 自定义 tabBar（纯文字）
├── pages/
│   ├── index/                       # 🗺 地图首页（核心）
│   ├── dynasty/                     # 朝代浏览
│   ├── search/                      # 发现 / 搜索
│   ├── favorites/                   # 收藏
│   ├── profile/                     # 我的
│   ├── place/                       # 地点详情
│   ├── poem/                        # 诗词详情
│   ├── author/                      # 作者详情
│   └── travel/                      # 旅行路线
└── cloudfunctions/
    ├── login/                       # 获取 OPENID
    ├── aggregateMap/                # 地图聚合（省份/区域）
    ├── searchPoems/                 # 多字段搜索
    ├── analyzePoem/                 # AI 诗词解析
    └── initData/                    # 数据迁移（一次性）
```

## 数据模型（NoSQL 集合）

| 集合 | 说明 | 关键字段 |
|---|---|---|
| `places` | 地点（地图核心） | `name`, `location`(GeoPoint), `dynasty_stats`, `hot_poems`, `poem_count` |
| `poems` | 诗词 | `title`, `content`, `author`, `dynasty`, `places[]`, `tags[]` |
| `authors` | 作者 | `name`, `dynasty`, `biography`, `route[]` |
| `dynasties` | 朝代 | `name`, `start_year`, `end_year`, `sort_order` |
| `favorites` | 收藏 | `openid`, `poem_id`（安全规则：仅本人读写） |
| `imagery_network` | 意象网络 | `tag`, `related_tags[]`, `top_poems[]` |

## 开发流程

### 1. 本地开发
用微信开发者工具打开本项目根目录即可预览。

### 2. 部署云函数
通过 CloudBase MCP 部署（推荐）：
```bash
npx mcporter call cloudbase.manageFunctions action=createFunction ...
```
或在微信开发者工具中右键 `cloudfunctions/<name>` → 上传并部署。

### 3. 数据迁移
M1 阶段通过 `initData` 云函数将原版 `places.json` 写入 NoSQL 集合。

## Roadmap

| M1 已入库数据 | 规模 |
|---|---|
| `places` | 164 个（含 GeoPoint、dynasty_stats、hot_poems 内嵌） |
| `poems` | 491 首（title+author 去重，places 数组关联） |
| `authors` | 134 人（poem_count 聚合） |
| `dynasties` | 12 个（含起止年/排序） |

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 环境搭建 + 小程序骨架 + CloudBase 初始化 | ✅ 完成 |
| M1 | 数据模型(6集合) + 安全规则 + 迁移脚本 + 数据入库 | ✅ 完成 |
| M2 | 地图首页 + 地点详情 + 诗词详情 | ⏳ 待开发 |
| M3 | 搜索 + 作者 + 收藏 | ⏳ 待开发 |
| M4 | 时间轴 + 热力 + 旅行路线 | ⏳ 待开发 |
| M5 | AI 诗词解析接入 | ⏳ 待开发 |

## 设计语言

水墨主题：米白宣纸底（`#f8f6f0`）+ 墨黑文字 + 朱砂红强调（`#8b1a1a`）+ 青灰辅助（`#2d5d7b`）。
