# Artalk 评论后端部署（约 10 分钟）

目标：让博客评论区同时具备

- **必须登录 GitHub 才能评论**（Artalk 的 GitHub OAuth）
- **每条评论显示 IP 归属地**（如「上海电信」）和**浏览器 / 系统**（如 `Chrome 141`、`macOS 10.15.7`）
- **发送前的《用户须知》**（前端已实现，见 `src/components/comment/Artalk.astro`）
- 审核 + 违禁词（命中进待审队列）

Artalk 是一个单文件 Go 服务 + SQLite，不需要额外的数据库。

---

## 1. 在服务器上准备目录

```bash
mkdir -p /opt/artalk/data
cd /opt/artalk
```

把本目录（`deploy/artalk/`）里的 `docker-compose.yml`、`artalk.yml`、`data/keywords.txt` 上传到 `/opt/artalk/`。

## 2. 下载 IP 属地数据库

```bash
cd /opt/artalk/data
# 国内镜像（推荐）
curl -L -o ip2region.xdb https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data/ip2region_v4.xdb
ls -lh ip2region.xdb      # 应该约 11MB
```

> 这个文件是 Artalk 显示归属地的依据，**缺了就不显示地区**。

## 3. 生成 app_key

```bash
openssl rand -hex 32
```

把输出填进 `artalk.yml` 的 `app_key`。

## 4. 建 GitHub OAuth App

打开 https://github.com/settings/developers → `New OAuth App`：

| 字段 | 值 |
| --- | --- |
| Application name | `Austin 的博客评论` |
| Homepage URL | `https://www.austin666.top` |
| Authorization callback URL | `https://www.austin666.top/comments-api/api/v2/auth/github/callback` |

创建后点 `Generate a new client secret`，记下 **Client ID** 和 **Client Secret**，填进 `artalk.yml`：

```yaml
auth:
  github:
    enabled: true
    client_id: "Ov23li..."      # 你的
    client_secret: "..."        # 你的，别泄露
```

## 5. 启动

```bash
cd /opt/artalk
docker compose up -d
docker compose logs -f --tail=30      # 看到 Fiber 启动信息即可
```

容器只监听 `127.0.0.1:23366`，不直接对外。

## 6. nginx 反代（1Panel → 网站 → 配置文件）

在 `www.austin666.top` 的 server 块里加：

```nginx
# Artalk 评论接口（不要缓存！）
location ^~ /comments-api/ {
    proxy_pass http://127.0.0.1:23366/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # 关键：Artalk 靠这个头识别访客真实 IP，用来显示归属地
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    client_max_body_size 10m;
}
```

重载 nginx 后验证：

```bash
curl -s https://www.austin666.top/comments-api/api/v2/conf
# 期望：{"frontend_conf":{...},"version":{"app":"artalk","version":"2.10.0"}}
```

> 用了腾讯 EdgeOne 的话，确认 `/comments-api/` 走「不缓存」策略，否则接口会被 CDN 缓存成 404/500。

## 7. 初始化管理员

浏览器打开 **https://www.austin666.top/comments-api/**，第一次会让你创建管理员账号（邮箱 + 密码）。
后台里可以：审核评论、看 IP/UA、改违禁词、看统计。

## 8. 回到博客这边切换

服务器通了以后告诉我一声，我做这几步并验证：

1. `src/config.ts` 里 `provider` 改成 `"artalk"`（或构建时 `COMMENT_PROVIDER=artalk`）
2. `npm run build` → 覆盖 `dist.zip`
3. 用无头浏览器实测：同意书 → GitHub 登录按钮 → 发评论 → 属地/浏览器显示

---

## 常见问题

**评论区显示「评论服务暂时不可用」**
前端会先探活 `GET /comments-api/api/v2/conf`。这条 404/超时就是反代没配好，或容器没起来。

**归属地一直是空的**
1. `data/ip2region.xdb` 没放或路径不对；
2. nginx 没传 `X-Forwarded-For`（Artalk 拿到的就是 127.0.0.1）；
3. `artalk.yml` 里 `http.proxy_header` 与 nginx 传的头名不一致。

**登录后回到博客还是没登录**
`auth.callback` 必须和 GitHub OAuth App 里填的完全一致（含 `https://`、`/comments-api` 前缀、结尾没有斜杠）。

**万一 OAuth 配坏了，谁都发不了评论**
临时把 `auth.anonymous` 改成 `true` 并重启，即可放开匿名评论：

```bash
sed -i 's/anonymous: false/anonymous: true/' /opt/artalk/artalk.yml
cd /opt/artalk && docker compose restart
```

**数据在哪 / 怎么备份**
`/opt/artalk/data/artalk.db`（SQLite 单文件），直接复制即可。
