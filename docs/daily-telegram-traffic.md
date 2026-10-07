# Telegram 每日流量日报（Backend 3.17.4）

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

## 排版及 Host 排行（3.17.1）

汇总/节点/Host/上传/转发/采集状态分区显示；统一 `↑ 上传 / ↓ 下载`，增加对应北京时间区间。上传排行突出上传量，而不是总量。异常长名称自动省略，极端长度时缩短名称，不丢弃统计区块，保持格式完整和 4096 字符上限。

Host 按 `(node_uuid, inbound_tag)` 物理入口合并，先以小时 MAX 去掉共享别名重复量，再按天 SUM 排名，排序后取 Top N。显示该组代表 Host、所属节点及共享数量；不把共享入口当作多个独立 Host 的精确用量。同一 Host 跨节点的入口分别记录，避免名称误导。

随镜像内置预览工具，默认只读核对，不修改已发日报或补发状态。只有管理员明确执行 `--send` 才发送一条标记为“新版日报预览”的消息，不自动重试可能已被接受的预览：

```sh
docker exec remnawave node dist/daily-traffic-preview.js --check
docker exec remnawave node dist/daily-traffic-preview.js --send
```

每天北京时间 08:10 的发送时间和接收会话保持不变。

## MarkdownV2 排版（3.17.2）

