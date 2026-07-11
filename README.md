# 诗词地图小程序 (poetry-atlas-mp)

> 在地图上阅读中国，在诗词中穿越历史。

参考开源项目 [mbpz/poetry-atlas](https://github.com/mbpz/poetry-atlas)（Web 版，部署于 https://poetry-atlas.vercel.app/ / [atlas.doubb.cc](https://atlas.doubb.cc)）实现的**微信小程序版**，使用 **CloudBase 腾讯云开发** 作为后端。

## 技术栈

| 层 | 选型 |
|---|---|
| 小程序 | 微信原生小程序（WXML / WXSS / JS） |
| 地图 | 原生 `<map>` 组件 + markers + 折线 |
| 数据库 | CloudBase NoSQL 文档数据库（`wx.cloud.database()`） |
| 后端逻辑 | Cloud Functions（Node.js，`wx-server-sdk`） |
| AI | CloudBase 内置大模型（混元 hy3 / DeepSeek） |
| 资源管理 | CloudBase MCP（`config/mcporter.json`） |

## AppID / EnvId

appid和envId敏感信息已写在代码文件`config.js`中，\*\*需要您自行申请微信小程序、在\*\*[**腾讯云开发平台**](https://console.cloud.tencent.com/tcb)\*\*开通云环境\*\*。

### 参数位置

- `appid`填写位置：根目录下`config.js` 中的 APP_ID 字段
- `envId`填写位置：根目录下`config.js` 中的 ENV_ID 字段

### 填写说明

> **appid 获取方式：**
> 微信公众平台 → 开发 → 基本配置 → AppID
>
> **envId 获取方式：**
> 腾讯云开发平台 → 我的环境 → 环境ID

## 目录结构

```
poetry-atlas-mp/
├── app.js / app.json / app.wxss     # 小程序入口与全局样式
├── config.js                        # 全局配置（AppID / EnvId / 地图 / 朝代 / 版本）
├── project.config.json              # 微信开发者工具配置
├── sitemap.json
├── config/
│   └── mcporter.json                # CloudBase MCP 配置
├── utils/
│   ├── cloudbase.js                 # wx.cloud 初始化 + DB 封装
│   └── util.js                      # 通用工具（节流/防抖/诗词切行）
├── custom-tab-bar/                  # 自定义 tabBar（纯文字，5 个 tab）
├── pages/
│   ├── index/                       # 🗺 地图首页(时间轴/热力/路线)
│   ├── dynasty/                     # 朝代浏览（时间轴展开）
│   ├── search/                      # 发现 / 搜索（实时防抖 + 热词 + 分 Tab）
│   ├── favorites/                   # 收藏（联表展示 + 删除）
│   ├── profile/                     # 我的（用户 / 收藏统计 / 关于）
│   ├── place/                       # 地点详情（地图卡 + 朝代筛选 + 诗词分页）
│   ├── poem/                        # 诗词详情（全文 + 注释/译文/赏析 + AI 解读）
│   ├── author/                      # 作者详情（生平 + 轨迹 + 代表作）
│   └── travel/                      # 旅行路线（主题路线 + 配诗行程）
├── cloudfunctions/
│   ├── login/                       # 登录（返回 OPENID）
│   ├── aggregateMap/                # 地图聚合（省份聚合 / 附近 geoNear / 地点列表）
│   ├── searchPoems/                 # 多字段正则搜索（标题/作者/正文/地点）
│   ├── analyzePoem/                 # AI 深度解析（结构化 JSON）
│   └── initData/                    # 数据迁移（一次性)
├── scripts/
│   ├── migrate-data.cjs             # places.json → NoSQL 转换脚本
│   ├── seed-native.cjs              # 批量写入原生 NoSQL
│   └── set-favorites-permission.cjs # 收藏集合权限修复脚本
├── data/
│   └── places.json                  # 原版数据集（164 地点 / 508 记录）
└── README.md
```

## 数据模型（NoSQL 集合）

| 集合 | 说明 | 关键字段 | 安全规则 |
|---|---|---|---|
| `places` | 地点（地图核心） | `name`, `location`(GeoPoint), `dynasty_stats`, `hot_poems`, `poem_count` | 公开读 |
| `poems` | 诗词 | `title`, `content`, `author`, `dynasty`, `places[]`, `tags[]`, `popularity` | 公开读 |
| `authors` | 作者 | `name`, `dynasty`, `biography`, `route[]`, `poem_count`, `birth_year/death_year` | 公开读 |
| `dynasties` | 朝代 | `name`, `start_year`, `end_year`, `sort_order`, `poem_count` | 公开读 |
| `favorites` | 收藏 | `openid`, `poem_id`, `poem_title`, `poem_author`, `created_at` | 仅本人读写 |

GeoPoint 存储统一用 WGS-84 坐标；代码兼容两种返回格式（GeoJSON `coordinates` / 扁平 `longitude+latitude`）。

## 数据规模

| 集合 | 规模 |
|---|---|
| `places` | 164 个（含 GeoPoint、`dynasty_stats`、`hot_poems` Top3 内嵌） |
| `poems` | 491 首（title+author 去重，`places[]` 数组关联地点） |
| `authors` | 134 人（`poem_count` 聚合，含 TOP代表作） |
| `dynasties` | 11 个有数据朝代 |

## 开发与部署

### 1. 环境准备
- 微信原生小程序，用微信开发者工具打开根目录
- 参考 `config.js` 中的提示完成配置

### 2. 部署云函数（两种方式任选）

**方式 A：CloudBase MCP（推荐）**
```bash
npx mcporter call cloudbase.manageFunctions action=createFunction \
  --args '{"func":{"name":"login","runtime":"Nodejs20.19","timeout":10},"functionRootPath":"cloudfunctions/login"}'
```
其余云函数同理：`aggregateMap` / `searchPoems` / `analyzePoem`。

**方式 B：微信开发者工具**
右键 `cloudfunctions/<name>` → "上传并部署：云端安装依赖"。

### 3. 数据迁移
```bash
# 1. 拉取原始数据
gh api repos/mbpz/poetry-atlas/contents/public/data/places.json --jq '.content' | base64 -d > data/places.json

# 2. 创建原生 NoSQL 集合 + 写入（通过 MCP）
node scripts/seed-native.cjs

# 3. 设置收藏集合权限（CUSTOM：仅本人读写）
node scripts/set-favorites-permission.cjs
```
或直接调用已部署的 `initData`。

### 4. AI 能力配置
`analyzePoem` 使用 CloudBase 内置 AI（混元 hy3）。需在 [云开发控制台 → AI](https://tcb.cloud.tencent.com/dev?envId=your-env#/ai)：
- 确认 `cloudbase` 模型组已启用 (`DescribeAIModels` 返回 Status=1)
- 若需更多模型（DeepSeek 等），通过 `UpdateAIModel` 添加
- **计费**：AI 消耗 Token Credits 资源包。**体验版环境可能不含额度**，长期使用请购买 [Token Credits](https://buy.cloud.tencent.com/envId=1&resourceType=token)

## 功能地图

| 功能 | 入口 | 状态 |
|---|---|---|
| 地图浏览 + 朝代筛选 + 缩放聚合 | 首页 | ✅ |
| 朝代时间轴 / 热力模式 / 旅行路线 | 首页 | ✅ |
| 地点详情 + 诗词分页 | 地点页 | ✅ |
| 诗词详情 + 注释/译文/赏析 + AI 解读 | 诗词页 | ✅ |
| 多字段搜索 + 作者 + 收藏 | 搜索/作者/收藏页 | ✅ |
| 旅行路线主题行程 | 旅行页 | ✅ |
| 朝代时间轴浏览 | 朝代页 | ✅ |
| 用户中心与关于 | 我的页 | ✅ |

## Roadmap

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 环境搭建 + 小程序骨架 + CloudBase 初始化 | ✅ |
| M1 | 数据建模(6集合) + 安全规则 + 迁移入库 | ✅ |
| M2 | 地图核心(聚合云函数) + 地点/诗词/朝代页 | ✅ |
| M3 | 搜索(正则) + 作者 + 收藏 | ✅ |
| M4 | 时间轴 + 热力 + 旅行路线 | ✅ |
| M5 | AI 诗词解析(结构化 JSON) | ✅ |
| **M6** | 打磨收尾 + 全部页面连通 | **✅ 完成** |

## 设计语言

水墨主题：米白宣纸底 `#f8f6f0` + 墨黑文字 + 朱砂红强调 `#8b1a1a` + 青灰辅助 `#2d5d7b`。

## 开源协议

数据集来源于[古诗文网 / 全唐诗 / 全宋词 / ctext.org](https://github.com/mbpz/poetry-atlas)等开放古诗词数据；代码参考[mbpz/poetry-atlas](https://github.com/mbpz/poetry-atlas)实现。联系邮箱：[mbpz.dev@googlemail.com](mailto:mbpz.dev@googlemail.com)。
