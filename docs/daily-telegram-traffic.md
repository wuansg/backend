# Telegram 每日流量日报（Backend 3.17.0）

- Backend scheduler 配置启用，无节点测速、硬件测试或 Agent 升级。
- 默认 UTC 00:10（北京时间 08:10），统计前一完整 UTC 自然日；启动时补发当日应发但未创建的昨日汇总，不生成此前所有历史日报。
- 接收现有 `service` 或 `users` 通知会话，支持 `chat_id:thread_id`，不改变其他通知。
- 包含用户消耗/活跃用户数、节点 outbound、去重 Host 入口、独立 nft 转发的上传/下载/总量；总量/上传/转发节点排行；生成时在线/积压/异常提示。历史未拆分字节单独说明。口径重叠，不能相加，也不是主机网卡统计。

配置 `.env` 后重建 **Backend** 容器：

```dotenv
TELEGRAM_DAILY_TRAFFIC_ENABLED=true
TELEGRAM_DAILY_TRAFFIC_TIME_UTC=00:10
TELEGRAM_DAILY_TRAFFIC_TARGET=users
TELEGRAM_DAILY_TRAFFIC_TOP_N=5
```

新安装默认禁用，启用要求已有 Telegram bot 和目标会话。`TIME_UTC` 严格 HH:mm，`TOP_N` 为 1–5；不会修改 `APP_SECRET`。

## 可靠性与排障

`telegram_daily_traffic_reports` 保存 UTC 日期唯一键、消息快照、接收位置、状态、发送次数、发送时间及不含 token 的错误类别。BullMQ 确定性任务 ID + 数据库原子租约防止并发发送。Telegram 成功接受后才记录 `SENT`，断路器、队列丢失、进程重启不会把未发消息标成已发。

数据库 outbox 每分钟巡检，重试间隔 5/10/20/40/80 分钟，尊重 Telegram `retry_after`，保留生成时的消息和目标。超过 7 天仍未发送标记失败；永久 API 拒绝标记 `FAILED`，修正后需管理员明确重试。发送记录不自动清理。

Telegram API 没有幂等键：如果消息已接收但客户端响应丢失，或发送后写入 `SENT` 前数据库/进程故障，仍可能重复。正常重启、多实例和队列重复投递由租约及已发状态去重，不能承诺严格 exactly-once。

只读查看（不要输出 `message/chat_id` 到公开日志）：

```sql
SELECT report_date, status, attempts, sent_at, last_error, next_attempt_at
FROM telegram_daily_traffic_reports ORDER BY report_date DESC LIMIT 7;
```

计划：配置/汇总/outbox/定时任务 → UTC/去重/重试/并发回归 → GitHub amd64 镜像 → 备份部署面板 → 确认首条日报与节点状态不变。

## 发布记录（2026-10-07）

上述步骤已完成：

- Backend `3.17.0-anytls`；Frontend 保持 `3.16.0`；Agent 保持 `3.15.0`。
- 代码提交 `2e78583bd3089d364a0be96054a7fda80ac93e9a`。
- GitHub [日报实际 SQL 回归](https://github.com/wuansg/backend/actions/runs/37598320414)和 [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/37598319952)通过。
- 固定部署镜像 `ghcr.io/wuansg/backend:3.17.0-anytls@sha256:0dfa0460bd8aea5e0db2afc15e5f1d519b29c107f9841d702f075e11afabd5c3`。
- 生产已启用 UTC `00:10`，使用现有 `users` 会话；不改变其他通知。
- 首条昨日汇总已记录 `SENT`，一次成功接受，内容与数据库四种口径匹配；13/13 节点在线、配置不变，采集序列持续增长，无积压、无测速任务。
- 原环境变量完整保留，仅追加日报配置；升级前数据库/配置备份及旧镜像保留，临时 SQL 验证容器与卷已回收。
- 本地类型检查、生产构建、格式检查、日报单元/三时区 SQL 回归、usage snapshot/forwarding/queue bootstrap 回归均通过。Oxlint 已知宿主环境原生分配器故障，未计为通过。
