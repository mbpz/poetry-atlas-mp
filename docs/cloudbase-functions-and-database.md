# CloudBase 云函数与文档数据库：排查方法与实战记录

> 面向本项目的 CloudBase（腾讯云开发）运维参考。整合「NoSQL 文档库是什么、和 SQL 有什么不同」与「线上资源部署/排查的第一手经验」。
> 环境：`online-d2gyjoohe58cc4936`（NoSQL 文档库，上海，`wx-server-sdk` + CloudBase MCP）。
> 最后同步：**2026-07-12**

---

## 1. CloudBase 是什么（一句话）

CloudBase = 腾讯云开发，为小程序提供的 Serverless 后端。本项目用它替代「自建 MySQL + 后端 API」：

| 能力 | 对应传统组件 | 本项目的用法 |
|---|---|---|
| NoSQL 文档数据库 | MySQL / PostgreSQL | 业务数据存储（8 个活跃集合 + 遗留集合） |
| Cloud Functions | Node.js 后端服务 | **7 个**云函数（仓库内），封装业务逻辑 |
| 内置 AI | 自部署 LLM 服务 | **已下线**（个人主体审核：不提供深度合成 / AI 问答） |
| 对象存储 | OSS / S3 | 用户头像（`avatars/` 前缀，`wx.cloud.uploadFile`） |

前端（小程序）通过 `wx.cloud.database()`、`wx.cloud.callFunction()` **直连**这套 Serverless 层，没有独立后端 API。

### 1.1 运行时后端选型

```bash
npx mcporter call cloudbase.envQuery action=info envId=online-d2gyjoohe58cc4936 --output json
```

- 本环境 `RuntimeMode = nosql`，安全规则用 NoSQL 语法（`doc._openid == auth.openid`）。
- 若是 PG 环境，新业务推荐 `app.rdb()` + RLS；已存在的 NoSQL 集合规则仍独立生效。

---

## 2. NoSQL 文档数据库 vs 关系型 SQL

CloudBase 文档库本质是 **MongoDB 兼容**的文档型 NoSQL。

| 概念 | 文档型（CloudBase） | 关系型（MySQL） |
|---|---|---|
| 存储单元 | **文档** = 一条 BSON/JSON 对象 | 行（row） |
| 文档的归类 | **集合（collection）** | 表（table） |
| 字段约束 | **无 schema**，同集合不同文档字段可不同 | 预定义列 + 类型 |
| 主键 | 自动 `_id`（或自定） | 自增 id / 业务主键 |
| 关联 | 嵌入数组 / `xxx_id` 反范式 | `FOREIGN KEY` + `JOIN` |
| 地理 | 原生 GeoJSON / `_.geoNear` | 需空间扩展 |

以 `places` 集合「杭州」为例：一次 `.get()` 即可拿到 GeoPoint、`dynasty_stats`、`hot_poems` 嵌套数组——这正是 `aggregateMap` 和地图点查询的核心便利。

---

## 3. 文档数据库的查询/写入模式

### 3.1 前端（小程序）直接读写

封装在 `utils/cloudbase.js`：

```js
const db = wx.cloud.database()
const _ = db.command

db.collection('poems')
  .where({ dynasty: '宋' })
  .orderBy('popularity', 'desc')
  .skip(offset).limit(PAGE_SIZE)
  .get()
```

关键对象：`_.gt / _.in / _.or`、`db.RegExp`、`db.Geo.Point` + `_.geoNear`。

### 3.2 云函数内读写

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const openid = cloud.getWXContext().OPENID  // 仅微信客户端调用链有值
```

### 3.3 管理端（MCP）操作

运维/迁移走 `npx mcporter call cloudbase.*`，以管理员身份执行（绕过客户端安全规则）。

---

## 4. Cloud Functions（云函数）

### 4.1 仓库内 7 个函数（当前产品）

| 函数 | 用途 | 入参（event） | 返回 | 关联集合 | 小程序调用 |
|---|---|---|---|---|---|
| `login` | 静默登录，取 OPENID 并 upsert 用户档案 | 无 | `{ openid, appid, unionid, user }` | `users` | `app.js` |
| `updateUser` | 更新昵称/头像/stats；文档不存在则创建 | `nickname?`, `avatar_url?`, `gender?`, `bio?`, `stats?` | `{ ok, user? \| error? }` | `users` | `pages/profile/profile.js` |
| `searchPoems` | 多集合正则搜索 | `keyword`, `type?`, `limit?` | `{ ok, data: { poems, authors, places }, total }` | `poems`, `authors`, `places` | `pages/search/search.js` |
| `aggregateMap` | 地图聚合 / 邻近 / 地点列表 | `type`, `dynasty?`, `lng?`, `lat?`, `radius_km?`, `keyword?`, `limit?` | `{ ok, data[], total }` | `places` | `pages/index/index.js`（`type=province`） |
| `routes` | 私有旅行路线 CRUD | `action`: `create\|update\|delete\|list\|detail` + 对应字段 | `{ ok, data? \| _id? \| error? }` | `routes` | 路线相关页面 |
| `recitations` | 朗诵列表 / 播放计数 | `action`: `list\|recordPlay` | `{ ok, data? \| error? }` | `recitations`, `poems` | `pages-sub/info/poem/poem.js` |
| `ttsPoem` | 即时朗读（腾讯云基础 TTS） | `poem_id` 或 `text`, `voice?` | `{ ok, audio_url, fileID, duration, cached }` | `poems`, `tts_cache` + 云存储 | `pages-sub/info/poem/poem.js` |
| `initData` | 一次性种子迁移 | 无 | `{ ok, results }` | `places`, `poems`, `authors`, `dynasties` | 仅运维 invoke |

`ttsPoem` 需配置环境变量 `TTS_SECRET_ID` / `TTS_SECRET_KEY`（腾讯云 API 密钥，开通[语音合成](https://cloud.tencent.com/product/tts)）。同诗同音色会缓存到云存储与 `tts_cache`。

函数目录布局：`cloudfunctions/<name>/{index.js, package.json, [config.json], [package-lock.json]}`。

**部署要点（updateUser 踩坑总结）：**

```bash
# 1. 不要上传本机 node_modules（macOS 二进制在 Linux 云端会 0 code exit unexpected）
rm -rf cloudfunctions/updateUser/node_modules

