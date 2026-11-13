# yijigonghe

《蚁纪·共时》四域战争 RTS 的 Web MVP。项目名称 **yijigonghe**，游戏产品名保留「蚁纪 · 共时」。

- 线上体验：<http://101.42.26.83/>（备用 `:8080`）
- GitHub：<https://github.com/falongYang/yijigonghe>
- 技术栈：原生 JavaScript ES Modules + Three.js 0.169（本地 `vendor/` 内置），**无构建步骤**，纯静态站点。
- 本地目录、工程标识、仓库名与网页标题统一为 `yijigonghe`（2026-11-13 由 `蚁纪游戏设计稿/` 重命名；协作者需同步更新本地工作路径与编辑器书签）。

## 目录

```
yijigonghe/                     # git 仓库根
├── MVP_Web/                    # 站点源码（部署打包的就是这个目录）
│   ├── index.html
│   ├── js/                     # 15 个 ES 模块（见下）
│   ├── css/style.css
│   └── vendor/three.module.js
├── MVP_Web_部署/
│   ├── deploy_mvp.sh           # 打包并部署到云服务器
│   ├── setup_server.sh         # 云端 nginx 初始化
│   └── push_github.sh          # 每轮开发结束后提交 + 推送 GitHub
├── package.json                # 项目标识：name = yijigonghe
└── README.md
```

设计稿、PNG/XLSX/DOCX 等大文件由 `.gitignore` 排除，不入库。

## 本地运行

```bash
cd MVP_Web
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

也可以用 `npm run serve`（等价于上面的命令）。语法自检：`npm run check`。

## 部署

```bash
cd MVP_Web_部署
SSHPW='<服务器密码>' bash deploy_mvp.sh
```

脚本会把 `MVP_Web/` 整个目录打包上传并重建 nginx 站点。部署统一由 A 侧执行，避免并发写入时截到半套代码。

## 提交到 GitHub

**约定：每一轮开发结束后都要提交并推送。**

```bash
bash MVP_Web_部署/push_github.sh "本轮改动说明"
```

不带参数时自动生成带时间戳的提交信息。凭据已配置在 `/Users/loganyang/.git-credentials`（权限 600，由仓库本地 `credential.helper=store` 读取，`origin` 保持干净 URL 不含 token）。

> **PAT 权限要求**：必须是可写 token —— classic PAT 勾 `repo` scope，或 fine-grained PAT 设置 `Contents: Read and write` 并在 Repository access 中勾选本仓库。只读 token 会通过 API 鉴权，但 `git push` 会返回 `403 Permission ... denied`。

## 并行开发边界

架构为三层：`data.js` / `rts.js` 为共享规则底座，`sim.js`（纯逻辑）、`world.js`（3D）、`ui.js`（DOM）互不导入，仅在 `main.js` 装配。解耦后按下列所有权划分，双方各改各的文件：

| 侧 | 独占文件 | 职责 |
| --- | --- | --- |
| **A（逻辑 / 部署）** | `sim.js`、`rts.js`、`data.js`、`data_archive.js`、`maps.js`、`bridge-core.js`、`MVP_Web_部署/`、验证链 | 战斗结算、经济、AI、数值平衡、地图规则数值、事件契约；单点执行部署与 GitHub 推送 |
| **B（表现 / 交互）** | `main.js`、`world.js`、`ui.js`、`ants.js`、`audio.js`、`fx.js`、`map-art.js`、`bridge-view.js`、`index.html`、`css/`、`assets/` | 3D 渲染与特效、蚂蚁建模、HUD / 首页 / 小地图、音效、输入与主循环 |
| **冻结（双方不改）** | `bridge.js`、`rts.js` 中的 `re-export` 行 | 装配点与导入兼容层 |

三条硬规则：

1. **契约只增不删不改**：`sim.on` 事件类型与 payload 字段、`fx.js` 特效类型键、`sim.commandXxx` 命令签名。新需求一律走「加一个事件类型 / 加一个特效键 / 加一个命令方法」。
2. **B 侧对 `sim` 状态只读**，不写；不调用 `rts.js` 数值。A 侧不碰 DOM id 与表现层文件。
3. **部署与推送只由 A 侧执行**；打包前后各核对一次时间戳 / 哈希，防止并发写入导致半套代码上线。

事件桥接已拆成 `bridge.js`（装配）+ `bridge-core.js`（A）+ `bridge-view.js`（B）双路监听；特效分发改为 `fx.js` 的 `FX_BUILDERS` 注册表；地图规则在 `maps.js`、地图美术在 `map-art.js`。三方都不必再改 `main.js` / `world.js` / `rts.js` 的公共段落。
