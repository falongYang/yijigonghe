#!/usr/bin/env bash
# yijigonghe — 每轮开发结束后提交并推送到 GitHub
# 用法: bash MVP_Web_部署/push_github.sh "本轮改动说明"
# 凭据：PAT 存于 /Users/loganyang/.git-credentials（权限 600），由仓库本地
#       credential.helper 链（空值清空继承 + store）读取；remote 保持干净 URL 不含 token。
#       空值那条用于屏蔽系统级 osxkeychain 在沙箱里的 -60006 告警，不影响鉴权。
#       注意：PAT 必须可写（classic 带 repo scope，或 fine-grained 且 Contents: Read and write
#       并授权本仓库），只读 PAT 会在 push 时返回 403。
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
# 本地出口代理（HTTP_PROXY=http://127.0.0.1:...）偶发 CONNECT 502 / 超时，会让「每轮必推」失败。
# 先快速探测：代理不可达就直接清空代理变量走直连；默认推送失败时也回退一次（并降级 HTTP/1.1，
# 规避 "HTTP2 framing layer" 错误）。凭据来自仓库本地 credential.helper，与是否走代理无关。
do_push() { git push -u origin "$BRANCH"; }
do_push_direct() {
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    git -c http.version=HTTP/1.1 -c http.lowSpeedLimit=0 -c http.lowSpeedTime=180 push -u origin "$BRANCH"
}
if [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ] && ! curl -s -o /dev/null --max-time 6 https://github.com/ >/dev/null 2>&1; then
  echo "· 本地代理不可达，改用直连（HTTP/1.1）"
  do_push_direct
elif do_push; then
  :
else
  echo "· 默认推送失败，回退直连（HTTP/1.1）重试"
  do_push_direct
fi
echo "PUSH_OK  $(git rev-parse --short HEAD) → $REMOTE ($BRANCH)"
