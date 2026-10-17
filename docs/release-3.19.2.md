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
