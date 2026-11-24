#!/usr/bin/env bash
# IPOFlow 本地证监会辅导备案每日定时同步脚本（配合 macOS launchd 每日自动执行）
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

REPO_DIR="/Users/waltergao/.gemini/antigravity/scratch/ipoflow"
cd "$REPO_DIR"

retry_cmd() {
  local max_attempts=3
  local delay=5
  local attempt=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      return 1
    fi
    echo "[WARN] 命令失败（第 ${attempt}/${max_attempts} 次），${delay} 秒后重试: $*"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

git_pull_rebase() {
  git rebase --abort >/dev/null 2>&1 || true
  git pull --rebase --autostash origin main --quiet
}

echo "============================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行证监会辅导备案每日定时同步..."

# 1. 先与远端同步最新代码与 GitHub Actions 采集的其他数据集（网络异常时仅告警，不中断本地采集）
if retry_cmd git fetch origin main --quiet; then
  if ! retry_cmd git rebase --autostash origin/main --quiet; then
    git rebase --abort >/dev/null 2>&1 || true
    echo "[WARN] git rebase origin/main 失败，将继续执行证监会辅导备案采集。"
  fi
else
  echo "[WARN] git fetch 失败，将跳过远端预同步，直接执行证监会辅导备案采集。"
fi

# 2. 直连证监会 eid.csrc.gov.cn 抓取最新 60 页辅导公示 + 解析新增 PDF 报告（含 macOS Vision OCR）
python3 scripts/fetch_phase2_w2.py --only-tutoring --parse-pdfs 30

# 3. 检查辅导数据是否有更新，若有则先本地提交，再拉取变基并推送到 GitHub（自动触发 Cloudflare Pages 部署）
git add data/tutoring_data.json data/tutoring_data.js data/tutoring_reports
if git diff --cached --quiet; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 辅导备案数据无变化，无需推送。"
else
  git commit -m "chore(tutoring): 每日自动同步证监会辅导备案数据 $(date '+%Y-%m-%d')"
  retry_cmd git_pull_rebase || echo "[WARN] 推送前 pull --rebase 失败，尝试直接推送..."
  retry_cmd git push origin main
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 证监会辅导备案数据已成功推送至 origin/main！"
fi
