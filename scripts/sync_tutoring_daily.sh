#!/usr/bin/env bash
# IPOFlow 本地证监会辅导备案每日定时同步脚本（配合 macOS launchd 每日自动执行）
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

REPO_DIR="/Users/waltergao/.gemini/antigravity/scratch/ipoflow"
cd "$REPO_DIR"

echo "============================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行证监会辅导备案每日定时同步..."

# 1. 先与远端同步最新代码与 GitHub Actions 采集的其他数据集
git fetch origin main --quiet
git rebase --autostash origin/main --quiet || {
  git rebase --abort || true
  git pull --no-rebase --autostash origin main --quiet || true
}

# 2. 直连证监会 eid.csrc.gov.cn 抓取最新 60 页辅导公示 + 解析新增 PDF 报告（含 macOS Vision OCR）
python3 scripts/fetch_phase2_w2.py --only-tutoring --parse-pdfs 30

# 3. 检查辅导数据是否有更新，若有则自动提交并推送到 GitHub（自动触发 Cloudflare Pages 部署）
git add data/tutoring_data.json data/tutoring_data.js data/tutoring_reports
if git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 辅导备案数据无变化，无需推送。"
else
  git commit -m "chore(tutoring): 每日自动同步证监会辅导备案数据 $(date '+%Y-%m-%d')"
  git push origin main
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 证监会辅导备案数据已成功推送至 origin/main！"
fi
