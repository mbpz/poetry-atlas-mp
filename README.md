# 按图索诗 (poetry-atlas-mp)

> 在地图上发现诗词，在诗词中穿越历史。

**小程序ID**: `gh_1ac57fe909ac`
**服务类目**: 教育服务 > 教育信息展示｜工具 > 备忘录
**主体**: 个人

> 产品定位：古诗词**信息展示工具** + **个人学习备忘录**，不提供 UGC 社区、游戏、在线教育等需企业主体/专项备案的功能。

参考开源项目 [mbpz/poetry-atlas](https://github.com/mbpz/poetry-atlas)（Web 版，部署于 https://poetry-atlas.vercel.app/ / [atlas.doubb.cc](https://atlas.doubb.cc)）实现的**微信小程序版**，使用 **CloudBase 腾讯云开发** 作为后端。

## 技术栈

| 层 | 选型 |
|---|---|
| 小程序 | 微信原生小程序（WXML / WXSS / JS） |
| 地图 | 原生 `<map>` 组件 + markers + 折线 |
| 数据库 | CloudBase NoSQL 文档数据库（`wx.cloud.database()`） |
| 后端逻辑 | Cloud Functions（Node.js，`wx-server-sdk`） |
| 资源管理 | CloudBase MCP（`config/mcporter.json`） |

> **合规说明（个人主体）**：本小程序**不含**生成式 AI / 深度合成能力（无 AI 问答、绘画、换脸等）。诗词注释、译文、赏析均来自开源数据集的预设文本。

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
│   ├── profile/                     # 我的（微信头像昵称 + 统计 + Hub）
│   └── pages-sub/                   # 分包：地点/诗词/作者/路线/隐私协议
├── cloudfunctions/
│   ├── login/                       # 静默登录（OPENID + users upsert）
│   ├── updateUser/                  # 用户档案更新（昵称/头像/stats，支持 upsert）
│   ├── aggregateMap/                # 地图聚合（省份 / 邻近 geoNear / 地点列表）
│   ├── searchPoems/                 # 多字段正则搜索（标题/作者/正文/地点）
│   ├── routes/                      # 私有旅行路线 CRUD
│   ├── recitations/                 # 朗诵列表 + 播放计数
│   ├── ttsPoem/                     # 即时朗读（腾讯云 TTS）
│   └── initData/                    # 数据迁移（一次性，运维用）
├── scripts/
│   ├── migrate-data.cjs             # places.json → NoSQL 转换脚本
│   ├── seed-native.cjs              # 批量写入原生 NoSQL
│   ├── set-favorites-permission.cjs # favorites 集合权限修复
│   ├── set-launch-permissions.cjs   # users/routes/favorites/recitations 权限批量下发
│   └── seed-recitations-direct.cjs  # 朗诵占位数据直写
├── docs/
│   ├── cloudbase-functions-and-database.md  # 云函数 + 文档库参考（排查/Schema）
│   └── cloudbase-operations-log.md        # 云上部署操作日志
├── data/
│   └── places.json                  # 原版数据集（164 地点 / 508 记录）
└── README.md
```

## 数据模型（NoSQL 集合）

| 集合 | 说明 | 关键字段 | 安全规则 |
|---|---|---|---|
| `places` | 地点（地图核心） | `name`, `location`(GeoPoint), `dynasty_stats`, `hot_poems`, `poem_count` | 公开读 |
| `poems` | 诗词 | `canonical_id`, `title`, `content`, `content_kind`, `content_hash`, `data_version`, `review_status`, `source_*`, `places[]` | 公开读 |
| `authors` | 作者 | `name`, `dynasty`, `biography`, `route[]`, `poem_count`, `birth_year/death_year` | 公开读 |
| `dynasties` | 朝代 | `name`, `start_year`, `end_year`, `sort_order`, `poem_count` | 公开读 |
| `favorites` | 收藏（私有） | `_openid`, `poem_id`, `poem_title`, `poem_author`, `created_at` | 仅本人读写 |
| `users` | 用户档案 | `_id`(=openid), `_openid`, `nickname`, `avatar_url`, `created_at`, `stats` | 仅本人读写 |
| `routes` | 自建旅行路线（**私有·仅自己可见**） | `_openid`, `openid`, `request_id`, `name`, `theme`, `description`, `points[]`, `created_at` | 仅本人读写 |
| `recitations` | 诗词朗诵音频（预设） | `poem_id`, `audio_url`, `duration`, `voice`, `play_count` | 公开读 |
| `tts_cache` | TTS 音频缓存索引 | `poem_id`, `voice`, `text_hash`, `fileID`, `duration` | 仅云函数 |

> 线上另有遗留集合 `quiz_questions` / `posts` / `comments` / `likes` / `follows`（答题/社区功能已下线），详见 `docs/cloudbase-functions-and-database.md` §7.2。

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
# 更新单个函数代码（云端安装依赖，勿上传本机 node_modules）
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"updateFunctionCode","functionName":"login",\
           "functionRootPath":"/abs/path/poetry-atlas-mp/cloudfunctions",\
           "installDependency":true}' \
  --output json --timeout 300000
```

需部署的函数：`login` / `updateUser` / `aggregateMap` / `searchPoems` / `routes` / `recitations` / `ttsPoem` / `initData`。

`ttsPoem` 额外步骤（可选）：在云函数环境变量写入 `TTS_SECRET_ID`、`TTS_SECRET_KEY`（腾讯云控制台 → 访问管理 → API 密钥；并开通语音合成 TTS）。**未配置亦可工作** — 云函数会自动回落 `Google Translate TTS`（免费、零依赖、免 API Key）。无需额外 `npm install`。

**方式 B：微信开发者工具**

右键 `cloudfunctions/<name>` → **上传并部署：云端安装依赖**。

> 详细排查与 Schema 见 `docs/cloudbase-functions-and-database.md`。

# 3. 设置集合权限
```bash
node scripts/set-launch-permissions.cjs    # users / routes / favorites / recitations
node scripts/set-favorites-permission.cjs  # 单独修 favorites（可选）
```

### 4. 数据迁移
```bash
# 1. 拉取原始数据
gh api repos/mbpz/poetry-atlas/contents/public/data/places.json --jq '.content' | base64 -d > data/places.json

# 2. 创建原生 NoSQL 集合 + 写入（通过 MCP）
node scripts/seed-native.cjs

# 3. 设置收藏集合权限（CUSTOM：仅本人读写）
node scripts/set-favorites-permission.cjs
```
或直接调用已部署的 `initData`。

### 5. （已移除）生成式 AI

个人主体类目下不提供 AI 问答 / 深度合成。原 `analyzePoem` 云函数已下线；诗词页仅展示数据集自带的注释、译文与赏析。

## 功能地图（类目：教育信息展示 + 备忘录）

| 功能 | 入口 | 状态 | 类目归属 |
|---|---|---|---|
| 地图浏览 + 诗词地点标记 + 朝代筛选 | 首页 | ✅ | 教育信息展示 |
| 朝代时间轴 / 热力模式 / 预设旅行路线 | 首页 | ✅ | 教育信息展示 |
| 地点详情 + 诗词分页 | 地点页 | ✅ | 教育信息展示 |
| 诗词详情 + 注释/译文/赏析（数据集原文） | 诗词页 | ✅ | 教育信息展示 |
| 多字段搜索 + 作者百科 | 搜索/作者页 | ✅ | 教育信息展示 |
| 朝代时间轴浏览 | 朝代页 | ✅ | 教育信息展示 |
| **我的旅行路线**（私有） | 我的页 | ✅ | 备忘录 |
| **诗词朗诵**（预设音频，无用户录音） | 诗词页 | ✅ | 教育信息展示 |
| **收藏**（私有） | 我的页 | ✅ | 备忘录 |
| 用户中心与关于 | 我的页 | ✅ | — |

> ⚠️ 合规约束：无 UGC 社区、无公开分享、无游戏化（段位/对战/商城），所有用户生成内容均为私有。符合个人主体「教育信息展示 / 备忘录」类目。

## Roadmap

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 环境搭建 + 小程序骨架 + CloudBase 初始化 | ✅ |
| M1 | 数据建模(6集合) + 安全规则 + 迁移入库 | ✅ |
| M2 | 地图核心(聚合云函数) + 地点/诗词/朝代页 | ✅ |
| M3 | 搜索(正则) + 作者 + 收藏 | ✅ |
| M4 | 时间轴 + 热力 + 旅行路线 | ✅ |
| M5 | 打磨诗词详情（数据集注释/译文/赏析） | ✅ |
| **M6** | 打磨收尾 + 全部页面连通 | **✅ 完成** |

> 原「AI 诗词解析」因个人主体审核限制已移除，不再作为产品能力。

## 产品定位

**工具-信息查询 / 旅游服务** 类目（个人主体可注册，非 UGC 社交）。

核心原则：**所有用户生成内容均为私有**（仅创建者本人可见，不对外公开分享），规避"社交-笔记"类目限制。

- 地图浏览 / 诗词 / 作者 / 朝代 → 展示预设开放内容（合规）
- 我的路线 / 收藏 / 朗诵记录 → **仅自己可见**（私有工具）
- 已移除公开社区 Feed / 答题对战 / 公开分享功能（避免 UGC 社交类目）

## 设计语言

水墨主题：米白宣纸底 `#f8f6f0` + 墨黑文字 + 朱砂红强调 `#8b1a1a` + 青灰辅助 `#2d5d7b`。

## 开源协议

数据集来源于[古诗文网 / 全唐诗 / 全宋词 / ctext.org](https://github.com/mbpz/poetry-atlas)等开放古诗词数据；代码参考[mbpz/poetry-atlas](https://github.com/mbpz/poetry-atlas)实现。联系邮箱：[mbpz.dev@googlemail.com](mailto:mbpz.dev@googlemail.com)。
