# 流量页面用户入口发布

用户授权部署：Frontend `3.18.1`，打包进 Backend `3.19.1-anytls`。
本轮只改变前端交互与面板镜像版本，不修改后端业务逻辑、Contract、数据库迁移或 Agent。

- 用户统计排行与图表、单节点/多节点及内部组流量中的用户点击，直接打开用户流量详情。
- Host 用户流量排行补充点击入口，打开该用户的 Host 流量视图。
- 保留来源页面的日期区间、总量/上传/下载筛选。普通用户管理等非流量入口不变。
- Frontend/lock 版本号同步为 3.18.1；面板/lock 同步为 3.19.1，避免覆盖已发布镜像标签。
- 新增五类入口的组件交互回归，并验证默认当天、清空筛选、按用户名解析、
  未解析用户不打开错误详情、普通用户信息入口不变。已接入 GitHub Actions。

发布流程：推送 GitHub 版本标签，待正式前端和 amd64 面板镜像及相关回归通过后，
备份 HostDZire SG 的数据库、Compose、环境和动态基线，再切换固定版本标签加摘要。
启动检查失败恢复旧镜像和 Compose，不自动回滚数据库。

本地类型检查、生产构建、新增入口回归、日期预设、方向流量显示及节点编辑回归通过。
线上结果在本文件追加实际提交、Actions、镜像摘要、备份与验收。

## 部署完成（2026-10-15，北京时间）

- HostDZire SG 面板已部署 Backend `3.19.1-anytls`，内置 Frontend `3.18.1`。
- Backend 源提交 `c7113ef30553f9cf497939be558d55d707e0dce3`；Frontend 源提交
  `34aa98cd59716bea15e93c25ddb271e18d42ebbd`，正式标签 `3.18.1`。
- 固定镜像：`ghcr.io/wuansg/backend:3.19.1-anytls@sha256:05e0e760fc6772ebfad98dfd3e2b29bd930d711edfc9730a145febc54b6b8224`。
  已核对 amd64、OCI 版本、前后端提交；未覆盖既有版本镜像标签。
- Contract 保持 `3.19.0-anytls.0`，Agent 保持原版本，没有节点重建或数据库迁移。

成功 Actions：

- [Frontend 正式版本](https://github.com/wuansg/frontend/actions/runs/38763344582)
- [入口、类型/构建和 UI 回归](https://github.com/wuansg/frontend/actions/runs/38763344851)
- [日期筛选回归](https://github.com/wuansg/frontend/actions/runs/38763344722)
- [Backend 数据库回归](https://github.com/wuansg/backend/actions/runs/38763354331)
- [正式面板镜像](https://github.com/wuansg/backend/actions/runs/38763365028)

备份：`/opt/remnawave/backups/release-3.19.1-20261015/`，包含原 Compose、环境、容器信息、
动态基线及 PostgreSQL custom dump（约 20 MiB，`pg_restore --list` 499 项）。
dump SHA256：`e3b973514f064bf1610270a53eb906173462162e1c7168576fc429e91ea1cc14`。
旧 `3.19.0-anytls` 镜像及全部既有备份均保留。

线上验收：

- 公网 HTML 和新入口 JS 均 HTTP 200，与部署 bundle 匹配；实际 JS 包含新的日期、方向及 Host 视图参数。
- 面板 healthy、restarts 0；API、worker、scheduler 全部 online、restarts 0。
- 只重建面板容器，Agent、数据库、缓存、Nginx 等其余容器 ID 不变。Compose 只修改面板镜像。
- 原在线 12 台节点保持在线，Profile、入站、转发配置与版本不变；CloudSilk 保留已知停机状态。
  流量快照 generation 未变、gap/pending 为 0、近期同步正常，已用流量没有下降。
- 环境与 APP_SECRET 原样保留；审计策略逐字段与发布前相同，未自动开启或关闭任何用户。
- 数据库迁移及其原校验值完全不变；没有创建灰度批次或主动强制重启核心。
- 部署前后均使用临时最小只读凭据核验用户名解析（200），以及用户节点/Host 流量详情
  的总量、上传、下载六种组合（全部 200），没有打印个人流量数据或查询真实访问历史。
- 临时 Token 和缓存已清理。容器内临时基线副本已删除，可从上面的私有备份恢复。
- 切换后的 SSH 收尾连接短暂断开一次；已只读重连，确认版本、部署收尾文件、公网和全部验收正常，未回退镜像。