新日报使用 [Telegram MarkdownV2](https://core.telegram.org/bots/api#markdownv2-style)：标题、分类和排行名称加粗；流量和日期等宽显示；统计口径说明使用引用块。名称中的下划线、括号、星号、反斜杠等保留原文字并按普通文本规则转义，等宽数字使用独立 code 转义规则，不混用 HTML 实体。预览明确标记为“Markdown 日报预览”。

每条 outbox 记录新增 `parse_mode` 并与消息一起冻结。新增日报显式存为 `MarkdownV2`；增量迁移将已有记录默认设为 `HTML`，原消息、状态、发送次数和时间不变，未发送的旧日报按原格式重试。其他 Telegram 通知仍默认使用 HTML，不做全局切换。回退到 3.17.1 时先确认没有待发 Markdown 日报，避免旧 worker 用 HTML 发送 Markdown。

## 等宽代码块（3.17.3，已由 3.17.4 更正）

此版把名称放在列表、数字放在代码块，并非用户要求的 Markdown 表格；不再用于新日报。

沿用 `sendMessage` + MarkdownV2 通道，将汇总和每项非空排行放入等宽代码块表格，不依赖客户端把 Markdown 管道语法渲染成表格，也不切换到新的 Rich Messages API。

- 汇总按用户消耗、节点代理、Host 入口、nft 转发分行，列为总量/上传/下载。
- 排行的序号对应表格上方的名称列表；Host 列表保留所属节点和共享数量。中文、旗帜或长名称不进入数值表格，避免挤歪数字列。
- 上传排行按上传量排序，表格列顺序为上传/下载/总量；其他排行为总量/上传/下载，数据和既有去重统计口径不变。
- 数字靠右对齐，固定中文列名按双宽字符补齐；不省略字节数据，保留单位，通常表格宽度不超过 40 个等宽单元。异常长名称缩短时保留全部表格、警告、未拆分用量和采集状态。
- 预览明确标记“表格版日报预览”，只读检查输出 `layout=tables` 和实际 `tableCount`。旧日报内容仍冻结，不重写、不补发。

## 真正的 Markdown 表格（3.17.4）

日报使用 [Telegram Rich Markdown](https://core.telegram.org/bots/api#rich-markdown-style) 的 `| 列名 |`、`| :--- | ---: |` 表格语法，发送到 `sendRichMessage` 的 `rich_message.markdown` 字段。它与老接口 `sendMessage` 的 MarkdownV2 不是同一种语法。标题使用 `#`/`##`，名称加粗使用 `**`；不使用 fenced code block，也不拆成序号列表与数据表。

节点/Host 的名称和上传、下载、总量直接放在同一行；Host 的所属节点及共享数量放在同一表内。特殊字符、HTML、链接、公式和名称中的 `|` 都按 GFM 文本规则转义，避免注入新列或格式。

`parse_mode` 的持久化约束新增 `RichMarkdown`，仅新增日报使用新通道；原 HTML、MarkdownV2 记录保持正文和格式不变，重试仍走原通道。其他通知继续默认 HTML，不做全局改动。回退到 3.17.3 或更早版本前需确认没有待发 RichMarkdown 日报。

镜像内预览输出 `layout=markdown-tables` 和源码表格数，发送后返回 Telegram 的 `nativeTableCount` 和 `returnedRichMessage` 回执。发送成功但缺少格式回执时不自动重发，以免重复；不能把 HTTP 成功本身当作原生表格渲染的证明。

## 可靠性与排障

`telegram_daily_traffic_reports` 保存 UTC 日期唯一键、消息快照和格式、接收位置、状态、发送次数、发送时间及不含 token 的错误类别。BullMQ 确定性任务 ID + 数据库原子租约防止并发发送。Telegram 成功接受后才记录 `SENT`，断路器、队列丢失、进程重启不会把未发消息标成已发。

数据库 outbox 每分钟巡检，重试间隔 5/10/20/40/80 分钟，尊重 Telegram `retry_after`，保留生成时的消息和目标。超过 7 天仍未发送标记失败；永久 API 拒绝标记 `FAILED`，修正后需管理员明确重试。发送记录不自动清理。

Telegram API 没有幂等键：如果消息已接收但客户端响应丢失，或发送后写入 `SENT` 前数据库/进程故障，仍可能重复。正常重启、多实例和队列重复投递由租约及已发状态去重，不能承诺严格 exactly-once。

只读查看（不要输出 `message/chat_id` 到公开日志）：

```sql
SELECT report_date, parse_mode, status, attempts, sent_at, last_error, next_attempt_at
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

### 3.17.1 排版与 Host 排行发布

- 代码提交 `653a840d275a1db90adc4c4e14cf5600230907b6`。
- GitHub [SQL/排版回归](https://github.com/wuansg/backend/actions/runs/37600648515)和 [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/37600648301)通过。
- 固定镜像 `ghcr.io/wuansg/backend:3.17.1-anytls@sha256:9c65c4fc89cbaeceeca63076391f22ea0d34e0835f716a39046327a28cd5d133`。
- 预览使用镜像内真实汇总/渲染代码生成；Host Top 5 与独立数据库查询一致。经用户确认发送一次，Telegram 已接受，消息长度 1764 字符。
- 原日报内容 hash、状态、发送次数与发送时间保持不变；环境配置逐字节不变。每天北京时间 08:10 定时任务保持启用，之后的新日报自动使用新格式。
- 13/13 节点在线，版本和配置不变，流量快照无积压或错误，未触发测速。临时 Host 排行 SQL 测试容器及卷已移除。

### 3.17.2 MarkdownV2 发布

- 功能提交 `8e4ac920d04741d5612b9f677a168c85f228151d`。
- GitHub [Markdown/旧 HTML/真实 SQL 回归](https://github.com/wuansg/backend/actions/runs/37604641533)与 [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/37604702916)均通过。
- 固定部署镜像 `ghcr.io/wuansg/backend:3.17.2-anytls@sha256:c762ec7126c40cc9f2d5bb4f650409fc53273ec62f53243c641e2a8c9fb4d528`，Frontend 3.16.0 和 Agent 3.15.0 不变。
- 增量迁移已应用；原日报仍为 HTML，正文 hash、SENT 状态、attempts=1、sentAt 均未改变。环境文件逐字节不变，UTC 00:10/现有 users 会话不变。
- 镜像内只读预览确认为 MarkdownV2、1673 字符，Host Top 5 与独立数据库查询一致；后经用户确认发送一条 Markdown 预览，Telegram 已接受，原日报记录不变。
- 网站 HTTP 200，Backend 无重启，13/13 节点在线、配置/版本不变，流量快照无积压、无错误，无测速任务。
- 升级前数据库/配置备份保存在 `/opt/remnawave/backups/release-3.17.2-20261007/`，旧镜像保留；本次临时 SQL 验证容器与卷已回收。

### 3.17.3 表格版发布

- 功能提交 `138aba2e0270b905486735bebe6cc42f3381e711`。
- GitHub [表格/格式/真实 SQL 回归](https://github.com/wuansg/backend/actions/runs/37606130133)与 [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/37606165014)均通过。
- 固定部署镜像 `ghcr.io/wuansg/backend:3.17.3-anytls@sha256:8fec633a2247ba319ee8b7e188f4200f739a299d78fd47ca26da2066141b8ab4`，Frontend 3.16.0 和 Agent 3.15.0 不变。
- 镜像内预览确认 `layout=tables`、五张表格、1674 字符；汇总上传/下载/总量与上一版一致，Host Top 5 与独立 SQL 查询一致。
- 经用户确认发送一次表格版预览，Telegram 已接受；发送前后原日报内容 hash、格式、状态、发送次数和发送时间均不变。定时 UTC 00:10/现有 users 会话保持不变。
- 网站 HTTP 200，Backend 无重启，13/13 节点在线且版本/配置不变，流量快照无积压或错误，无测速任务。
- 升级前数据库/配置备份保存在 `/opt/remnawave/backups/release-3.17.3-20261007/`，环境文件逐字节保留，旧镜像可回退。本次没有新的数据库迁移。

### 3.17.4 真正 Markdown 表格更正

- 功能提交 `fd7e4dba86b6be0b80a3b4966df0e16333949403`；更正 3.17.3 把代码块当作 Markdown 表格的错误实现。
- GitHub [真实表格/新旧通道/SQL 回归](https://github.com/wuansg/backend/actions/runs/37608315785)和 [amd64 镜像构建](https://github.com/wuansg/backend/actions/runs/37608341466)通过。
- 固定镜像 `ghcr.io/wuansg/backend:3.17.4-anytls@sha256:9cafc3a92ff40f64070c00832e89dbfc73eecdef26b65055df713b2371d0ee83`，Frontend 3.16.0 和 Agent 3.15.0 不变。
- RichMarkdown 格式约束迁移已应用，旧 HTML 日报正文 hash、状态、发送次数和时间不变；环境逐字节不变。
- 正式镜像预览为真正 GFM 表格，1741 字符，汇总及 Host 排名与上一版一致。发送了一条更正预览，Telegram 回执 `returnedRichMessage=true`、`nativeTableCount=5`，确认是原生表格而非代码块。
- 网站 HTTP 200，13/13 节点在线、版本/配置不变，流量快照无积压或错误，无测速任务。每日 UTC 00:10/现有 users 会话不变。
- 升级前数据库和配置备份保存在 `/opt/remnawave/backups/release-3.17.4-20261007/`，旧镜像保留。