# 2. 用 functionRootPath 指向父目录，让云端 InstallDependency
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"updateFunctionCode","functionName":"updateUser",\
           "functionRootPath":"/abs/path/poetry-atlas-mp/cloudfunctions",\
           "installDependency":true}' \
  --output json --timeout 300000
```

或微信开发者工具：右键 `cloudfunctions/updateUser` → **上传并部署：云端安装依赖**。

### 4.2 已下线函数

| 函数 | 说明 |
|---|---|
| `analyzePoem` | 生成式 AI 诗词解析；**2026-07-13 因个人主体审核（深度合成类目未开放）已从仓库与云端删除** |
| `quiz` / `community` | 答题对战 / 公开社区；产品收敛时已删除 |

### 4.3 常见错误来源

| 错误 | 原因 | 解法 |
|---|---|---|
| `-504002` / `0 code exit unexpected` | 上传了本机 `node_modules` 或依赖未安装 | 删本地 `node_modules`，`installDependency: true` 重部署 |
| `no openid`（MCP invoke） | 管理端调用无微信客户端身份 | 正常；需 openid 的逻辑只能 `wx.cloud.callFunction` |
| `-502003 database permission denied` | 集合 CUSTOM 规则未放行客户端写 | 跑 `node scripts/set-launch-permissions.cjs` |
| `unknown action: undefined` | invoke 用了 `data` 而非 `params` | 改用 `params:{ action:"xxx" }` |
| `Expected string, received object` | `securityRule` 被 CLI 解析成对象 | 用 CJS 脚本 `JSON.stringify` 传参 |

---

## 5. 排查方法论

### 5.1 先看 Log，再看 success

`invokeFunction` 的 `InvokeResult: 0` 只表示函数跑完，**不代表业务成功**。必须看 `Log` 和 `RetMsg`。

### 5.2 客户端 vs 管理端调用

| 来源 | `OPENID` | 适用场景 |
|---|---|---|
| `wx.cloud.callFunction` | ✅ 真实 openid | 用户档案、路线、收藏等 |
| MCP `invokeFunction` | ❌ null | 仅适合不依赖身份的运维 action |

### 5.3 常用排查命令

```bash
# 环境
npx mcporter call cloudbase.auth action=status
npx mcporter call cloudbase.envQuery action=info envId=online-d2gyjoohe58cc4936

# 集合
npx mcporter call cloudbase.readNoSqlDatabaseStructure \
  --args '{"action":"listCollections","limit":50}'

# 函数
npx mcporter call cloudbase.queryFunctions --args '{"action":"listFunctions"}'
npx mcporter call cloudbase.queryFunctions \
  --args '{"action":"listFunctionLogs","functionName":"updateUser","limit":5}'
npx mcporter call cloudbase.queryFunctions \
  --args '{"action":"getFunctionLogDetail","requestId":"<id>"}'
