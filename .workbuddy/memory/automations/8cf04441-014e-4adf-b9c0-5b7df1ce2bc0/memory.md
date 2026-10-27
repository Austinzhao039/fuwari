# 评论备份自动化 — 执行记录

## 任务
运行 `scripts/backup-comments.mjs --push`，把 Twikoo 评论导出到 `backups/comments.json` 并 commit+push 到 GitHub。

## 执行历史

### 2026-10-27 03:30
- 结果：成功（首次执行）
- 导出评论数：1 条
- 产生新提交：是，`11a3842`「备份评论（1 条，2026-10-26）」，改动 `backups/comments.json`
- 推送状态：HEAD 与 origin/main 一致（0 ahead / 0 behind），已同步
- 字段核对：id, nick, link, comment, url, created, updated, ua, ipRegion, master（无邮箱/IP 字段）
- `backups/private/` 未被跟踪，仅 `backups/comments.json` 入库

## 环境注意事项（下次执行可省事）
- 容器内 PATH 里**没有 git**，需用 `/host/usr/bin/git` 做核验（脚本自身调用 git 不受影响）。
- 本地分支是 `master`，远端跟踪 `origin/main`；`git status -sb` 显示 `## master...origin/main`，
  判断是否已推送看有无 `[ahead N]` 标记，或用 `git rev-list --left-right --count origin/main...HEAD`。
- 提交信息里的日期来自脚本内部（UTC），可能比本地日期早一天，属正常，无需修改。
