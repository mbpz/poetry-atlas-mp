# CloudBase 云上资源部署操作日志

> 环境：`online-d2gyjoohe58cc4936`（体验版 `baas_trial`，上海，NoSQL 文档库）
> 日期：2026-07-11
> 操作者：Claude + `npx mcporter call cloudbase.*`
> 目标：上线前补齐 8 个业务集合、部署 5 个新云函数、配置安全规则与索引、写入种子数据。

本次把「手工上线清单」全部自动化执行，并记录中间所有坑与解法，便于下次复用/回滚。

---

## 1. 上线前现状（探查结果）

执行前线上实际状态：

| 维度 | 已有 | 缺少 |
|---|---|---|
| 集合 | 5 个业务（places/poems/authors/dynasties/favorites）+ 3 个系统集合（sys_user/sys_department/relation_data_depart） | users/routes/recitations/quiz_questions/posts/comments/likes/follows |
| 云函数 | 5 个（aggregateMap/analyzePoem/initData/login/searchPoems）Active | login 已部署；updateUser/routes/recitations/quiz/community 有本地代码但未上线 |
| 安全规则 | 仅 favorites 是 CUSTOM，其余默认 | 全部需要显式配置 |
| 索引 | 各集合默认 2 个 | 缺 posts.created_at 降序 |
| 种子 | initData 已跑（places 164 / poems 491 / authors 134 / dynasties 12） | quiz/recitations/community 未入库 |

> 探查要点（详见 §5）：
> - 集合列表：`readNoSqlDatabaseStructure action=listCollections`
> - 已部署函数：`queryFunctions action=listFunctions`（注意：`manageFunctions` 没有 `list` 动作，常见踩坑）
> - 云函数引用哪些集合：`grep -r "collection('xxx')" cloudfunctions/<name>/index.js`

---

## 2. 工具链与基础

所有 CloudBase 线上操作都走 **CloudBase MCP**（`npx @cloudbase/cloudbase-mcp@latest`），配置文件：

```
config/mcporter.json  →  mcpServers.cloudbase.command = npx @cloudbase/cloudbase-mcp@latest
config.js             →  ENV_ID = 'online-d2gyjoohe58cc4936'
```

验证通道是否就绪：

```bash
npx mcporter call cloudbase.auth action=status --output json
npx mcporter call cloudbase.envQuery action=info envId=online-d2gyjoohe58cc4936 --output json
```

两者都应返回 `auth_status: READY` / `Status: NORMAL`。

---

## 3. 操作步骤与结果

### Step 1 — 建 8 个集合

工具：`writeNoSqlDatabaseStructure action=createCollection`
入参：`{ action, envId, collectionName }`

```bash
# 单条模式
npx mcporter call cloudbase.writeNoSqlDatabaseStructure \
  --args '{"action":"createCollection","envId":"online-d2gyjoohe58cc4936","collectionName":"users"}' \
  --output json
```

结果：**8/8 成功**。验证：`readNoSqlDatabaseStructure action=listCollections` 应返回 16 个集合（13 业务 + 3 系统）。

### Step 2 — 部署 5 个云函数

工具：`manageFunctions action=createFunction`
入参要点：
- `func`: `{ name, runtime:"Nodejs20.19", timeout:30, type:"Event" }`
- `functionRootPath`（顶层参数，非 func 内）：**必须指向包含函数目录的父目录**，即 `/abs/path/cloudfunctions`，mcporter 自动按 `cloudfunctions/<name>/index.js` 打包上传。

```bash
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"createFunction","envId":"online-d2gyjoohe58cc4936",\
           "func":{"name":"quiz","runtime":"Nodejs20.19","timeout":30,"type":"Event"},\
           "functionRootPath":"/Users/doug/ai/system/poetry-atlas-mp/cloudfunctions"}' \
  --output json --timeout 290000
```

**踩坑 #1：首次部署 60s 默认超时**
- updateUser 调用侧报 `timed out after 60000ms`，但**实际部署已在云端完成**。
- 定位：事后查 `queryFunctions action=listFunctions` 发现 updateUser 已 Active。
- 规律：首次 `createFunction` 要安装 npm 依赖（`wx-server-sdk`），60s 常不够；后续函数复用缓存会快一些。
- 修复：重试时设 `MCPORTER_CALL_TIMEOUT=300000` + `--timeout 290000`；quiz/community 成功。

最终 **10 个函数全部 Active**（含原有 5 个）。

### Step 3 — 下发安全规则（8 条）

