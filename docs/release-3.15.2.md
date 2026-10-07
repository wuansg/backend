# 节点硬件与网络测试发布 — 2026-10-07

## 部署版本

- 面板 HostDZire SG：Backend `3.15.2-anytls`，源码 `54bf489d`，
  镜像摘要 `sha256:be6dff3ca6ee9c4b6939a3ff5bf249c285329c65c6fde6db5e50c163216a1f0a`。
  [Backend Actions](https://github.com/wuansg/backend/actions/runs/37569722913) 通过。
- Frontend `3.15.0`；镜像内 main 提交 `43eb3031`，版本标签源码 `8058cf89`。
  [Frontend Actions](https://github.com/wuansg/frontend/actions/runs/37567721066) 通过。
  标签未移动，正式 ZIP 由 GitHub 构建；修复的工作流使用自动令牌及 contents:write。
- Contract `3.15.0-anytls.0`；[Contract Actions](https://github.com/wuansg/backend/actions/runs/37567307020)
  通过，正式资产 integrity 与 Frontend 锁文件一致。
- 仅 aiyun Agent 升级为 `3.15.0`，源码 `3ef04200`，镜像摘要
  `sha256:584cec59ee281aaf23ef44419eb7e17fdf6aac51276ccf0949da2d45b188223b`。
  [Agent Actions](https://github.com/wuansg/remnawave-node-go/actions/runs/37567201190) 通过，
  包括竞态、硬件工具、Snell 及用户计数回归。Sing-box 仍为 `1.14.0`。
- 其他 Agent 镜像未改变。本轮所有应用部署均使用 GitHub 镜像，版本标签附固定摘要。

## 入口与功能

节点详情的网络地理检测旁增加硬件和网络按钮；旧 Agent 显示升级提示。
手动触发、预算确认、排队/进度、取消、历史和相同条件比较，以及全局城市端点管理。
12 个城市默认支持 TCP 延迟和下载，5 个提供获准上传接口；其余城市如实显示不支持，
可由管理员配置同城市上传接收端。没有定时任务、Anycast 城市替代或代理链路混测。

## 发布中修复

- Contract 显式声明 WHATWG URL 标准类型，独立构建不再借用根项目 Node 类型。
- 首次 Backend 3.15.0 的 REST Guard 缺少 CqrsModule，造成 API 重启和短时 502；
  当即恢复 3.14.1 旧镜像，未恢复旧数据，也未修改 APP_SECRET。
- 3.15.1 补齐模块依赖及真实 Controller/Guard 初始化正负例，并通过隔离镜像 API
  验收后部署。随后 aiyun 灰度识别到 REST 协调器缺少 JWT/mTLS 初始化，任务未下发。
- 3.15.2 在 Agent 请求前共享初始化 JWT/mTLS/SNI，失败可重试；加入初始化顺序、
  并发一次和错误恢复回归。不放宽 SNI 或证书校验。
- 3.15.0/3.15.1 Backend 标签未覆盖，但不作为此功能正式部署版本。
  数据库健康不代表 REST 可用：本轮另验收公网 200 和未认证 Benchmark 接口 401。

## aiyun 灰度结果

- 保持原 Profile、空入站、FORWARDING_ONLY、无核心运行、1 条启用转发规则；
  forwarding hash `c3b16488cdf6fbf4146dc980947d14e047ad7c0286a26c4b1e0d5325c8ef7028`
  未变。nft 上下行累计计数在更新及重启后保持。
- CPU/内存各最多 2 秒、单线程完成；工具 sysbench 1.0.20。
- fio 3.39 顺序写/读、4K 随机写/读均完成，各阶段最多 5 秒；64 MiB 独立文件，
  累计写入最多 128 MiB；临时目录已删除，不访问旧文件或裸盘。
- 新加坡、法兰克福各 5 次 TCP 连接均成功；各下载 1 MiB，法兰克福上传 1 MiB，
  共 3 MiB 应用层流量。新加坡上传明确不支持。短样本不能用于判断峰值带宽。
- 正式 CPU/内存任务 `b2dc4f74-823d-4471-9d51-38c164fd0e57`；网络任务
  `8647e496-0455-46f6-8c67-e923083c32d1`；磁盘任务
  `7cae05a5-3009-44be-a46e-a7516221e2a9`，均 COMPLETED。
- 初次认证失败任务及运行中取消回归均 CANCELLED；不存在活动任务。
- Agent 受控重启后 5 条记录恢复；通过真实 JWT/mTLS/SNI 查询并对比数据库结果。
  状态、字符串和整数计数精确一致；浮点仅允许 JSON 持久化末位舍入（1e-12 相对容差）。
- 最终面板健康/公网 200，13/13 节点在线，所有 snapshot gap/pending 为 0、
  lastError 为空。临时 API token、认证缓存、隔离测试容器/卷/网络已清理。

## 备份与已知待办

- 面板 `/opt/remnawave/backups/release-3.15.0-20261007/` 保存升级前 Compose、
  私有环境文件及 PostgreSQL custom dump；dump 6.2 MiB、可读性检查通过。
  APP_SECRET 及生产环境文件与备份逐字一致。
- aiyun `/root/remnanode-backups/release-3.15.0-20261007/docker-compose.pre.yml`。
- 全新安装默认空 Profile 的 seed 与 syncInbounds 校验不一致，是本轮隔离验收
  暴露的既有问题。测试用独立合法 Profile 模拟升级，未连接生产数据；需单独修复。
- 其余 7 城市上传接收端、细分 DNS/TLS/TTFB、ICMP/多连接测速仍为后续增强。
  本地 Oxlint 原生崩溃未解决，不记作通过；类型/构建及最终 Actions 已通过。
