# CloudBase 云函数与文档数据库：排查方法与实战记录

> 面向本项目的 CloudBase（腾讯云开发）运维参考。整合「NoSQL 文档库是什么、和 SQL 有什么不同」与「线上资源部署/排查的第一手经验」。
> 环境：`online-d2gyjoohe58cc4936`（NoSQL 文档库，上海，`wx-server-sdk` + CloudBase MCP）。

---

## 1. CloudBase 是什么（一句话）

CloudBase = 腾讯云开发，为小程序提供的 Serverless 后端。本项目用它替代「自建 MySQL + 后端 API」：

| 能力 | 对应传统组件 | 本项目的用法 |
|---|---|---|
| NoSQL 文档数据库 | MySQL / PostgreSQL | 所有业务数据存储（13 个集合） |
| Cloud Functions | Node.js 后端服务（Express/Nest） | 10 个云函数，封装业务逻辑 |
| 内置 AI | 自部署 LLM 服务 | 诗词解析（混元 hy3，`analyzePoem`） |
| 对象存储 | OSS / S3 | **未使用**，图标全在本地 `images/` |

前端（小程序）通过 `wx.cloud.database()`、`wx.cloud.callFunction()` **直连**这套 Serverless 层，没有独立后端 API。

### 1.1 运行时后端选型

CloudBase 一套环境实际可能并存三种后端（通过 `envQuery action=info` 返回）：

- `EnvInfo.RuntimeMode`：`'nosql'` 或 `'postgresql'`（PG 已开通则为 postgresql）
- `EnvInfo.RuntimeBackends`：`{ postgresql, nosql, mysql }` 三个布尔值

**书写业务代码前必须先看这三项**：

```bash
npx mcporter call cloudbase.envQuery action=info envId=<envId> --output json
```

- 本环境是 `nosql`，所以安全规则用 NoSQL 语法（`doc._openid == auth.openid`）。
- 如果是 PG 环境，数据库部分要改用 `app.rdb()` + RLS（行级安全），NoSQL 安全规则依旧对 NoSQL 集合生效。

---

## 2. NoSQL 文档数据库 vs 关系型 SQL

CloudBase 文档库本质是 **MongoDB 兼容**的文档型 NoSQL。

### 2.1 核心抽象对比

| 概念 | 文档型（CloudBase） | 关系型（MySQL） |
|---|---|---|
| 存储单元 | **文档** = 一条 BSON/JSON 对象 | 行（row） |
| 文档的归类 | **集合（collection）** | 表（table） |
| 字段约束 | **无 schema**，同集合不同文档字段可不同 | 预定义列 + 类型 |
| 主键 | 自动 `_id`（或自定） | 自增 id / 业务主键 |
| 关联 | 靠嵌入数组 / `xxx_id` 反范式；不做 JOIN | `FOREIGN KEY` + `JOIN` |
| 查询 | `col.where({...}).orderBy().get()` | `SELECT ... WHERE ... JOIN` |
| 地理 | 原生 GeoJSON / 2dsphere 或标量 lng/lat | 需空间扩展 |
| 事务 | 支持但代价高，设计上避免 | 天然支持 |

### 2.2 为什么诗词地图选文档型

以 `places` 集合「杭州」这条为例（`seed.json`）：

```json
{
  "_id": "hangzhou",
  "name": "杭州",
  "location": { "type": "Point", "coordinates": [120.15, 30.25] },
  "dynasty_stats": { "宋": 62, "唐": 39, "明": 4 },
  "hot_poems": [
    { "title": "饮湖上初晴后雨", "author": "苏轼", "content": "..." },
    ...
  ]
}
```

同一句话里混着：GeoPoint、对象（`dynasty_stats`）、嵌套数组（`hot_poems`）。在 SQL 里至少要拆 **places / dynasty_stats / place_geo / place_poems** 四张表再 JOIN 回来；在文档库，**一次 `.get()` 就把整个地点+朝代+代表作全部带回来**——这正是按省/朝代聚合（`aggregateMap`）和地图点查询的核心便利。

### 2.3 文档型代价（什么时候不该用）

- **强事务/财务**：跨文档事务成本高。
- **复杂多表 JOIN 报表**：文档库要反复查或 `$lookup`，反不如 SQL。
- **严格 schema 约束**：文档无结构，易进脏数据（用云函数白名单效 + 种子脚本集中写入来规避）。

---

## 3. 文档数据库的查询/写入模式

### 3.1 前端（小程序）直接读写

