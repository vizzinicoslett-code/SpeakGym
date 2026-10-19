# SpeakGym · 表达训练场

每天几分钟，把“脑子里有东西”练成“嘴上说得出来”。这是一个本地优先的表达训练 Web App / PWA：无需账号、后端或 AI API，训练记录与录音保存在当前浏览器的 IndexedDB 中。

## 本地运行

建议使用 Node.js 22 与新版 Windows Chrome / Edge。在项目目录运行：

```powershell
npm ci
npm run dev
```

打开 [http://127.0.0.1:5173/SpeakGym/](http://127.0.0.1:5173/SpeakGym/)。端口被占用时，以终端输出为准。

```powershell
npm test
npm run build
npm run preview
```

生产预览地址为 [http://127.0.0.1:4173/SpeakGym/](http://127.0.0.1:4173/SpeakGym/)。不要直接双击 `dist/index.html`；录音、资源路径与 Service Worker 都需要正常的站点地址。

项目默认部署路径为 `/SpeakGym/`。如需部署在站点根目录，可在构建前设置 `VITE_BASE_PATH=/`。开发服务器不注册 Service Worker；安装与离线验收请使用 production build 的预览地址或 HTTPS 站点。

## 第一阶段功能

Phase 1.1 增加准备阶段的轻量辅助：“没思路？”默认折叠，仅展示四个启发问题；三根钉子和不停说还可主动展开“定义 → 例子 → 反面 → 结论”四个内容抓手。提示不会提供参考答案或代写观点，正式讲话时收起这些辅助内容。

Triple Step 话题按具体个人经历、轻观点、抽象概念分为 Easy / Normal / Hard，Chaos 保留全部话题。新用户默认 Easy，已有设置不会被覆盖；准备时可以写一句“我的主线”或跳过，讲话中持续显示，且只随本轮 Session 保存。

| 训练模式    | 练习内容                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| 三根钉子    | 随机问题、5 / 10 秒或不限时准备、WHAT / SO WHAT / NOW WHAT 提醒、30 / 60 / 90 秒讲话与自评   |
| Triple Step | 原话题持续可见，随机词自动出现并播放轻提示音；四种难度，结束后自行确认词语使用与主线保持     |
| 声音唤醒    | 同一句话练习自然表达、关键词强调、强制停顿、四种随机语速对比和具体场景；最多五遍录音试听比较 |
| 不停说      | 3 秒准备，30 / 45 / 60 / 90 秒讲话，记录流畅度和最长卡顿                                     |

今日训练按“不停说 60 秒 → 三根钉子 60 秒 → Triple Step 120 秒 → 声音唤醒 60 秒”安排。每项自评保存后进入下一项；五分钟指讲话时间，准备、自评和试听另计。

其他功能包括本周训练天数、累计时长、连续训练天数与模式次数，训练记录详情及删除，录音播放与删除，本地空间查看、批量删除录音和二次确认清空数据。设置分别保存三根钉子默认时长（初始 60 秒）和不停说默认时长（初始 30 秒），并提供录音、提示音、Triple Step 难度和每日首次打开训练的选项。

声音训练完成后优先对比 Take 1 自然版本与 Take 5 场景版本，手动选择差异程度并勾选五项自评。选择“几乎没区别”会显示下一轮练习建议；应用不会自动分析或评分。

内容库独立放在 `src/data/`，包含 112 个带提示标签的结构化问题、89 个分级 Triple Step 主问题、420 个普通中文干扰词与 72 句声音练习句。Phase 1 的全部原有题目均保留。

三根钉子、Triple Step、不停说及今日训练的对应环节，在完成后的复盘中提供默认收起的“看看一种优秀表达”。准备和讲话阶段不会读取或展示完整示范，继续下一项也不要求打开它。声音唤醒保持五遍录音、A/B 回听与自评，不增加参考表达。

本地参考库覆盖全部 112 个结构化问题、89 个 Triple Step 主问题和 420 个普通词：三根钉子给出自然的观点、理由与行动，并提供六项无分数的表达对比；Triple Step 用本轮实际出现的随机词，示范短桥接和回归同一主线；不停说展示多个内容角度和简短展开路径。每份示范只是一个可观察的例子，不是唯一答案，也不代表用户经历。

参考区桌面最大高度 300px，手机 250px，内容在区域内部滚动，支持触屏。历史详情也可以按题目 ID 再次读取本地示范；旧记录没有 ID 时按原题文字匹配，无法匹配也不影响原记录和录音。

桌面快捷键：Space 开始 / 暂停，Enter 下一步 / 确认，R 重开本轮，N 换题，Esc 退出。输入框、下拉框等控件内不触发训练快捷键。

## 数据与录音

录音使用浏览器 MediaRecorder；提示音使用 Web Audio API。第一次开启录音需要浏览器麦克风许可。浏览器不支持或权限被拒绝时，仍可继续不录音的训练。

麦克风和 PWA 需要安全上下文，推荐 HTTPS；本机 `localhost` / `127.0.0.1` 可用于开发和预览。手机通过电脑局域网的普通 HTTP 地址访问时，麦克风与安装能力可能不可用。

录音和训练数据不会上传到 GitHub、AI 服务或其他服务器。GitHub Pages 只提供应用静态文件。数据与浏览器、浏览器用户配置和站点来源绑定：本地开发地址、生产预览地址与 GitHub Pages 使用各自的数据空间；换浏览器或设备也不会自动共享记录。清除站点数据或使用不持久的隐私浏览窗口可能丢失记录。第一阶段不提供云同步或跨设备迁移。

PWA 首次在线打开 production build 并完成缓存后，可以离线打开已缓存的应用资源。离线能力不会把记录同步到别的设备，也不能绕过系统麦克风权限。

Phase 1.1 继续使用原有版本 1 IndexedDB 数据库，只为 Session 增加可选字段 `mainIdea`、`promptHintsUsed`、`voiceDifferenceRating` 和 `promptId`。参考静态文本不复制进 Session；用户勾选的表达对比保存在原有 `selfReview` 中。不会清空或重写原有训练、录音和设置；旧记录没有这些字段时仍可正常显示与回放。

## 技术与验证

技术栈：React 19、严格模式 TypeScript、Vite、CSS、IndexedDB、MediaRecorder、Web Audio、Web App Manifest 与 Service Worker。没有运行时后端依赖或在线 AI 调用。

单元测试使用 Vitest 与 fake-indexeddb，当前 **94 项**。保留原有 67 项，并增加 27 项本地参考库、完成后读取限制、稳定题目 ID、实际随机词桥接和旧记录兼容测试。覆盖计时开始 / 暂停 / 恢复、避免重复 interval、延迟回调与训练结束、四档随机词调度、Session 创建、每日计划、跨标签页首次打开、日历统计、Blob 持久化、设置兼容和数据删除，以及内容库和录音资源生命周期。

浏览器验证使用 Playwright，命令为 `npm run test:e2e`，包含原有 14 项回归、11 项 Phase 1.1 专项与新增 15 项优秀表达测试，共 **40 项**。覆盖桌面、320 / 390px 手机触屏仿真与内部实际滚动手势、虚拟麦克风录音与 A/B 回放、提示展开、主线保存、参考内容默认收起和按需读取、每日训练可跳过参考、历史与设置持久化、旧录音回放，以及离线首次打开全部参考分块。真实手机的麦克风硬件与添加到主屏幕仍需在该设备上确认。production build 可通过 `npm run build` 重新验证。

## GitHub Pages

专用公开仓库：[vizzinicoslett-code/SpeakGym](https://github.com/vizzinicoslett-code/SpeakGym)。Pages 地址：[SpeakGym · 表达训练场](https://vizzinicoslett-code.github.io/SpeakGym/)。工作流 `.github/workflows/deploy.yml` 会在 `main` 推送后安装锁定依赖、运行单元测试、生产构建、运行浏览器测试；全部通过才部署 `dist`，使用 `/SpeakGym/` 资源路径。当前部署结果以仓库 [Actions](https://github.com/vizzinicoslett-code/SpeakGym/actions) 为准。

首次发布使用 Git Credential Manager 登录，再运行专用发布脚本：

```powershell
git credential-manager github login
pwsh -NoProfile -File .\scripts\publish-github.ps1
```

脚本只允许上述仓库，自动创建公开专用仓库、推送 `main`、配置 Pages 并触发工作流。凭据只在进程内使用，不写入源代码或输出。后续在 `main` 提交后使用 `git push origin main` 即可自动更新。详细权限与失败处理见 [发布说明](docs/DEPLOYMENT.md)。

可以对实际公网版本重复执行相同的流程验收：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://vizzinicoslett-code.github.io/SpeakGym/'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

## 范围与限制

第一阶段提供四种练习、用户自评、本地录音与记录和基础 PWA。没有自动语音识别、AI 评分、账号、云同步、课程、社区、支付或 Electron。统计依据已保存的完成记录，不评价表达质量。录音效果和安装方式受浏览器及系统权限影响，仍需在实际设备上验证麦克风采集与扬声器试听。
