#!/usr/bin/env bash
# 《蚁纪·共时》Web MVP — 云端初始化脚本（在服务器上执行，需 sudo 免密）
# 依赖：/home/ubuntu/ant-mvp.tar.gz 已由 deploy_mvp.sh 上传
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ARCHIVE=/home/ubuntu/ant-mvp.tar.gz
WEBROOT=/var/www/ant-epoch

if ! command -v nginx >/dev/null 2>&1; then
  echo ">>> 安装 nginx"
  sudo apt-get update -qq
  sudo apt-get install -y -qq nginx
fi

echo ">>> 释放站点到 $WEBROOT"
sudo mkdir -p "$WEBROOT"
sudo find "$WEBROOT" -mindepth 1 -delete
sudo tar -xzf "$ARCHIVE" -C "$WEBROOT"
sudo chown -R www-data:www-data "$WEBROOT"
sudo chmod -R a+rX "$WEBROOT"

echo ">>> 写入 nginx 站点配置（80 主入口 + 8080 备用）"
sudo tee /etc/nginx/sites-available/ant-epoch >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 8080;
    listen [::]:8080;
    server_name _;
    root /var/www/ant-epoch;
    index index.html;
    access_log /var/log/nginx/ant-epoch.access.log;
    error_log  /var/log/nginx/ant-epoch.error.log;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    add_header X-Content-Type-Options nosniff always;

    location / {
        try_files $uri $uri/ =404;
    }
    # 代码类资源不缓存，保证迭代后刷新即生效；插画图片可长缓存
    location ~* \.(js|css|json|html)$ {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri =404;
    }
    location ~* \.(png|jpe?g|webp|svg|ico)$ {
        expires 7d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }
    location ~ /\. { deny all; }
}
NGINX

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sfn /etc/nginx/sites-available/ant-epoch /etc/nginx/sites-enabled/ant-epoch
sudo nginx -t
sudo systemctl enable nginx >/dev/null 2>&1 || true
sudo systemctl restart nginx

echo ">>> 自检"
curl -sS -o /dev/null -w 'local_http_80=%{http_code}\n' http://127.0.0.1/
curl -sS -o /dev/null -w 'local_http_8080=%{http_code}\n' http://127.0.0.1:8080/
curl -sS -o /dev/null -w 'three_js=%{http_code}\n' http://127.0.0.1/vendor/three.module.js
echo DEPLOY_OK
