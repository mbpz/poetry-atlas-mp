# 实施任务

- [ ] 1. [Android 定位失败分类与引导恢复](https://github.com/mbpz/poetry-atlas-mp/issues/3)
  - 建立定位状态机、错误分类、设置返回重试和非敏感诊断。
  - 覆盖主流 Android 权限与系统定位异常。
  - _Requirements: R1, R5_

- [ ] 2. [无定位情况下的地图降级体验](https://github.com/mbpz/poetry-atlas-mp/issues/4)
  - 提供手动选城、默认视野和继续浏览路径。
  - 确保拒绝授权不会阻断地图发现。
  - _Requirements: R1, R3_

- [ ] 3. [语料质量审计与发布门禁](https://github.com/mbpz/poetry-atlas-mp/issues/5)
  - 检测冲突、疑似截断、缺字段、重复、异常字符和来源缺失。
  - 输出机器可读及人工审阅报告。
  - _Requirements: R2, R5_

- [ ] 4. [规范诗词模型与确定性导入](https://github.com/mbpz/poetry-atlas-mp/issues/6)
  - 引入规范 ID、来源、全文/节选状态、哈希和版本。
  - 替换首次命中的冲突处理策略并消除正文副本漂移。
  - _Requirements: R2_

- [ ] 5. [校订高曝光诗词并版本化发布](https://github.com/mbpz/poetry-atlas-mp/issues/7)
  - 修复已发现冲突、明显截断和错误作品。
  - 每项修订绑定可信来源与审核记录。
  - 安全部署校订语料，完成计数、抽样、前后版本核验和失败回滚。
  - _Requirements: R2, R5_

- [ ] 6. [导航外壳与安全区成熟化](https://github.com/mbpz/poetry-atlas-mp/issues/8)
  - 完成五入口 TabBar、选中态、图标、点击热区和安全区验收。
  - 关联并关闭现有 #1、#2 的重叠与缺失问题。
  - _Requirements: R3_

- [ ] 7. [地图发现核心路径成熟化](https://github.com/mbpz/poetry-atlas-mp/issues/9)
  - 打磨地图浮层、地点进入、返回上下文和异常恢复。
  - 验收地图 -> 地点 -> 诗词完整路径。
  - _Requirements: R1, R3_

- [ ] 8. [搜索、阅读与收藏核心路径成熟化](https://github.com/mbpz/poetry-atlas-mp/issues/10)
  - 统一搜索结果、详情可信信息、收藏反馈及各类状态。
  - 验收搜索 -> 诗词/作者/地点 -> 收藏完整路径。
  - _Requirements: R2, R3, R4_

- [ ] 9. [个人中心、收藏与私人路线闭环](https://github.com/mbpz/poetry-atlas-mp/issues/11)
  - 打磨资料、收藏、路线创建/查看/删除状态和防重复提交。
  - 验收个人中心 -> 收藏/路线 -> 详情完整路径。
  - _Requirements: R4_

- [ ] 10. [跨设备产品发布质量门槛](https://github.com/mbpz/poetry-atlas-mp/issues/12)
  - 建立自动检查、预览、设备矩阵、弱网冒烟和发布清单。
  - 汇总定位、语料与核心路径的非敏感质量信号。
  - _Requirements: R4, R5_
