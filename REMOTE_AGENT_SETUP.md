# 远程新闻采集 + 本地展示（GitHub Actions 方案）

## 1. 远程端准备（GitHub）
1. 把当前工程推到你的 GitHub 仓库。
2. 在仓库 `Settings -> Secrets and variables -> Actions` 添加：
   - `OPENAI_API_KEY`（必填）
3. 可选添加仓库变量：
   - `OPENAI_MODEL`（例如 `gpt-4.1-mini`，不填则脚本默认该值）
4. 在仓库 `Actions` 页面启用工作流 `Remote News Agent`。

工作流文件：`.github/workflows/remote-news-agent.yml`  
脚本文件：`tools/remote-news-openai-agent.mjs`

远程会每 10 分钟更新：
- `remote/news.remote.json`
- `remote/news.remote.js`

## 2. 本地端准备
本地拉取脚本：`tools/pull-remote-news.mjs`

本地守护进程顺序：
1. `tools/trigger-remote-collector.mjs`（可选，主动触发远程采集）
2. `tools/pull-remote-news.mjs`
3. `tools/update-news-snapshot.mjs`
4. `tools/news-impact-agent.mjs`
5. `tools/update-market-snapshot.mjs`

## 3. 本地环境变量（PowerShell）
如果仓库是公开的，使用 raw URL：

```powershell
$env:REMOTE_NEWS_URL = "https://raw.githubusercontent.com/<你的用户名>/<你的仓库名>/<分支>/remote/news.remote.json"
```

如果仓库是私有的，再设置 token：

```powershell
$env:REMOTE_NEWS_AUTH_TOKEN = "<你的GitHub PAT>"
```

可选项：

```powershell
$env:REMOTE_NEWS_TIMEOUT_MS = "12000"
$env:REMOTE_NEWS_STRICT = "0"
```

如果你希望本地每轮主动触发 GitHub 远程工作流（而不只依赖远程定时），再设置：

```powershell
$env:GITHUB_REMOTE_OWNER = "<你的GitHub用户名或组织>"
$env:GITHUB_REMOTE_REPO = "<你的仓库名>"
$env:GITHUB_REMOTE_WORKFLOW = "remote-news-agent.yml"
$env:GITHUB_REMOTE_REF = "<分支名，比如 main>"
$env:GITHUB_REMOTE_TOKEN = "<有 Actions 写权限的 PAT>"
$env:GITHUB_REMOTE_MIN_INTERVAL_MINUTES = "30"
```

## 4. 启动本地服务
```powershell
node tools/local-sync-daemon.mjs
node server.mjs
```

## 5. 排障建议
- 本地日志出现 `[remote-pull] REMOTE_NEWS_URL not set`：未设置远程地址。
- 本地日志出现 `[remote-trigger] skip: GITHUB_REMOTE_OWNER/REPO/TOKEN not configured.`：未启用主动触发（可忽略）。
- 远程没有产出文件：检查 Actions 任务是否执行成功、`OPENAI_API_KEY` 是否有效。
- 私有仓库 404/401：检查 `REMOTE_NEWS_AUTH_TOKEN` 权限（至少能读取仓库内容）。