封装在 `utils/cloudbase.js`：

```js
const db = wx.cloud.database()
const _ = db.command

// 等值 + 排序 + 分页
db.collection('poems')
  .where({ dynasty: '宋' })
  .orderBy('popularity', 'desc')
  .skip(offset).limit(PAGE_SIZE)
  .get()

// 命令运算符 > in > regexp > or
db.collection('places').where({
  'dynasty_stats.宋': _.gt(0)
}).get()

db.collection('poems').where(
  _.or([ { title: reg }, { content: reg } ])
).get()
```

关键对象：
- `_.gt / _.gte / _.lt / _.in` 等 → 替代 `> >= < IN`
- `_.or / _.and` → 替代 `OR / AND`
- `db.RegExp({ regexp, options:'i' })` → 子串正则
- `db.Geo.Point(lng, lat)` + `_.geoNear(...)` → 地理邻近查询

### 3.2 云函数内读写

云函数用 `wx-server-sdk`：

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const col = db.collection('places')
await col.where(cond).orderBy('poem_count', 'desc').limit(200).get()
```

- **前端与云函数访问的是同一份数据**（同一 envId），权限由云函数角色 + 集合安全规则共同决定。
- `cloud.getWXContext()` 可以拿到当前用户的 `OPENID`、`APPID`、`UNIONID`——仅在**真实微信客户端调用链**上有值（详见 §5.2）。

### 3.3 管理端（MCP）操作

运维/迁移直走 `npx mcporter call cloudbase.*`，读写走同一 NoSQL 库，但以管理员身份执行（绕过客户端安全规则）。详细工具清单见 §6。

---

## 4. Cloud Functions（云函数）

### 4.1 项目内的 10 个函数

| 函数 | 用途 | 入口动作 |
|---|---|---|
| `login` | 取 OPENID | 直接返回 wx context |
| `updateUser` | 用户字段更新 + stats 累加 | `{ stats }` |
| `searchPoems` | 多集合正则检索 | `{ type, keyword }` |
| `aggregateMap` | 地图按省聚合 / GeoNear 邻近 | `{ type, dynasty, lng, lat, radius_km }` |
| `analyzePoem` | AI 诗词解析（混元 hy3） | — |
| `routes` | 自建旅行路线 CRUD | `create / update / delete / list / detail` |
| `recitations` | 朗诵列表 / 播放计数 / 种子 | `list / recordPlay / seedRecitations` |
| `quiz` | 诗词对战（题库+判分） | `initQuiz / start / submit` |
| `community` | 社区 Feed / 发布 / 评论 / 点赞 / 关注 | `feed / publish / removePost / comments / comment / toggleLike / follow` |
| `initData` | 一次性种子迁移 | — |

函数代码布局：`cloudfunctions/<name>/{index.js, package.json, config.json, [questions.json]}`。

### 4.2 云函数的常见错误来源

| 错误 | 原因 | 解法 |
|---|---|---|
| 客户端拿不到 `openid` | 云函数未 `cloud.init`，或调用方未走微信客户端 | 确认 `cloud.DYNAMIC_CURRENT_ENV`；MCP invoke 拿不到 openid（见 §5.2） |
| `require('./xxx')` 本地文件丢失 | mcporter 打包时没包含 | 文件必须落在 `cloudfunctions/<name>/` |
| 函数超时 | 默认超时短 / 冷启动装依赖慢 | config 里调大 `timeout`（s）；复杂运算放客户端或预计算 |
| 云函数内写库写不进去 | 集合安全规则未放行（云函数写默认放行，但CUSTOM规则下仍受 `create/update/delete` 约束） | 重部署前先用管理端 MCP 直写验证 |

---

## 5. 排查方法论（最重要的一节）

### 5.1 先看返回的 Log，再看 success

`invokeFunction` 的返回结构：

```json
{
  "data": {
    "invokeResult": {
      "InvokeResult": 0,        // 0 = 云函数执行完毕（不代表逻辑成功！）
      "Log": "START ... \n ... \nEND",   // ← 真正定位问题的关键
      "Result": "{...}"         // 云函数 return 值的 JSON 字符串
    }
  }
}
```

**必须看 `Log`** 里的运行时日志，`Result` 才是真正的业务返回。本项目踩过：
- `InvokeResult:0` 但逻辑失败：quiz 第一次 invoke 的 `Result` 里是 `{ ok:false, error:"unknown action: undefined" }`——因为参数键名写错。

### 5.2 客户端调用 vs 服务端调用（根本差异）

本项目的一个核心认知：**同样的云函数，调起来源不同，行为完全不同**。

| 来源 | 调用方式 | `cloud.getWXContext().OPENID` | 能做什么 |
|---|---|---|---|
| 微信客户端（用户手机） | `wx.cloud.callFunction(...)` | ✅ 用户真实 openid | 触发全部需要 openid 的逻辑 |
| 云函数 A 调云函数 B | `cloud.callFunction(...)`（同 SDK） | ≈ 服务间上下文，通常无 openid | 一般不用 |
| 管理端 MCP | `manageFunctions action=invokeFunction` | ❌ null | 受「需要 openid 校验」的守卫排斥 |

**实战坑**：`recitations.seedRecitations` 内 `if (!openid) return { error: 'admin only' }`。用 MCP invoke → openid 为 null → 被拒。定位到这一点后，改为直写集合 `writeNoSqlDatabaseContent`。不是 bug，是守卫逻辑正常生效。

**排查套路**：当 invoke 返回权限/身份错误 → 先确认「这条 action 是否需要真实微信客户端身份」→ 是的话只能通过 `wx.cloud.callFunction` 触发，或改为管理端直写。

### 5.3 参数键名陷阱（invokeFunction）

mcporter 把 payload 的字段透传为云函数 `event`：

```bash
# ❌ 错误：event.action 拿不到
--args '{"action":"invokeFunction","functionName":"quiz","data":{"action":"initQuiz"}}'

