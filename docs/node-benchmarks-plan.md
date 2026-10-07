# 节点硬件与网络测试

状态：Backend `3.15.2-anytls` 和 Frontend `3.15.0` 已部署 HostDZire SG；
aiyun 灰度通过后，全部 13 台 Agent 已更新并上报 `3.15.0` / `node_benchmarks_v1`。
12 台 x64 使用正式镜像，Oracle Japan 使用独立 GitHub ARM64 镜像；所有测试仅手动触发。
更新日期：2026-10-07（Asia/Shanghai）。已在 aiyun 执行明确预算的小范围测试；
没有执行全城市满载测速。详见 [发布记录](./release-3.15.2.md)。
剩余节点升级没有触发新测试；原 Profile、入站、核心/转发模式、配置哈希及数据卷均保留。
AliHK 和 YH AliHK 为 1.2 GiB 小盘，空闲空间不足 1 GiB，磁盘测试会按安全限制跳过。

## 目标与入口

复用现有“网络地理检测”的入口位置和交互方式：在节点详情中并列增加
“硬件性能测试”和“网络测速”操作，点击打开各自弹窗，不增加单独的导航页面。
弹窗可选择测试项目、目标城市、源 IP/网卡、
IPv4/IPv6、流量预算，展示进度、取消操作、历史结果及相同测试条件下的对比。
支持 CORE_ACTIVE、FORWARDING_ONLY、IDLE，不依赖 sing-box 是否运行。
本功能只测节点自身；Host/代理链路端到端测试不混入本轮结果。

## 默认城市目录（用户已确认，共 12 个）

- 香港。
- 新加坡。
- 日本：东京、大阪。
- 美国：洛杉矶、西雅图、达拉斯、纽约。
- 欧洲：伦敦、法兰克福、阿姆斯特丹、巴黎。

城市目录与实际端点分开管理。端点记录运营方、城市、下载/上传 URL 和使用政策来源；
管理员可在网络测速弹窗内修改并持久化。任务保存当时的目标配置快照。
首版使用 HTTP(S) 下载和运营方明确提供的上传接口，不对下载地址自动 POST 数据。
不能用 GeoDNS/Anycast/CDN 就近节点冒充指定城市；必须记录实际服务端 IP。
目标不可用显示失败，管理员可改为同城市已核验备用端点，不静默改到其他地区。
默认端点于 2026-10-06 完成接口核验：12 个下载地址 HEAD 均返回 200；5 个
LibreSpeed 上传接口分别接受了 1 KiB 请求。此核验不等于各生产节点的路由/速度保证。

| 城市 | 默认运营方 | 下载 | 上传 |
| --- | --- | --- | --- |
| 香港 | Simcentric | 是，官方 HTTP 文件 | 暂无 |
| 新加坡、东京、大阪、西雅图、达拉斯、巴黎 | Vultr | 是，官方固定城市文件 | 暂无 |
| 洛杉矶、纽约、伦敦、法兰克福、阿姆斯特丹 | Clouvider / LibreSpeed | 是 | 是 |

不支持上传的城市明确显示“不支持”，不替换成其他城市或 Cloudflare Anycast。
要测试这些城市的上传，需要管理员填入同城市有权使用的上传接收端。

## 测试指标

### 硬件

- CPU：固定算法的单线程/多线程吞吐，记录算法版本、线程数、架构和容器资源限制。
- 内存：sysbench 顺序写入，每线程 1 MiB 缓冲区、累计最多 4 GiB 内存操作，
  不是分配 4 GiB 内存。短样本结果不能泛称物理内存极限。
- 磁盘：fio 顺序读写、4K 随机读写、IOPS、延迟；记录块大小、队列深度和引擎。
- 磁盘仅在 `BENCHMARK_STATE_PATH` 下创建独立临时目录和 64 MiB 文件，
  累计测试写入最多 128 MiB；文件预先 truncate，禁止 fio 创建/预填充文件。
  不访问裸设备或已有文件。首轮未写满时不继续读取稀疏文件，避免虚假高分。
- 独立限制文件占用与累计写入量；不清系统页缓存。direct I/O 不支持则明确失败，
  不能悄悄切换成缓存测试。结果标明测试的挂载路径，不把 Docker overlay 吞吐
  直接当作主机磁盘性能。

### 网络

- 延迟：5 次 TCP 连接耗时。ICMP RTT/丢包不包含在首版。
- TCP 连接失败率与 ICMP 丢包率分别命名，不互相替代。
- 连接耗时的 p50/p95、成功/失败/实际尝试次数、最大值减最小值的 spread；
  不称为纯链路 RTT。DNS/TLS/TTFB 独立拆分留作后续增强。
