#!/usr/bin/env bash
# yijigonghe /《蚁纪·共时》Web MVP — 一键打包并部署到云服务器
#
# 用法：
#   SSHPW='<服务器密码>' bash deploy_mvp.sh
# 可选环境变量：MVP_HOST（默认 101.42.26.83）、MVP_USER（默认 ubuntu）
#
# 说明：密码只在本次进程内通过环境变量传给 expect，不写入任何文件、不落盘、不记录日志。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../MVP_Web" && pwd)"
HOST="${MVP_HOST:-101.42.26.83}"
SSHUSER="${MVP_USER:-ubuntu}"
: "${SSHPW:?请通过环境变量 SSHPW 提供服务器密码，例如： SSHPW=xxx bash deploy_mvp.sh}"

SSHOPT="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PubkeyAuthentication=no -o PreferredAuthentications=password"
export SSHPW HOST SSHUSER SSHOPT HERE ROOT

echo ">>> 打包 $ROOT"
COPYFILE_DISABLE=1 tar --no-xattrs -czf /tmp/ant-mvp.tar.gz -C "$ROOT" .
ls -lh /tmp/ant-mvp.tar.gz

echo ">>> 上传站点包与初始化脚本"
expect <<'EOF'
set timeout 180
spawn scp {*}$env(SSHOPT) /tmp/ant-mvp.tar.gz "$env(SSHUSER)@$env(HOST):/home/ubuntu/ant-mvp.tar.gz"
expect {
  -re "(?i)password:" { send -- "$env(SSHPW)\r"; exp_continue }
  eof
}
if {[catch wait st]} { puts "scp 失败"; exit 1 }
if {[lindex $st 3] != 0} { puts "scp 返回码 [lindex $st 3]"; exit 1 }
spawn scp {*}$env(SSHOPT) "$env(HERE)/setup_server.sh" "$env(SSHUSER)@$env(HOST):/home/ubuntu/setup_server.sh"
expect {
  -re "(?i)password:" { send -- "$env(SSHPW)\r"; exp_continue }
  eof
}
if {[catch wait st]} { puts "scp 失败"; exit 1 }
if {[lindex $st 3] != 0} { puts "scp 返回码 [lindex $st 3]"; exit 1 }
EOF

echo ">>> 云端安装依赖并发布"
expect <<'EOF'
set timeout 420
spawn ssh {*}$env(SSHOPT) "$env(SSHUSER)@$env(HOST)" "chmod +x /home/ubuntu/setup_server.sh && sudo bash /home/ubuntu/setup_server.sh"
expect {
  -re "(?i)password:" { send -- "$env(SSHPW)\r"; exp_continue }
  eof
}
if {[catch wait st]} { puts "ssh 失败"; exit 1 }
puts "SSH_EXIT=[lindex $st 3]"
EOF

echo ">>> 部署完成： http://$HOST/ （备用 http://$HOST:8080/ ）"
