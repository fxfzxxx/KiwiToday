# KiwiToday：进度、风险与部署

本次检查：2026-09-24。前端平台按 Netlify 理解。

## 当前状态

项目是可构建的 MVP 原型，尚未证明生产数据链路可用。
已有 Next.js 中英界面、列表/地图、城市/日期/分类筛选、PostGIS 数据结构、
去重评分、三种来源适配器、定时采集和测试。没有生产数据库或来源凭据参与此次验证。

本次补充 Netlify/Railway 配置、Railway GET /api/events、Netlify 服务端转发、
生产故障明确报错，并修复 Windows 迁移入口、free=false 查询解析、
JSON-LD 无时区日期、抓取失败后错误清理、无坐标活动被城市列表过滤的问题。

## 部署关系

浏览器 → Netlify Next.js（SSR 和同源 /api/events）→ Railway（查询和采集）→ Postgres/PostGIS。

Netlify 保留服务端渲染以支持搜索引擎；不是静态 HTML 导出。
当前 API 与采集共用一个 Railway 进程，流量增长后应拆分，避免采集影响查询。

### Railway

1. 连接代码仓库，构建上下文保持仓库根目录，使用根目录 railway.json。
2. 提供支持 PostGIS 和 pg_trgm 的 PostgreSQL 数据库；不能假定普通 PostgreSQL 镜像包含 PostGIS。
3. 设置 DATABASE_URL、EVENTFINDA_USERNAME、EVENTFINDA_PASSWORD、TICKETMASTER_API_KEY。
   当前数据库客户端对远端连接要求 TLS；确保数据库支持，队列使用直连或 session 连接，不使用 transaction pooler。
4. 配置已指定 Dockerfile、部署前 pnpm db:migrate、/health 和失败重启。
   数据库账号需要迁移建表/扩展以及 pg-boss 建 schema 的权限。
5. 生成 HTTPS 域名。验证 /health 和 /api/events?city=auckland&date=week。
6. 初次采集前执行 dry-run 验证映射，再执行完整采集。定时器每小时执行，启动不立即采集。

### Netlify

1. 连接同一仓库。Base directory 为仓库根目录，Package directory 为 apps/web。
2. netlify.toml 已配置构建 pnpm --filter @kiwi/web build 和发布 apps/web/.next。
3. 设置 API_BASE_URL 为 Railway HTTPS 地址；无需在 Netlify 放数据库密码。
4. 不设置 DEMO_MODE，或设 false。只有明确发布演示站时才设 true 且不设置后台连接。
5. 可设置 NEXT_PUBLIC_MAP_STYLE_URL；它是构建时变量，修改后重新构建。
6. 验证首屏 SSR、切换筛选、后台故障提示，并确认无演示横幅。

本地命令需使用 packageManager 锁定的 pnpm：corepack pnpm。
根目录 .env 不会自动被现有 CLI/worker 或 apps/web 下的 Next.js 全部读取；
本地运行前向进程注入环境变量，或为 Next.js 使用 apps/web/.env.local。
生产环境使用平台环境变量，不提交真实密钥。

## 尚未解决的风险（按优先级）

### P1：真实数据质量与一致性

- 两个 API 适配器尚无真实响应验证，七个候选来源仍禁用。单元测试使用样例，不能证明供应商接口可用。
- ingestListing 每次按标题/时间重新匹配，没有优先按 source_record 已有链接更新。
  活动大幅改名或改期可能新建活动并遗留旧活动。enrichEventFromListing 也不会更新 starts_at/title，价格只取较低值。
- 写 source_record、活动和链接没有统一事务，并发来源可能重复插入；需要数据库集成测试与并发控制。
- 下架清理没有完整抓取覆盖范围的契约。已修复 HTTP 失败被吞掉，但页面成功返回空结构、分页截断、抓取时间范围变化仍可能误下架；全空结果又会保留旧记录。
- JSON-LD 仅解析 seed 页面，不跟随详情页；缺失 @id/url 时以页面 URL 当活动 ID，同页多个活动可能碰撞。

### P2：用户体验与运营

- 前端固定最多 60 条，没有“加载更多”；API 虽有 cursor，界面未使用。
- 免费筛选未写入 URL，浏览器前进/后退与客户端筛选状态未完整同步。
- 首屏 SSR 未处理搜索/free 等全部 API 条件；缺活动详情页、sitemap 和活动结构化数据。
- UI 中英切换已存在，真实活动中文翻译尚未实现。
- 没有持续失败告警、数据陈旧告警、人工合并审核界面、公开 API 限流。
- 地图默认演示瓦片；封面仍外链，上线需落实地图服务配额和图片使用/缓存方案。
- 收藏、账号、发布活动仍未实现；这些不是当前聚合浏览 MVP 的前置条件。

## 验证边界

执行单元测试、TypeScript 检查、Next.js/worker 生产构建。
尚未执行 Docker 构建、真实 PostGIS 迁移、在线来源采集、平台部署或浏览器完整验收。
配置已准备不等于已部署；上线前至少完成一次“真实采集 → 数据库 → Railway API → Netlify 页面”验收。

官方参考：
- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/build/configure-builds/monorepos/
- https://docs.railway.com/deployments/pre-deploy-command
- https://docs.railway.com/deployments/healthchecks
