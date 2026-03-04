# 远程 OpenAI 全量判断（当前生效方案）

## 1. 目标
1. GitHub Actions 负责：
   - 爬取新闻源
   - 调用 OpenAI 完成全部判断（筛选、权重、失效、去重、大事件、提炼、排序）
   - 产出最终 Top12 到 `remote/news.remote.json`
2. 本地只负责：
   - 拉取远程结果
   - 直接发布到 `news.agent.json` 供网页展示
   - 不再做本地二次判断

## 2. 已改动的关键脚本
1. 远程脚本：`tools/remote-news-openai-agent.mjs`
2. 本地拉取：`tools/pull-remote-news.mjs`
3. 本地发布：`tools/publish-remote-agent.mjs`
4. 本地守护进程：`tools/local-sync-daemon.mjs`
5. 远程工作流：`.github/workflows/remote-news-agent.yml`

## 3. GitHub 配置
### 3.1 Secrets
在仓库 `Settings -> Secrets and variables -> Actions -> Secrets` 添加：
1. `OPENAI_API_KEY`（必填）

### 3.2 Variables（可选）
在 `Variables` 添加：
```text
OPENAI_MODEL=gpt-4.1-mini
REMOTE_MAX_CANDIDATES=1200
REMOTE_MAX_FEED_ITEMS=3000
OPENAI_STAGE1_CHUNK_SIZE=120
OPENAI_STAGE1_PICK_COUNT=24
OPENAI_STAGE2_POOL_LIMIT=360
OPENAI_REQUEST_GAP_MS=180
RAW_MAX_AGE_HOURS=72
```

### 3.3 工作流运行
工作流名：`Remote News Agent`  
触发方式：
1. 定时（每 10 分钟）
2. `Run workflow` 手动触发

## 4. 本地环境变量（PowerShell）
```powershell
Set-Location C:\Users\11601\codex
$env:REMOTE_NEWS_URL = "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/remote/news.remote.json"
```

私有仓库再加：
```powershell
$env:REMOTE_NEWS_AUTH_TOKEN = "<GitHub PAT>"
```

可选：
```powershell
$env:REMOTE_NEWS_TIMEOUT_MS = "12000"
$env:REMOTE_NEWS_STRICT = "0"
$env:REMOTE_AGENT_STRICT = "1"
```

## 5. 本地 daemon 执行顺序
1. `tools/trigger-remote-collector.mjs`（可选主动触发）
2. `tools/pull-remote-news.mjs`
3. `tools/publish-remote-agent.mjs`（直接发布远程 Top12）
4. `tools/update-market-snapshot.mjs`

## 6. 启动
```powershell
node tools/local-sync-daemon.mjs
node server.mjs
```

## 7. 验证是否“远程 OpenAI 全量判断”
看本地日志是否出现：
1. `[remote-pull] wrote news.remote.json ...`
2. `[remote-publish] wrote news.agent.json ...`

看 `news.agent.json` 的字段：
1. `inputSource` 应为 `remote-openai`
2. 每条应包含 `headlineZh/summaryZh/agentReasonZh/agentScore/agentRank/pinnedUntil`

## 8. 常见问题
1. `REMOTE_NEWS_URL not set`：本地未配置远程 URL。
2. `remote-publish ... does not look like OpenAI curated output`：
   - 远程工作流可能未成功调用 OpenAI。
   - 检查 GitHub Actions 中 `OPENAI_API_KEY` 是否正确。
3. 远程源失败列表：
   - 查看 `remote/news.remote.json` 的 `failedFeeds` 和 `failedSources`。
