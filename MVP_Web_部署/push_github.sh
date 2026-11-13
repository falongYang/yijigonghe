#!/usr/bin/env bash
# yijigonghe — 每轮开发结束后提交并推送到 GitHub
# 用法: bash MVP_Web_部署/push_github.sh "本轮改动说明"
# 凭据：HTTPS 用 macOS 钥匙串里的 PAT，或把 origin 改为 SSH 并用已登记公钥。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

BRANCH="${BRANCH:-main}"
MSG="${1:-}"
if [ -z "$MSG" ]; then
  MSG="chore: 开发迭代 $(date '+%Y-%m-%d %H:%M')"
fi

# 1) remote 必须存在，且指向 yijigonghe
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "✗ 未配置 origin，请先执行："
  echo "  git remote add origin https://github.com/falongYang/yijigonghe.git"
  exit 1
fi
REMOTE="$(git remote get-url origin)"
case "$REMOTE" in
  *falongYang/yijigonghe*) ;;
  *) echo "✗ origin 不是 yijigonghe：$REMOTE"; exit 1 ;;
esac

# 2) 提交（工作区干净时跳过 commit，仍尝试 push 以同步未推送的本地提交）
git add -A
if git diff --cached --quiet; then
  echo "· 工作区无改动，跳过提交"
else
  FILES="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  git commit -q -m "$MSG"
  echo "· 已提交 $FILES 个文件：$(git rev-parse --short HEAD)  $MSG"
fi

# 3) 推送
git push -u origin "$BRANCH"
echo "PUSH_OK  $(git rev-parse --short HEAD) → $REMOTE ($BRANCH)"