# ✅ 正确：用 params，event.action = "initQuiz"
--args '{"action":"invokeFunction","functionName":"quiz","params":{"action":"initQuiz"}}'
```

同理，某些函数需要的字段（云函数内 `event.xxx`）也要放在 `params` 下，不要包在 `data` 里。

### 5.4 securityRule 字符串陷阱（managePermissions）

NoSQL 安全规则的 `securityRule` 必须是**字符串**（内嵌 JSON）：

```bash
# ❌ 直接把 JSON 放进去 → CLI 把它解析成对象，云端报 "Expected string, received object"
--args '{"action":"updateResourcePermission",...,"securityRule":{"read":"true",...}}'

# ❌ 用 Bash 拼字符串 → 内层引号把外层 JSON 顶破 → "Unable to parse --args"
--args "{...,\"securityRule\":\"{\\\"read\\\":...}\"}"

# ✅ Node spawnSync + JSON.stringify：既保字符串类型，又保 JSON 合法
node scripts/set-launch-permissions.cjs
```

**通用解法**：凡要把「嵌套 JSON 字符串」当参数，一律写 CJS 脚本用 `spawnSync` + `JSON.stringify`。项目内 `set-favorites-permission.cjs` / `set-launch-permissions.cjs` 都是这一模式的复用。

### 5.5 部署超时 ≠ 部署失败

`createFunction` 首次要装依赖（`npm install wx-server-sdk`），默认 mcporter 超时 60s 不够。

排查：
1. 调用侧报 `timed out after 60000ms`；
2. 立刻查 `queryFunctions action=listFunctions`；
3. 如果函数已 Active —— 只是调用侧等不及，**实际已成功**。

预防：设置环境变量 `MCPORTER_CALL_TIMEOUT=300000`，或单次 `--timeout 290000`。

### 5.6 常用排查命令速查

```bash
# 1. 环境状态
npx mcporter call cloudbase.auth action=status
npx mcporter call cloudbase.envQuery action=info envId=<envId>

# 2. 集合与文档数
npx mcporter call cloudbase.readNoSqlDatabaseStructure action=listCollections envId=<envId>

# 3. 已部署函数
npx mcporter call cloudbase.queryFunctions action=listFunctions envId=<envId>

# 4. 调用日志（排查运行时错误）
npx mcporter call cloudbase.queryFunctions action=listFunctionLogs envId=<envId> functionName=<name>

# 5. 函数入参 schema 反查
python3 -c "
import json
d=json.load(open('.mcporter-schema.json'))
t=[x for x in d['tools'] if x['name']=='<toolName>'][0]
print(json.dumps(t['inputSchema'], indent=2, ensure_ascii=False))
"

# 6. 某集合权限现状
npx mcporter call cloudbase.queryPermissions action=getResourcePermission \
  envId=<envId> resourceType=noSqlDatabase resourceId=<collectionName>
