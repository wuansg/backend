# Surge 官方图标发布

用户授权部署 Frontend `3.18.2`，打包进 Backend `3.19.2-anytls`。
只修改前端图标与面板镜像版本，不改后端业务、Contract、迁移或 Agent。

- 使用 Surge 官网实际提供的蓝色波形图标，原始 PNG 内置到共享 SurgeLogo 组件，运行时无外链依赖。
- 桌面/手机菜单、通用核心标识、模板卡片、外部组模板和 Host 表单共六处统一替换占位图标。
- 原图 SHA256：`579c7fc9e1022003d88cedc2b4632f90236dfd90c9c280c166d69c147e99e684`。
  [官方来源](https://nssurge.com/static/media/surge-mac-icon.b58bcbd47e5747ba3284.png)。
- 本地图标完整性、React/Mantine 深浅色 SSR、尺寸与样式、六处引用一致性回归通过；
  类型检查、生产构建、原用户流量跳转和方向显示回归通过，新增检查已接入 Actions。

发布流程：GitHub 正式前端和 amd64 面板镜像构建及回归通过后，备份 HostDZire SG
数据库、Compose、环境与动态基线，再使用版本标签加固定 digest 更新面板容器。
保留旧镜像及备份；启动检查失败恢复旧镜像，不自动恢复旧数据库。
不更新节点、不更改入站、转发、审计策略或 APP_SECRET。

实际提交、Actions、镜像摘要和线上验收结果在部署完成后追加。

## 部署完成（2026-10-17，北京时间）

- HostDZire SG 面板运行 Backend `3.19.2-anytls`，内置 Frontend `3.18.2`。
- Backend 源提交 `c90c63e87ab95e727e3f3f88b5851c9d096017c0`；Frontend 源提交
  `5bfe5cd5734d1b39b259bff743b90345280d3b24`，正式标签 `3.18.2`。
- 固定镜像：`ghcr.io/wuansg/backend:3.19.2-anytls@sha256:aa1b3e1041a89ff0c3f049028649ea732994b1d619be20d4b5c9c15aa1578b03`。
  amd64、OCI 版本和前后端提交标签均已核对；全部资产由 GitHub 构建，无服务器代码复制构建。
- Backend 仅版本/锁文件和发布文档变更；Contract、Agent、数据库结构与后端业务逻辑不变。

成功 Actions：

- [Frontend 正式版本](https://github.com/wuansg/frontend/actions/runs/39021428473)
- [图标、类型/构建及 UI 回归](https://github.com/wuansg/frontend/actions/runs/39021428430)
- [日期筛选回归](https://github.com/wuansg/frontend/actions/runs/39021428417)
- [Backend 数据库回归](https://github.com/wuansg/backend/actions/runs/39021431817)
- [正式面板镜像](https://github.com/wuansg/backend/actions/runs/39021438762)

备份目录 `/opt/remnawave/backups/release-3.19.2-20261017/` 包含原 Compose、环境、容器信息、
动态基线与 PostgreSQL custom dump（约 25 MiB，`pg_restore --list` 499 项）。
dump SHA256：`1ab165b72c26b4a5d18846fda3de7ab9e591ed0be40ff6b0497018f92d78bd73`。
保留旧 `3.19.1-anytls` 固定镜像及全部既有备份，未执行镜像/卷清理。

线上验收：

- 公网 HTML 与入口 JS 均 HTTP 200，匹配新部署版本；公网 JS 中的图标 PNG SHA256 与官方图标完全一致。
- 面板 healthy、restarts 0；API、worker、scheduler 全部 online、restarts 0。
- 只重建面板，其余容器 ID 不变；原在线 12 台节点仍在线，配置、Profile、入站、转发与版本不变。
  CloudSilk 保留原停机状态，没有升级 Agent 或主动强制重启核心。
- 所有原在线节点流量快照 generation 保留、gap/pending 为 0、近期同步无错误，已用流量没有下降。
- 环境、APP_SECRET、审计策略原样保留；迁移及原校验值不变，没有新建发布批次。
- 用户解析及用户节点/Host 的总量、上传、下载六种组合均 HTTP 200，既有流量查看功能未回退。
- 临时只读 Token 和缓存已清理；容器内临时基线副本已删除，私有备份仍保留可恢复。

## 单独记录的既有告警

收尾核验发现 taipei101 的审计同步停留在 **2026-10-16 13:30:32（北京时间）**，
状态提示 `Audit sync interrupted; gaps may exist. Existing proxy traffic is unaffected.`。
从升级前的 custom dump 中只读提取该节点 `node_access_audit_state`，确认成功时间、
错误信息及状态与升级后完全一致，不是本轮图标更新产生。

该节点当前在线、核心与流量快照正常；其余 11 个在线节点审计同步正常。
部署验收只对这一个已由备份证明的旧异常显式报告警告，没有忽略其他异常或修改应用审计校验。
本轮没有更改节点审计配置、重启该节点或修复此问题；需另行诊断处理。