- 吞吐：从被测节点视角分别记录上传、下载 Mbps、应用层字节、时长和远端 IP。
  首版单连接，吞吐时长包含连接建立和响应过程，不等同于链路峰值带宽。
- 上传和下载分阶段执行，避免互相抢占带宽。不支持上传的端点显示“不支持”。
- 默认 IPv4；IPv6 单独运行并记录，不悄悄回退。可绑定本机源 IP/网卡。
- 直连测试不经过 sing-box、Host 或宿主机 HTTP_PROXY；实际系统网络路由仍影响结果。

## 已实施的安全与资源预算

- 只支持手动触发，不实现定时设置或自动测速调度。
- 同节点最多一个硬件/网络任务；全局默认最多两个节点同时执行。
- 网络快速档每方向最多 32 MiB、每阶段最多 10 秒；12 城市最多 768 MiB 应用层数据。
  握手、重传等会额外占用网络流量。数据量不足的短样本标注，不能称为峰值带宽。
- 可手动调整为每方向 1–256 MiB、每阶段 1–15 秒；开始前必须确认资源/流量上限。
- CPU 默认单线程，最多 8 线程；内存缓冲区每线程 1 MiB，检查 cgroup 内存余量。
- 磁盘测试检查可用空间、预留空间及写入预算；低优先级执行，不保证对业务零影响。
- cgroup PSI 压力过高、内存余量不足、磁盘可用空间小于 1 GiB 时跳过并解释。
  检测不到 cgroup PSI 时只应用其他资源限制，不声称能识别所有业务负载。
  支持排队取消、运行取消及进程组终止；Agent 全任务最多 10 分钟。
- 测试工具随 Alpine 3.22 镜像安装，构建时校验能运行，结果保存工具版本；
  本次验证 sysbench 1.0.20、fio 3.39。禁止在线下载/执行任意 shell 测试脚本。
- 端点由管理员或有对应写入 Scope 的 API token 管理；协议/端口白名单、防命令注入
  和 DNS rebinding，拒绝环回、link-local、云 metadata 等地址。首版不提供私有端点豁免。
- 使用现有 RBAC/API scopes 和 Agent JWT/mTLS；创建/取消/目标编辑输出带 actor UUID
  的结构化操作日志，不记录凭据或完整 URL。结果/工具输出有大小上限。

## 数据与执行架构

1. Contract：测试类型、限制、目标、任务状态、结果 Schema 和能力标记。
2. Agent：`internal/benchmark` 异步启动/查询/取消，独立于核心启动流程；任务 ID 幂等。
   结果以原子文件和 fsync 持久化；重启标记中断并清理已识别的 fio 临时文件。
   仅读取 UUID 命名的任务 JSON，不碰同目录其他配置文件；损坏记录隔离为 `.invalid`
   并保留失败标记，重试不会自动重跑/重复消耗流量，也不阻断节点启动。
3. Backend：`node_benchmarks` / `benchmark_targets` 专用表，使用 PostgreSQL 持久队列、
   advisory lock 和租约协调最多两个任务，每 2 秒轮询短请求；不挂在 core health 中。
   数据库部分唯一索引保证同节点最多一个活跃任务。协调器重启可恢复，12 分钟
   无法恢复的任务终止；取消状态不被随后到达的 RUNNING 轮询覆盖。
4. Frontend：硬件卡片、城市结果表、预算确认、进度/取消、错误详情、历史对比。
5. 历史最多 100 次/节点、90 天，在创建任务/Agent 初始化时清理。
   保留工具版本、参数、目标 IP、时间、源接口、硬件测试时的负载/cgroup 限制。
   只有请求参数和端点快照相同的结果才提供上次结果对比。
6. 测试上传/下载单独计数，不进入用户/Host 的代理流量统计。主机网卡计数及供应商
   账单仍包含测速流量，面板说明清楚，不通过修改真实网卡计数“扣除”。
7. 不将历史测试结果仅塞入 metadata；metadata 可放最新任务引用，结果入专用表。

## 实施状态与验证

- A–D 已实现：Contract/API、数据库任务、Agent 执行、端点目录和前端弹窗。
- 本地 Backend/Contract 构建、Frontend 类型检查和生产构建通过。
- 新 Frontend 锁文件的离线 `npm ci` 验证通过，未修改或跳过 integrity 校验。
- Frontend Oxlint 原生检查器在宿主、Alpine 和 Debian 隔离环境均内部崩溃
  （`oxc_allocator/src/pool/fixed_size.rs`），因此该项尚未完成，不记为通过。
  当前 Frontend 发布工作流使用已通过的 `tsc` / Vite 构建，没有绕过 CI 检查。
- PostgreSQL 17 临时数据库中正式迁移通过；多实例并发上限、同节点互斥、排队晋级、
  持久记录、幂等轮询、跨节点隔离、取消及取消竞态回归通过。