```

---

## 6. MCP 工具速查

| 工具 | 关键动作 | 入参要点 |
|---|---|---|
| `readNoSqlDatabaseStructure` | `listCollections` / `describeCollection` | `collectionName` |
| `writeNoSqlDatabaseContent` | `insert` / `update` / `delete` | `documents: [...]` |
| `manageFunctions` | `createFunction` / `updateFunctionCode` / `invokeFunction` | `functionRootPath` = `cloudfunctions/` 父目录 |
| `managePermissions` | `updateResourcePermission` | `securityRule` 必须是**字符串** |
| `queryFunctions` | `listFunctions` / `listFunctionLogs` / `getFunctionDetail` | `functionName` |

> 完整 schema：`.mcporter-schema.json`

---

## 7. 文档数据库集合（当前终态）

### 7.1 活跃业务集合（8 个）

| 集合 | 文档数¹ | 说明 | 产生方式 |
|---|---:|---|---|
| `places` | 164 | 地点（GeoPoint + 朝代统计 + hot_poems） | `initData` / `seed-native.cjs` |
| `poems` | 491 | 诗词全文 + 关联地点 | 同上 |
| `authors` | 134 | 作者生平 + 代表作 | 同上 |
| `dynasties` | 12 | 朝代时间轴 | 同上 |
| `favorites` | 0+ | 用户收藏（私有） | 用户运行时 |
| `users` | 0+ | 用户档案（昵称/头像/stats） | `login` + `updateUser` |
| `routes` | 0+ | 私有旅行路线 | `routes` 云函数 |
| `recitations` | 5 | 预设朗诵占位（`audio_url` 可为空） | `seed-recitations-direct.cjs` |

¹ 文档数为 2026-07-12 线上快照；`users`/`routes`/`favorites` 随用户使用增长。

另有 3 个 CloudBase **系统集合**（`sys_user` / `sys_department` / `relation_data_depart`），平台自动创建，**勿删勿改**。

### 7.2 遗留集合（功能已下线，线上仍存在）

| 集合 | 文档数 | 说明 |
|---|---:|---|
| `quiz_questions` | 200 | 答题对战题库（已移除） |
| `posts` | 2 | 社区 Feed 占位 |
| `comments` | 1 | 社区评论占位 |
| `likes` | 2 | 社区点赞占位 |
| `follows` | 1 | 社区关注占位 |

可保留作历史数据，或通过控制台 / MCP `deleteCollection` 清理。

### 7.3 核心文档结构（Schema 参考）

**`users`**（`_id` = openid）

```json
{
  "_id": "<openid>",
  "_openid": "<openid>",
  "nickname": "",
  "avatar_url": "cloud://.../avatars/xxx.jpg",
  "created_at": 1718000000000,
  "stats": { "routes_count": 0, "recitation_count": 0 },
  "gender": "",
  "bio": ""
}
```

**`favorites`**

```json
{
  "_openid": "<openid>",
  "poem_id": "<poem _id>",
  "poem_title": "",
  "poem_author": "",
  "created_at": 1718000000000
}
```

**`routes`**（仅创建者可见）

```json
{
  "openid": "<openid>",
  "name": "江南春行",
  "theme": "",
  "description": "",
  "points": [
    { "name": "杭州", "lng": 120.15, "lat": 30.25, "poem_title": "", "poem_author": "", "poem_content": "", "note": "" }
  ],
  "created_at": 1718000000000
}
```

**`recitations`**

```json
{
  "poem_id": "<poem _id>",
  "audio_url": "",
  "duration": 0,
  "voice": "preset",
  "play_count": 0,
  "created_at": 1718000000000
}
```

### 7.4 安全规则矩阵（当前产品）

| 集合 | read | create | update | delete |
|---|---|---|---|---|
| `places` / `poems` / `authors` / `dynasties` | `true`（默认） | 默认 | 默认 | 默认 |
| `recitations` | `true` | `auth.openid != null` | `doc._openid == auth.openid` | `doc._openid == auth.openid` |
| `users` / `routes` / `favorites` | `doc._openid == auth.openid` | `auth.openid != null` | `doc._openid == auth.openid` | `doc._openid == auth.openid` |

下发脚本：

```bash
node scripts/set-launch-permissions.cjs   # users / routes / favorites / recitations
node scripts/set-favorites-permission.cjs # 单独修 favorites（与上脚本规则相同，可二选一）
```

---

## 8. 新集合/新函数上线 Checklist

1. **探查**：`listCollections` / `listFunctions`
2. **建集合**：`writeNoSqlDatabaseStructure action=createCollection`
3. **部署函数**：`updateFunctionCode`，`functionRootPath` 指向 `cloudfunctions/` 父目录；**勿上传本机 node_modules**
4. **下发规则**：`node scripts/set-launch-permissions.cjs`
5. **种子数据**：运维直写 `writeNoSqlDatabaseContent`，或 `invokeFunction`（需确认是否需要 openid）
6. **验证**：`getFunctionDetail` + `listFunctionLogs` + 小程序真机调用
7. **记录**：更新本文档 + `docs/cloudbase-operations-log.md`

---

## 9. 参考资料

- CloudBase NoSQL：https://docs.cloudbase.net/database/
- 安全规则：https://docs.cloudbase.net/database/security-rules
- 云函数错误码：https://docs.cloudbase.net/error-code/basic/FUNCTIONS_EXECUTE_FAIL
- 微信头像昵称填写：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html
- 项目脚本：`scripts/set-launch-permissions.cjs` / `scripts/seed-recitations-direct.cjs` / `scripts/seed-native.cjs`
- 操作日志：`docs/cloudbase-operations-log.md`
