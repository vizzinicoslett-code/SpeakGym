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

| 训练模式    | 练习内容                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ |
| 三根钉子    | 随机问题、5 / 10 秒或不限时准备、WHAT / SO WHAT / NOW WHAT 提醒、30 / 60 / 90 秒讲话与自评 |
| Triple Step | 原话题持续可见，随机词自动出现并播放轻提示音；四种难度，结束后自行确认词语使用与主线保持   |
| 声音唤醒    | 同一句话练习自然表达、关键词强调、语速、停顿和情绪；最多五遍录音试听比较                   |
| 不停说      | 3 秒准备，30 / 45 / 60 / 90 秒讲话，记录流畅度和最长卡顿                                   |

今日训练按“不停说 60 秒 → 三根钉子 60 秒 → Triple Step 120 秒 → 声音唤醒 60 秒”安排。每项自评保存后进入下一项；五分钟指讲话时间，准备、自评和试听另计。

其他功能包括本周训练天数、累计时长、连续训练天数与模式次数，训练记录详情及删除，录音播放与删除，本地空间查看、批量删除录音和二次确认清空数据。设置分别保存三根钉子默认时长（初始 60 秒）和不停说默认时长（初始 30 秒），并提供录音、提示音、Triple Step 难度和每日首次打开训练的选项。

内容库独立放在 `src/data/`，包含至少 100 个结构化问题、60 个 Triple Step 主问题、300 个普通中文干扰词与 60 句声音练习句。

桌面快捷键：Space 开始 / 暂停，Enter 下一步 / 确认，R 重开本轮，N 换题，Esc 退出。输入框、下拉框等控件内不触发训练快捷键。

## 数据与录音

录音使用浏览器 MediaRecorder；提示音使用 Web Audio API。第一次开启录音需要浏览器麦克风许可。浏览器不支持或权限被拒绝时，仍可继续不录音的训练。

麦克风和 PWA 需要安全上下文，推荐 HTTPS；本机 `localhost` / `127.0.0.1` 可用于开发和预览。手机通过电脑局域网的普通 HTTP 地址访问时，麦克风与安装能力可能不可用。

录音和训练数据不会上传到 GitHub、AI 服务或其他服务器。GitHub Pages 只提供应用静态文件。数据与浏览器、浏览器用户配置和站点来源绑定：本地开发地址、生产预览地址与 GitHub Pages 使用各自的数据空间；换浏览器或设备也不会自动共享记录。清除站点数据或使用不持久的隐私浏览窗口可能丢失记录。第一阶段不提供云同步或跨设备迁移。

PWA 首次在线打开 production build 并完成缓存后，可以离线打开已缓存的应用资源。离线能力不会把记录同步到别的设备，也不能绕过系统麦克风权限。

## 技术与验证

技术栈：React 19、严格模式 TypeScript、Vite、CSS、IndexedDB、MediaRecorder、Web Audio、Web App Manifest 与 Service Worker。没有运行时后端依赖或在线 AI 调用。

单元测试使用 Vitest 与 fake-indexeddb，当前 **47 项通过**。覆盖计时开始 / 暂停 / 恢复、避免重复 interval、延迟回调与训练结束、四档随机词调度、Session 创建、每日计划、跨标签页首次打开、日历统计、Blob 持久化、设置兼容和数据删除，以及内容库和录音资源生命周期。

后台 UI 验证使用 Playwright，命令为 `npm run test:e2e`。最终用例数量与验收结果在发布前更新；此处不代表已完成 UI 验收或线上部署。production build 可通过 `npm run build` 重新验证。

## GitHub Pages 发布准备

仓库目标为新的公开 `vizzinicoslett-code/SpeakGym`。工作流 `.github/workflows/deploy.yml` 会在 `main` 推送后安装锁定依赖、运行单元测试、构建应用并部署 `dist` 到 GitHub Pages，使用 `/SpeakGym/` 资源路径。

**当前未完成发布，不应把预期地址视为已上线。** 本机已安装 Git Credential Manager，但尚无已保存的 GitHub 登录。先在本机终端执行并按浏览器指引登录：

```powershell
git credential-manager github login
```

登录后，通过 GitHub 网页或使用标准 Git 凭据的 GitHub REST API 创建上述公开仓库，再将当前项目推送到 `main`，并把仓库 Pages 发布来源设为 GitHub Actions。自动化调用应只在进程内读取和使用 Git Credential Manager 凭据；不要把 token 复制到聊天、源代码、配置文件或提交中。

发布完成应检查 Actions 部署成功，并实际打开 Pages 地址验证资源、录音提示和离线缓存，再记录可用的线上链接。

## 范围与限制

第一阶段提供四种练习、用户自评、本地录音与记录和基础 PWA。没有自动语音识别、AI 评分、账号、云同步、课程、社区、支付或 Electron。统计依据已保存的完成记录，不评价表达质量。录音效果和安装方式受浏览器及系统权限影响，仍需在实际设备上验证麦克风采集与扬声器试听。