- Agent `go test ./...`、`go vet ./...` 通过；覆盖请求预算、私有/混合 DNS 地址拒绝、
  地址族不回退、禁用代理/重定向、上传/下载字节上限、重启和安全临时文件清理。
- 已验证无核心 Manager 时 Node API 仍可执行测试流程，且未认证请求返回 401。
- 隔离 Alpine 3.22 容器中 CPU、内存、fio 四阶段及进程取消/文件清理测试通过。
  GitHub Actions 已加入 Agent 硬件工具回归、Backend 参数测试。
- 首轮 Contract 独立构建发现根项目环境掩盖了 WHATWG `URL` 类型缺失，已在两套
  Contract tsconfig 中显式加入 DOM 标准类型并重新发布；以独立 Actions 的结果为准。
- Frontend 发布补齐 `contents: write` 并使用自动工作流令牌，不再依赖缺失的 PAT；
  支持对既有版本标签手动重发资产，不移动原版本标签。
- Backend 启动回归创建真实 Nest 模块、Controller 和 Guards；另外构造去掉
  CqrsModule 的负例，确认能捕获 QueryBus 注入失败。数据库健康不能代替 REST
  健康，部署验收必须检查未认证的新接口返回 401 及公网网站返回 200。
- Benchmark 协调器在首次请求 Agent 前初始化 JWT/mTLS/SNI；并发共享初始化，
  失败后允许重试。测试覆盖初始化顺序、并发一次、失败不得下发与恢复后重试。

## 发布与灰度结果

- Frontend/Agent `3.15.0`，Contract `3.15.0-anytls.0`；Backend 修复版 `3.15.2`。
  Backend `3.15.0-anytls` 无法启动 REST，`3.15.1-anytls` 未初始化 Benchmark
  节点认证；保留不可变标签，但正式发布应使用 `3.15.2-anytls`。
- 已按 Contract → Frontend → Backend 镜像顺序发布，Agent 镜像独立发布。
  正式 Contract release 资产的 integrity 与 Frontend 锁文件一致；Backend
  镜像中的 Frontend 提交、实际功能包标记和版本均已核验。
- 发布时同步 Frontend、Backend、Contract、Agent 版本号及镜像标签，不复用旧标签。
  本次全部使用 GitHub Actions 构建的 x64 镜像及固定摘要，未复制本地二进制部署。
- aiyun 单线程 CPU/内存各最多 2 秒、fio 四阶段各最多 5 秒完成；fio 仅使用
  64 MiB 独立文件、累计写入最多 128 MiB，临时目录已清理。
- 新加坡和法兰克福 TCP 延迟及下载、法兰克福上传完成：每可测方向 1 MiB，
  共 3 MiB 应用层数据；新加坡上传如实显示不支持。这不是峰值带宽测试。
- 运行中取消成功；Agent 受控重启后 5 条历史恢复，真实 JWT/mTLS/SNI GET
  结果与数据库对比通过。整数、字符串和状态精确比较，浮点测量允许 1e-12
  的末位相对舍入差异。测试没有自动重跑。
- 最终网站 HTTP 200、REST 未认证 401、容器无自动重启；13/13 节点在线，
  snapshot gap/pending 均为 0，没有活动 Benchmark 或残留诊断 API token。
  APP_SECRET/环境文件保持不变，数据库/Compose/环境备份保留。
- 当前面板在 HostDZire SG，不在旧 nlfra；后续升级 DWHK 前按用户约定切走实际代理
  客户端 Final，验收后恢复。任何节点升级均不得自动触发测速。

## 后续增强（不在首版承诺范围）

- 为剩余 7 个城市配置获准上传端点、可选受控 iperf3 和同城市备用端点。
- DNS/TLS/TTFB 独立指标、可选 ICMP 丢包、多连接吞吐、端点可用性校验日期展示。
- 更细致的业务负载保护和独立持久审计表。
- 已发现的既有问题：全新安装默认 Profile 为 `inbounds: []`，但 seed 的
  syncInbounds 会拒绝空入站，导致首次 seed 失败。本次测试以独立合法 Profile
  模拟有现存配置的升级，未连接生产数据；此问题需单独修复，不记为首安装通过。

## 工具参考

- iperf3 官方参数：https://software.es.net/iperf/invoking.html
- fio 官方文档：https://fio.readthedocs.io/en/master/fio_doc.html
- 香港官方测试文件：https://www.simcentric.com/looking-glass/
- 固定城市上传/下载接口目录：https://librespeed.org/backend-servers/servers.php
- 现有集成点：Agent `internal/geocheck`、`internal/httpapi/server.go`、
  Backend Geocheck scheduler/queue、Frontend 节点详情。
