# Agent 3.16.1：流量采样乱序修复与滚动升级

验收：2026-10-19 15:35（北京时间）。Backend 保持 3.20.0-anytls，
Frontend 保持 3.19.0，本轮没有重建或替换面板镜像。

## 根因与代码修复

Agent 的周期流量采样，与每分钟执行的 forwarding DNS seal，可能并发读取核心累计计数。
即使没有转发规则，后者也可能执行。旧采样晚提交时，会把计数回退误判为核心重置，
从而将累计历史量再次记成新增用量；审计连接字节本身未因此膨胀。

3.16.1 使用现有核心生命周期锁串行保护完整的“读计数 → 提交基线”，
同时保护快照启用。没有更改计数重置语义、ACK、账本倍数或持久化格式。
不清空队列，不重置 sequence/generation，不通过丢弃历史掩盖问题。

确定性回归：基线 90，两次读取 100、110，旧实现乱序提交会计入 120；
修复后只计入 20。覆盖周期采样彼此竞争、周期采样与 forwarding seal 竞争、
以及启用快照等待生命周期锁。全部包的 race 测试、go vet，以及真实 patched
sing-box 的 Snell/accounting、原生审计流集成测试通过。

## 构建与镜像

- 主分支修复提交：`a410c35f6da47c66a1cbabebf0e36ed0e2057ead`。
- [AMD64 Actions](https://github.com/wuansg/remnawave-node-go/actions/runs/39210260572) 成功。
- 镜像：`ghcr.io/wuansg/remnawave-node-go:3.16.1@sha256:f1ddb648b59699659f7e52747bdd207a48ec68f05ffd3cf72497623e9d42199f`。
- Oracle 独立 ARM64 分支：`ops/oracle-arm64-3.16.1`，提交 `f1a6ec3515d83d4b0c27a7b9c684967b6f64e2f1`。
- [ARM64 Actions](https://github.com/wuansg/remnawave-node-go/actions/runs/39212472977) 成功。
- ARM64 镜像：`ghcr.io/wuansg/remnawave-node-go:3.16.1-arm64@sha256:24be8d8b20f40bcef15be52e12f1b37a96e0f8a684b296552dbbaf5dbeb33768`。

主工作流仍只构建 x64；独立手动 ARM64 构建不覆盖主标签。
版本号与镜像标签一致，所有节点继续使用 sing-box 1.14.0。

## 线上操作与验收

- Hytron 灰度后，依次升级其余在线节点，香港节点最后处理。
- 全部 12 台在线节点已运行 3.16.1：9 台 CORE_ACTIVE、3 台 FORWARDING_ONLY。
  无入站的纯转发节点仍不启动核心。停机 CloudSilk 保持原状，未尝试升级。
- 面板 expectedAgentVersion/expectedAgentImageTag 已同步；Oracle 使用 ARM64 标签。
- Compose 仅替换镜像，保留环境变量、挂载、网络、权限、启动参数及持久化数据卷。
  更新前保存 Compose、卷备份与校验和；验证失败保守回滚镜像，不回灌旧账本数据。
- 两台 AliHK、DWHK 与 Aiyun 的转发命名计数器保留，重建后计数未回退。
- 香港升级前将实际运行控制器的 Final 切到独立新加坡出口；全部健康后已恢复原选择。
- 最终面板侧入账 gap 为 0，节点待拉取快照为 0，近期采样与审计同步均成功，
  原 usage/audit generation 和 10 个已启用用户策略保留。
  运行中 ACK 后可能恰好产生一条新采样，应结合新鲜时间、序号推进和入账 gap 判断，
  不应将单条正常在途记录误判为停滞。

两类部署检查差异已处理：内部 API 密钥会在容器重建时正常轮换，配置比较仅排除
这两个预期临时密钥字段；精简系统使用原生 sh，API 健康检查读取实际 NODE_PORT，
不再固定假设 2222。保守回滚尝试的备份保留。

## Seednet 正式 DNS

经明确授权，直接更新现有独立 `singbox-seednet` 正式配置，无需新复制配置，
不迁移 Host 或改变入站、端口、用户权限。其他正式 profile 未修改。

原 UDP DNS 改为 IPv4-only Cloudflare DoH：主解析 `1.1.1.2`，另配置
`1.0.0.2` 可供切换；不是自动故障转移。二者均带恶意域名过滤，已在授权时说明。
DNS final 与 route.default_domain_resolver 使用新的主 DoH tag。

两个地址的 TLS 和真实 A 查询均通过；容器重建后核心直接出站 HTTP 204
连通检查通过，不再依赖旧 UDP DNS 路径。本轮未进行测速或硬件性能测试。
仅按已批准的 DNS 差异更新升级验收基线，原始基线及修复收据另行私有保存。

## 历史更正与隐私

只更正已明确授权并逐条验证的异常源快照。执行前完成私有全库备份、源哈希、
倍数和账期校验；事务内检查余额不下溢，并保留幂等、可逆更正收据。
用户/Host 账本按各自实际源计数更正，不用用户量代替整个入站量。
原始流量快照、审计记录、其他用户数据均不删除。

Agent 升级不会自动追溯重写历史账本。站点专用更正脚本、用户标识、访问内容、
精确流量和数据库备份均仅私有保存，不提交公共仓库。