```

---

## 6. MCP 工具与参数对照表

写入类慎用，优先用本项目的 CJS 脚本封装。

| 工具 | 关键动作 | 入参要点 |
|---|---|---|
| `readNoSqlDatabaseStructure` | `listCollections` | `envId` |
| `writeNoSqlDatabaseStructure` | `createCollection` / `updateCollection`（索引）/ `deleteCollection` | `{ envId, collectionName }`；索引见 §3 Step 4 |
| `readNoSqlDatabaseContent` | 只读查询 | — |
| `writeNoSqlDatabaseContent` | `insert` / `update` / `delete` | `{ envId, collectionName, documents:[...] }` |
| `manageFunctions` | `createFunction` / `updateFunctionCode` / `invokeFunction` / `deleteFunction` | `func` + 顶层 `functionRootPath`（create）；`params:{action}`（invoke）|
| `queryFunctions` | `listFunctions` / `listFunctionLogs` / `getFunctionDetail` | `envId` + `functionName` |
| `managePermissions` | `updateResourcePermission` | `resourceType=noSqlDatabase` + `permission=CUSTOM` + `securityRule`（字符串）|
| `queryPermissions` | `getResourcePermission` | 查现状 |
| `envQuery` | `info`（后端选型） | `envId`；返回 `RuntimeMode` / `RuntimeBackends` |
| `auth` | `status` | 验证通道 |

> `.mcporter-schema.json` 包含全部工具/动作的枚举与嵌套 schema，是参数写法的最终权威来源。

---

## 7. 本项目集合与安全规则一览（当前终态）

### 7.1 业务集合（13 个）

| 集合 | 文档数 | 产生方式 |
|---|---|---|
| places | 164 | 种子写入 |
| poems | 491 | 种子写入 |
| authors | 134 | 种子写入 |
| dynasties | 12 | 种子写入 |
| favorites | 0 | 用户运行时 |
| users | 0 | 用户运行时 |
| routes | 0 | 用户运行时 |
| recitations | 5 | 种子写入（占位朗诵） |
| quiz_questions | 200 | 种子写入（题库） |
| posts | 2 | 种子（占位）/ 用户运行时 |
| comments | 1 | 种子（占位）/ 用户运行时 |
| likes | 2 | 种子（占位）/ 用户运行时 |
| follows | 1 | 种子（占位）/ 用户运行时 |

另有 3 个 CloudBase 系统集合（`sys_user` / `sys_department` / `relation_data_depart`），由平台自动创建，**勿删勿改**。

### 7.2 安全规则矩阵

| 集合 | read | create | update | delete |
|---|---|---|---|---|
| places / poems / authors / dynasties | `true` | 默认 | 默认 | 默认 |
| favorites | `doc._openid == auth.openid` | `auth.openid != null` | `doc._openid == auth.openid` | `doc._openid == auth.openid` |
| routes / recitations / posts / comments / likes / follows / quiz_questions | `true` | `auth.openid != null` | `doc._openid == auth.openid` | `doc._openid == auth.openid` |
| users | `doc._openid == auth.openid` | `auth.openid != null` | `doc._openid == auth.openid` | `doc._openid == auth.openid` |

---

## 8. 新集合/新函数上线 Checklist（模板）

增加业务功能时，按本次经验应走完：

1. **探查**：`listCollections` / `listFunctions` 看现状。
2. **建集合**：`writeNoSqlDatabaseStructure action=createCollection`。
3. **部署函数**：`manageFunctions action=createFunction`，注意 `functionRootPath` 是**父目录**。
4. **下发规则**：`managePermissions` 用 CJS 脚本保字符串类型。
5. **建索引**：`updateCollection + CreateIndexes`。
6. **种子数据**：
   - 有客户端身份需求的 action → 改用 `writeNoSqlDatabaseContent` 直写；
   - 纯服务端可跑的 action → `invokeFunction` with `params`。
7. **验证**：`listCollections` 看 Count，`readNoSqlDatabaseContent` 抽查，`listFunctionLogs` 看调用。
8. **记录**：脚本入库 + 更新本文档。

---

## 9. 参考资料

- CloudBase NoSQL 文档：https://docs.cloudbase.net/database/
- CloudBase 安全规则：https://docs.cloudbase.net/database/security-rules
- CloudBase 云函数安全规则：https://docs.cloudbase.net/cloud-function/security-rules
- 环境后端选型（RuntimeMode 解读）：mcporter `.mcporter-schema.json` 内 `envQuery` 描述
- 本文档的实战脚本：`scripts/set-launch-permissions.cjs` / `scripts/seed-recitations-direct.cjs`
- 详细操作日志：`docs/cloudbase-operations-log.md`