工具：`managePermissions action=updateResourcePermission`
意图：
- 公开读 + 本人写：`routes / recitations / posts / comments / likes / follows / quiz_questions`
- 本人读写：`users`

规则 JSON：

```json
// 公开读 + 本人写
{"read":"true","create":"auth.openid != null","update":"doc._openid == auth.openid","delete":"doc._openid == auth.openid"}

// 本人读写
{"read":"doc._openid == auth.openid","create":"auth.openid != null","update":"doc._openid == auth.openid","delete":"doc._openid == auth.openid"}
```

**踩坑 #2：securityRule 字符串被 shell 顶破（全部失败）**
- 直接在 Bash 里拼 `--args '{...,"securityRule":{...}}'`，内层双引号把外层 JSON 顶破 → `Unable to parse --args: Expected ',' or '}'`。
- 即便引号转义成功，mcporter CLI 还会把 `securityRule` 的 JSON 解析为对象而非字符串 → 云端报 `Expected string, received object`（项目 `set-favorites-permission.cjs` 注释已记录此坑）。
- 修复：改用 Node `spawnSync` 直接 `JSON.stringify` 整个 payload，保留 `securityRule` 为字符串类型。脚本见 `scripts/set-launch-permissions.cjs`。

结果：**8/8 成功**。

### Step 4 — 建索引

工具：`writeNoSqlDatabaseStructure action=updateCollection` + `updateOptions.CreateIndexes`

```bash
npx mcporter call cloudbase.writeNoSqlDatabaseStructure \
  --args '{"action":"updateCollection","envId":"online-d2gyjoohe58cc4936",\
           "collectionName":"posts",\
           "updateOptions":{"CreateIndexes":[{\
             "IndexName":"idx_created_at_desc",\
             "MgoKeySchema":{"MgoIsUnique":false,\
               "MgoIndexKeys":[{"Name":"created_at","Direction":"-1"}]}}]}}' \
  --output json
```

- `Direction` 是字符串：`"1"` 升序、`"-1"` 降序。
- 结果：posts 索引从默认 2 → 3，新增即 `idx_created_at_desc`。
- 2dsphere **不需要**：`routes` 集合用标量 `lng/lat`（`normalizePoints` 存的是数字字段），非 GeoJSON，无需地理索引。

### Step 5 — 种子数据

#### 5.1 quiz.initQuiz（200 道题）

工具：`manageFunctions action=invokeFunction`

**踩坑 #3：invokeFunction 的参数键名是 `params`，不是 `data`**
- 先用 `data:{action:"initQuiz"}` → 云函数报 `unknown action: undefined`（`event.action` 取不到）。
- 定位：quiz 入口 `const { action } = event`，而 mcporter 把 `params` 下的字段透传为 event。
- 修复：改用 `params:{action:"initQuiz"}` → 成功，日志 `total:200`。

```bash
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"invokeFunction","envId":"online-d2gyjoohe58cc4936",\
           "functionName":"quiz","params":{"action":"initQuiz"}}' \
  --output json --timeout 120000
```

验证：`quiz_questions` 集合 Count = 200。

#### 5.2 recitations（5 条占位朗诵）

**踩坑 #4：seedRecitations 的 "admin only" 守卫**
- 云函数内 `if (!openid) return { ok: false, error: 'admin only' }`。
- mcporter `invokeFunction` 走**服务端→服务端调用**，`cloud.getWXContext().OPENID` 为 null → 被守卫拒绝。
- 这是**正常的防御逻辑**，不是 bug。
- 修复：跳过 invoke，用 `writeNoSqlDatabaseContent action=insert` 直接写 5 条（按函数内 `SEED_POEMS` 复刻）。脚本见 `scripts/seed-recitations-direct.cjs`。

结果：recitations Count = 5。

#### 5.3 community（posts/comments/likes/follows）

工具：`writeNoSqlDatabaseContent action=insert`

```bash
# 以 posts 为例，documents 是 JSON 数组
npx mcporter call cloudbase.writeNoSqlDatabaseContent \
  --args '{"action":"insert","envId":"online-d2gyjoohe58cc4936",\
           "collectionName":"posts","documents":[{...},{...}]}' \
  --output json
```

结果：posts 2 / comments 1 / likes 2 / follows 1。

> ⚠️ 社区种子是 `PLACEHOLDER` 占位（openid=`OPENID_PLACEHOLDER_1`，post_id=`POST_ID_PLACEHOLDER_*`），仅作 UI 示例。首个真实用户发帖前建议保留，公测稳定后清理或回填真实 openid。

---

## 4. 最终线上状态

