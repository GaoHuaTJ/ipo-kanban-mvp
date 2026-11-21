# 首发上市 - A股IPO全景看板与实时项目详情（零成本方案 B）

本项目为零成本复刻「首发上市」数据看板的完整 MVP：纯静态前端（HTML + CSS + JS + ECharts）+ 零第三方依赖 Python 数据采集脚本 + **方案 B 按需实时透传（本地 `server.py` / 云端 Cloudflare Pages Functions）**。

## 核心功能

1. **全景图（A股IPO在审 373 家）**
   - 中国地图省份热力图 + 酒红色气泡计数（支持一键切换「热力图 / 柱状图」）
   - `审核阶段 × 拟上市板块` 统计矩阵表
   - 保荐机构 TOP 15 与 律师事务所 / 会计师事务所 TOP 15 排行榜
   - 全链路钻取联动：点击省份、矩阵数字或机构柱子自动筛选明细
2. **审核动态（全量 2,900+ 条，含注册同意 / 终止）**
   - 按场所（上交所 / 深交所 / 北交所）、板块、阶段（含仅看在审 / 注册同意 / 终止）、省份、关键词组合筛选，每个标签均带实时计数
   - 支持日期排序、分页及一键导出 CSV
3. **项目详情页（方案 B 按需实时透传）**
   - 点击任意企业即可进入项目详情页：暖杏色 Banner + **5 节点绿色审核进度时间轴** + **`（一）基本信息`** 双列卡片 + **`（二）审核信息披露 PDF 文件`**
   - 实时透传交易所公开接口，免费展示**计划募集资金、保荐代表人、签字会计师、签字律师、官方招股说明书及问询回复 PDF 直链**

## 快速运行

### 1. 本地运行（推荐，完整启用方案 B 实时透传）
```bash
cd /Users/waltergao/.gemini/antigravity/scratch/ipo-kanban-mvp
python3 server.py
```
浏览器访问 `http://127.0.0.1:8080`，进入「审核动态」点击任意企业即可实时拉取详情（内置 30 分钟内存缓存）。

### 2. 更新全量列表数据（零第三方依赖）
```bash
python3 scripts/fetch_ipo_data.py
```

### 3. 零成本部署上线（Cloudflare Pages + GitHub Actions）
1. 将本目录推送到 GitHub 仓库。
2. 登录 [Cloudflare Pages](https://pages.cloudflare.com/)，关联该仓库，构建命令留空、输出目录填 `.`，一键部署。
   - 根目录下的 `functions/api/project-detail.js` 会自动生效为免费边缘函数（每天 10 万次免费调用 + 30 分钟边缘缓存）。
3. 在 GitHub 仓库开启 Actions 写入权限，`.github/workflows/update-ipo-data.yml` 每天 08:30 / 19:30 自动更新全量列表数据。
