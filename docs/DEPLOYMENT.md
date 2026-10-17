# 发布到 GitHub Pages

发布目标固定为公开的专用仓库 [vizzinicoslett-code/SpeakGym](https://github.com/vizzinicoslett-code/SpeakGym)，站点地址为 [https://vizzinicoslett-code.github.io/SpeakGym/](https://vizzinicoslett-code.github.io/SpeakGym/)。地址需要等 GitHub Actions 部署成功后才能访问。

## 首次登录

需要 Git for Windows（含 Git Credential Manager）、PowerShell 7、Node.js 22 及 npm。在项目目录打开 PowerShell，由你完成一次 GitHub 浏览器登录：

```powershell
git credential-manager github login --username vizzinicoslett-code --browser
```

浏览器中确认使用 `vizzinicoslett-code` 账号。发布脚本不会主动打开登录窗口，也不接受 token 参数；它通过 Git Credential Manager 的标准 credential fill 协议在内存中读取凭据，不把 token 写入文件、命令行参数或输出。

## 检查并发布

发布前运行本地验收，确保所有源文件已提交到 `main`，工作区没有未提交或未跟踪文件：

```powershell
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
git status --short
```

只读检查不会创建仓库、推送代码、修改 Pages 或触发工作流：

```powershell
pwsh -NoProfile -File .\scripts\publish-github.ps1 -CheckOnly
```

检查成功后发布：

```powershell
pwsh -NoProfile -File .\scripts\publish-github.ps1
```

脚本先通过 `GET /user` 核实账号完全匹配，然后检查 `main` 的提交状态和所有远程目标。仓库不存在时，创建公开的 `SpeakGym` 仓库；仓库已存在时，核对仓库所有者、公开状态、描述、项目文件和管理权限。非空仓库需要 `package.json` 的名称为 `speakgym`，且 `README.md` 同时包含 `SpeakGym` 与 `表达训练场`。不匹配的仓库、其他远程地址、已有自定义域名都会使脚本停止。

发布只推送 `main`，不强制覆盖远程提交。随后将这个仓库的 Pages 构建方式设为 GitHub Actions，并触发 `deploy.yml`，避免第一次推送与 Pages 初始化时序不同导致遗漏部署。它不会提交本地修改、切换其他仓库或修改账号下的其他项目。

打开 [Actions](https://github.com/vizzinicoslett-code/SpeakGym/actions) 查看结果。工作流依次安装锁定依赖、运行单元测试、执行生产构建、运行 Chromium 无界面浏览器测试；全部通过后才上传静态站点并部署。脚本输出“已触发”表示请求成功，实际发布状态以工作流结果为准。

## 无法发布时

退出码 `0` 表示检查通过或部署请求已提交；`2` 表示没有可用的 GCM 凭据或凭据已过期，需要重新登录；`1` 表示工作区、仓库身份、权限、网络或发布步骤未通过。脚本只报告失败步骤与 HTTP 状态，不回显凭据或原始响应。

GitHub 授权需要允许创建/推送该仓库和修改 Actions 工作流；初始化 Pages 还需要仓库管理与 Pages 写入权限，手动触发需要 Actions 写入权限。权限不足时，通过 GitHub/GCM 更新授权后重试。脚本可能已经完成前面的步骤，例如已创建仓库或已推送源码；它不会为回滚而删除仓库或覆盖提交，修复问题后可再次运行。

如果 Pages 初始化权限受限，可以在该仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，再到 **Actions → Test and deploy SpeakGym to GitHub Pages → Run workflow** 选择 `main`。

## 子路径、离线与数据

Vite 与工作流使用 `/SpeakGym/` 子路径。`manifest.webmanifest` 的 `id`、`start_url`、`scope` 均相对于当前项目路径。其他本地托管路径可以通过 `VITE_BASE_PATH` 配置，例如：

```powershell
$env:VITE_BASE_PATH = '/'
npm run build
Remove-Item Env:VITE_BASE_PATH
```

在线完整打开一次生产站点并完成 Service Worker 安装后，静态资源可以离线打开。每次构建根据资源内容生成新的缓存版本；更新安装完成后只清理本项目路径下的旧缓存。在线导航优先获取新版页面，离线回退到已完整缓存的一版。

GitHub Pages 托管公开的应用源码与静态资源。训练记录和录音保存在浏览器当前站点的 IndexedDB，应用不上传这些内容。从 localhost 换到 GitHub Pages 属于不同站点，本地记录不会自动迁移；更换设备或浏览器也不会同步。

相关官方说明：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Pages REST API](https://docs.github.com/en/rest/pages/pages)、[触发 Actions 工作流](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