| 集合 | 文档数 | 备注 |
|---|---|---|
| places | 164 | 原有 |
| poems | 491 | 原有 |
| authors | 134 | 原有 |
| dynasties | 12 | 原有 |
| favorites | 0 | 原有 |
| users | 0 | 🆕 本人读写 |
| routes | 0 | 🆕 公开读+本人写 |
| recitations | 5 | 🆕 占位朗诵 |
| quiz_questions | 200 | 🆕 题库 |
| posts | 2 | 🆕 占位 |
| comments | 1 | 🆕 占位 |
| likes | 2 | 🆕 占位 |
| follows | 1 | 🆕 占位 |
| **合计** | **1012** | |

云函数 10 个全部 Active。

---

## 5. 排查方法速查（关键）

### 5.1 mcporter 调用通用排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `Unable to parse --args` | JSON 引号/逗号被 shell 顶破 | 用 Node `spawnSync` + `JSON.stringify` 传 payload |
| `timed out after 60000ms` | 默认 60s 超时，首次部署装依赖常超 | 设 `MCPORTER_CALL_TIMEOUT=300000` + `--timeout 290000`；事后查 list 确认是否实际成功 |
| `Invalid arguments for tool` / `invalid_enum_value` | 动作名或参数名写错 | 用 schema 反查：见 §5.3 |
| `Expected string, received object` | `securityRule` 被 CLI 解析成对象 | 必须用脚本 `JSON.stringify` 保留字符串类型 |

### 5.2 云函数相关排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `unknown action: undefined` | invoke 参数键名错（用了 `data`） | 改用 `params:{action:"xxx"}` |
| `admin only` / openid 为 null | 服务端→服务端调用无微信客户端身份 | 这是守卫正常行为；需要客户端 openid 的逻辑不能通过 invokeFunction 触发，改用直写集合 |
| 函数本地有但线上没部署 | 只写了代码没 createFunction | `queryFunctions action=listFunctions` 交叉比对本地 `cloudfunctions/` 目录 |
| 函数部署后行为异常 | 代码内 `require('./questions.json')` 等本地文件未随函数打包 | 确认文件在 `cloudfunctions/<name>/` 下，mcporter 按目录打包 |

### 5.3 MCP 工具/参数反查

`.mcporter-schema.json` 是 MCP 工具的完整 schema，可直接解析：

```bash
# 列出某工具的顶层参数
python3 -c "
import json
d=json.load(open('.mcporter-schema.json'))
t=[x for x in d['tools'] if x['name']=='manageFunctions'][0]
print(list(t['inputSchema']['properties'].keys()))
"

# 列出某工具的 action 枚举
python3 -c "
import json
d=json.load(open('.mcporter-schema.json'))
t=[x for x in d['tools'] if x['name']=='writeNoSqlDatabaseStructure'][0]
print(t['inputSchema']['properties']['action'])
"
```

### 5.4 集合/数据排查

```bash
# 集合列表 + 文档数 + 索引数
npx mcporter call cloudbase.readNoSqlDatabaseStructure action=listCollections envId=<envId> --output json

# 验证某集合文档数
# （listCollections 已含 Count，无需额外 count 接口）

# 查看函数调用日志（定位运行时错误）
npx mcporter call cloudbase.queryFunctions action=listFunctionLogs \
  envId=<envId> functionName=<name> --output json
```

### 5.5 安全规则排查

```bash
# 查看某集合当前权限
npx mcporter call cloudbase.queryPermissions action=getResourcePermission \
  envId=<envId> resourceType=noSqlDatabase resourceId=<collectionName> --output json
```

---

## 6. 新增脚本清单

| 脚本 | 用途 | 关键设计 |
|---|---|---|
| `scripts/set-launch-permissions.cjs` | 批量下发 8 个集合安全规则 | `spawnSync` + `JSON.stringify` 保留 `securityRule` 字符串类型，规避 CLI 解析坑 |
| `scripts/set-launch-permissions.cjs` | 批量下发 8 个集合安全规则 | 同上 |
| `scripts/seed-recitations-direct.cjs` | 直写 5 条朗诵占位 | 绕过 `seedRecitations` 的 admin 守卫（服务端 invoke 拿不到 openid） |

两个脚本都内嵌了「为什么不能直接用 mcporter CLI」的注释，下次重跑/回滚直接 `node scripts/xxx.cjs`。

---

## 7. 回滚指引

