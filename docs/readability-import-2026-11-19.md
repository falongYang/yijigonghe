# 首批：档案导入与窄屏可读性

基线 33f0b52。仅修改 ui.js 与 style.css；不调整相机上限、地图、血条策略。

## 改动
- 在 FileReader 构造与读取前拒绝 size > 65536 字节；保留导入文本的原有长度和 JSON/版本校验。
- 新选择使旧读取失效，尝试 abort；成功和错误回调均检查代次，防止旧结果覆盖新档案/提示。选择超限文件也会使前次读取失效。
- <=620px：资源和目标 12px、图例 11px，图例文字提亮；技能按钮 12px、至少 32px 高。布局遮挡仍需浏览器核验。

## 已执行验证
- Bun run-tests.mjs：57 个 PASS、All checks passed。沿用现有运行器，实际数量为 57。
- Bun test-profile-import-race.mjs：通过，覆盖过期成功/错误、超限前置拦截、65536 边界及读取失败。
- Bun test-soak.mjs：18 场、51762 ticks、状态不变量通过。
- Bun probe-map-expansion.mjs "$PWD"：六章资源/水域边界、360 路径通过，p95 0.154ms（重复路线，非浏览器帧耗时）。
- probe-r4-wave.mjs 在全量及单跑通过，仅算模拟层波次证据。
- git diff --check：通过。

## 未完成验收
- 390×844、844×390 浏览器字号、遮挡、对比度。
- 大型 wave/动态障碍的浏览器实跑与帧耗时；模拟层探针不替代这些证据。
- CAM_DIST_MAX=300、俯瞰198下雾/岩脊、最大拉远小地图下令和点选。

## 浏览器阻塞实证
当前 PATH 无 npm/node，使用已安装 Bun 完成模拟层检查。Playwright import 实际失败 Cannot find package 'playwright'，node_modules 只有 three。
直接启动 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --no-first-run --user-data-dir=/tmp/ant-readability-chrome --dump-dom about:blank，exit 134，无页面输出；未取得浏览器通过证据。可按已批准的方案 A 在可信会话针对本提交补齐上述证据。此交付为待浏览器验收版本，不可据此发版。
