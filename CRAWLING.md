# 场馆采集试点

2026-09-25 修正：Auckland Live 的 Current Shows 使用页面中的
`window.__INITIAL_STATE__` 数据，旧版仅检查 JSON-LD 和可见链接而漏采。
现在安全解析其中的 included shows 数组（不执行网页脚本），按场馆名称匹配。
Civic/Town Hall/Aotea Centre/Bruce Mason 分别发现 14/37/30/32 条公告。
日期范围保留开始与结束日期，不展开为未被官网确认的每日场次。

## 技术选择

- TypeScript / Node.js fetch：请求官网和票务 API，复用现有 Railway worker。
- Cheerio：解析 HTML、发现活动详情链接、读取明确日期。
- JSON-LD + Zod：优先读取结构化字段并校验；不需要 AI 就能处理。
- PostgreSQL/PostGIS + pg-boss：沿用已有存储、去重和任务调度。
- Claude Messages API：可选的正文提取，沿用项目已有 ANTHROPIC_API_KEY / ENRICH_MODEL 设置。
- Playwright（后续按站点接入）：用于 JavaScript 渲染。Python 和 TypeScript 均可，
  当前无需另加 Python 服务；Python requests/BeautifulSoup 也不会自动执行网页 JavaScript。

本次没有安装 Playwright 或浏览器运行时。先识别哪些站点确实需要浏览器，避免给 Railway 增加不必要资源开销。

## 已实现

目录已扩展至 20 个奥克兰场馆，位于 apps/worker/src/venues/catalog.ts。
全部场馆执行试采，成功产生活动日期数据的场馆与待完善/读取失败的场馆在网站明确区分。
目录覆盖 20 家不等于 20 家都已稳定产出活动；首批可展示日期数据来自 Spark Arena、
The Tuning Fork、Powerstation、Q Theatre 和 Eden Park。

爬虫限制同源 HTTPS、配置的路径、每站最多 12 页、串行低频请求；读取 robots.txt，
拒绝未知重定向、非 HTML 和过大响应。每页记录 URL、核验时间、内容哈希、正文和结果状态。
目录仅由仓库维护者修改，不接受公开用户提供任意 URL。

所有报告明确标记部分覆盖。到达页数上限、页面失败、无结构化数据分别记录；
不把缺失数据解释为活动取消，也不推测未公布年度排期。

Spark Arena 使用已检查的详情页 time[datetime] 读取日期，单独展示“开场时间未核验”，
不会把日期强行变成午夜开场时间。其他来源目前依赖 JSON-LD；活动地点必须匹配目录场馆。

AI 提取默认关闭。启用后仅发送已采集的公开正文，要求逐字段提供原文，校验原文存在，
结果保存在报告的 aiDrafts 中并标记待人工核验，不会自动写入线上活动。
相同页面文本、模型与提示版本复用缓存；--ai-pages 限制一次命令最多处理的页面数，包含缓存命中。
原文存在不等于日期含义正确，AI 草稿仍需要审核；当前还没有审核 UI 和自动中文总结。

## 运行（仓库根目录）

```powershell
corepack pnpm venues --venue spark-arena --days 30
corepack pnpm venues --venue spark-arena --days 365
corepack pnpm venues --days 30
```

输出位于 artifacts/venues/*.json 和 *.md，已忽略 Git。
月度和年度参数表示未来 30 / 365 天，不是自然月/自然年。

可选 AI：通过进程环境设置 ANTHROPIC_API_KEY 和 ENRICH_MODEL 后执行：

```powershell
corepack pnpm venues --venue spark-arena --days 30 --ai --ai-pages 3
```

不要把密钥写入代码或报告。没有密钥也能完成网页采集、JSON-LD 提取和日期清单。

## 进入定时采集

迁移 0003 添加禁用的来源记录。先看 venues 报告、核实地点/时间和抓取范围，再启用来源；
启用后重启 Railway worker 以注册定时任务。
adapterFor 已接入场馆采集；只有完整字段的结构化活动进入原有 ingestion，
仅日期公告和 AI 草稿不会进入原有数据库 feed。场馆采集永远跳过“未出现即下架”的逻辑。
迁移 0004 补齐其余16家禁用来源。
当前去重更新逻辑的旧风险仍需处理，见 DEPLOYMENT.md。

## 当前验证与后续

已对市政厅和 Spark Arena 官网执行真实读取；市政厅介绍页无可用活动结构化数据，
需要继续定位动态活动列表。Spark 详情可直接读取日期，无需为这一步运行浏览器。
未提供 AI 密钥，真实模型调用未验证。PostGIS 迁移及线上定时任务未在本轮运行。

下一步：完善剩余场馆的动态页面和专用提取器；完成草稿审核、活动取消/改期更新、数据库驱动的中文月报。

## 网站预览

```powershell
corepack pnpm venues --days 365
corepack pnpm venues:publish
$env:VENUE_PREVIEW='true'
corepack pnpm --filter @kiwi/web dev --hostname 127.0.0.1
```

打开 http://127.0.0.1:3000/venues 。设置 VENUE_PREVIEW=true 时首页也展示场馆预览；
不设置时保留原首页。快照写入 apps/web/src/data/venue-snapshot.json，可随 Next.js 构建部署。
页面包含未来30天/未来一年、关键词搜索、场馆筛选、20家采集状态和原始官网链接。
这是可重复生成的采集快照，不是已接通生产数据库或实时自动更新。
日期公告不捏造开场时间；同一演出的不同日期作为不同记录展示。

CLI 每家场馆在独立子进程中运行，60秒硬超时，即使解析器卡住也不会阻塞整个批次。
抓取失败会输出失败报告，页面也显示对应状态；不会用演示活动补齐空白。

参考：
- https://playwright.dev/python/docs/library
- https://cheerio.js.org/docs/basics/selecting/
- https://platform.claude.com/docs/en/api/messages/create