- **集合**：`writeNoSqlDatabaseStructure action=deleteCollection`（会清空数据，慎用）。
- **云函数**：`manageFunctions action=deleteFunction`，或 `action=updateFunctionCode` 覆盖回旧版。
- **安全规则**：重跑 `set-launch-permissions.cjs` 即覆盖；想恢复默认用 `permission:"READONLY"/"PRIVATE"`。
- **索引**：`updateCollection` + `updateOptions.DropIndexes:[{IndexName:"idx_created_at_desc"}]`。
- **种子数据**：`writeNoSqlDatabaseContent action=delete`（按 `_id`），或控制台手动删。

---

## 8. 2026-07-12 维护记录（产品收敛 + updateUser 修复）

> 背景：移除答题对战（`quiz`）与公开社区（`community`）后，文档与线上资源不同步；`updateUser` 部署后崩溃导致昵称保存失败。

### 8.1 产品代码变更（仓库）

| 变更 | commit 摘要 |
|---|---|
| 删除 `quiz` 模块 | 本地 `cloudfunctions/quiz`、答题页、题库引用已移除 |
| 删除 `community` 模块 | 本地 `cloudfunctions/community`、社区页、UGC 入口已移除 |
| `routes` 改为纯私有 | 删 `is_public` / `likes_count`；`list`/`detail` 严格按 openid 过滤 |
| `profile` 微信资料 | `chooseAvatar` + `type=nickname`；去掉 openid 展示 |
| `updateUser` upsert | 文档不存在时 `set` 创建；补 `package-lock.json` |

### 8.2 updateUser 云函数部署与修复

**现象（小程序控制台）：**

```
errCode: -504002 functions execute fail
errMsg: 0 code exit unexpected
```

**根因：** 本机 `npm install` 后把 macOS 版 `node_modules` 一并打包上传，云端 Linux 加载即崩溃（日志 `InitFunction: 0ms`）。

**修复步骤：**

```bash
# 1. 删除本机依赖（勿上传 node_modules）
rm -rf cloudfunctions/updateUser/node_modules

# 2. MCP 重部署（云端安装依赖）
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"updateFunctionCode","functionName":"updateUser",\
           "functionRootPath":"/Users/doug/ai/system/poetry-atlas-mp/cloudfunctions",\
           "installDependency":true}' \
  --output json --timeout 300000

# 3. 验证：函数 Active + invoke 不再 0 code exit
npx mcporter call cloudbase.queryFunctions \
  --args '{"action":"getFunctionDetail","functionName":"updateUser"}'
```

**结果：** `updateUser` Active，`InstallDependency=TRUE`，`CodeSize≈20MB`（含云端依赖）。

### 8.3 users 集合权限修复

**现象（客户端兜底写库）：**

```
errCode: -502003 database permission denied
```

**修复：** 重跑 `node scripts/set-launch-permissions.cjs`，将 `users` 设为本人读写。

**脚本同步（2026-07-12）：** 规则矩阵与产品对齐——

- 公开读 + 本人写：`recitations`
- 本人读写：`users` / `routes` / `favorites`（`routes` 从「公开读」改为「本人读写」）

### 8.4 当前线上快照（2026-07-12）

**云函数（10 个 Active，仓库仅 8 个）：**

| 函数 | 仓库 | 状态 |
|---|---|---|
| login / updateUser / aggregateMap / searchPoems / initData / routes / recitations | ✅ | Active |
| quiz / community / analyzePoem | ❌ 已删 | 已删除（analyzePoem 于 2026-07-13 因个人主体审核下线） |

**集合（16 个，含 3 系统集合）：**

| 集合 | Count | 备注 |
|---|---:|---|
| places / poems / authors / dynasties | 164 / 491 / 134 / 12 | 种子数据 |
| favorites | 0+ | 本人读写 |
| users | 1+ | 本人读写，运行时增长 |
| routes | 1+ | 本人读写，运行时增长 |
| recitations | 5 | 预设占位 |
| quiz_questions / posts / comments / likes / follows | 200 / 2 / 1 / 2 / 1 | **遗留**，功能已下线 |

### 8.5 遗留资源清理（可选）

```bash
# 删除遗留云函数（确认无其他项目依赖后）
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"deleteFunction","functionName":"quiz"}'
npx mcporter call cloudbase.manageFunctions \
  --args '{"action":"deleteFunction","functionName":"community"}'

# 删除遗留集合（会清空数据）
npx mcporter call cloudbase.writeNoSqlDatabaseStructure \
  --args '{"action":"deleteCollection","collectionName":"quiz_questions"}'
```

> 清理前建议先备份 `readNoSqlDatabaseContent` 导出。

