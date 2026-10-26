# 自建图床（免费、无限容量）

这是给博客评论区用的图片上传服务，200 行、零依赖、兼容兰空图床（LskyPro）v1 协议，
所以 **Twikoo 后台直接选 `lskypro` 就能接上**，不用改任何代码。

## 为什么不用现成的免费图床

都实测过：

| 图床 | 结论 |
| --- | --- |
| sm.ms / smms.app | API 超时，国内连不上 |
| telegra.ph / catbox.moe / 0x0.st | 国内连不上或 503 |
| 7bu.top | **收费**（首页写着空间套餐续费） |
| img.ink | 游客不许上传，要注册会员 |
| freeimage.host | 免注册能传，但 Twikoo 1.6.44 不支持 chevereto 协议 |

自己跑一个：容量只受服务器硬盘限制，永久免费，图片地址归自己。

---

## 部署（约 10 分钟，在**你自己的服务器**上操作）

### 1. 上传三个文件

把本目录的 `server.mjs` / `Dockerfile` / `docker-compose.yml` 传到服务器，比如放在 `/opt/img-host`：

```bash
sudo mkdir -p /opt/img-host
# 在你本地电脑执行（把文件传上去）
scp deploy/img-host/{server.mjs,Dockerfile,docker-compose.yml} 用户名@服务器IP:/tmp/
# 再在服务器上
sudo mv /tmp/server.mjs /tmp/Dockerfile /tmp/docker-compose.yml /opt/img-host/
```

### 2. 生成口令并启动

```bash
cd /opt/img-host
# 生成一串随机口令，记下来，后面 Twikoo 后台要填
openssl rand -hex 24
```

把口令填进 `docker-compose.yml` 的 `UPLOAD_TOKEN`（用 `sudo nano docker-compose.yml`），然后：

```bash
sudo docker compose up -d --build
sudo docker compose logs -f --tail=20     # 看到 "监听 :3000" 就成了，Ctrl+C 退出日志
```

自测一下（在服务器上执行）：

```bash
curl -s http://127.0.0.1:3000/
# 期望：{"ok":true,"service":"img-host","maxMB":8}
```

### 3. nginx 加两段配置

编辑博客/Twikoo 那个站点的 nginx 配置（`/etc/nginx/conf.d/xxx.conf` 或
`/www/server/panel/vhost/nginx/xxx.conf`），在 `server { ... }` 里加：

```nginx
    # ① 图片对外访问：直接由 nginx 发静态文件，比走 Node 快
    location /img/ {
        alias /opt/img-host/data/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ② 上传接口：转给容器（Twikoo 服务端会调它）
    location /img-api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        client_max_body_size 12m;
    }
```

> **重要**：Twikoo 自己的那个 location 也要放开请求体大小。
> Twikoo 收图时前端是把图片转成 base64 发给后端的（5MB 图 ≈ 6.7MB body），
> nginx 默认只有 1MB，会直接 413。在 `server{}` 或 twikoo 的 location 里加上：
> ```nginx
> client_max_body_size 12m;
> ```

保存后检查并重载：

```bash
sudo nginx -t && sudo nginx -s reload
```

### 4. Twikoo 后台填三个值

登录 <https://twikoo.austin666.top/admin>（或你 /admin 后台的「设置」），
在「图片上传」那组填：

| 配置项 | 值 |
| --- | --- |
| `IMAGE_CDN` | `lskypro` |
| `IMAGE_CDN_URL` | `https://twikoo.austin666.top/img-api` |
| `IMAGE_CDN_TOKEN` | 第 2 步生成的那串口令 |

> `IMAGE_CDN_URL` 里的域名要用**你 nginx 上配了 `/img-api/` 的那个站点的域名**。
> 走公网域名是故意的：Twikoo 跑在 Docker 里，直接写 `127.0.0.1:3000` 会指向容器自己。

### 5. 验证

打开任意文章 → 评论区点图片按钮 → 选一张图 → 评论里应该出现
`![图片](https://twikoo.austin666.top/img/2026/10/xxxxxxxx.png)`，发出去后图片能正常显示。

---

## 约束与说明

- **图片上限 8MB**（`MAX_BYTES` 可改）。前端另外还有 5MB 的拦截，正常用户最多传 5MB。
- **只收图片**：png / jpg / gif / webp / bmp / avif / svg，按文件头判断真身，改后缀骗不过去。
- **视频不支持**：Twikoo 本身就没有视频上传功能，评论里贴 B 站/YouTube 链接。
- **口令不要泄露**：它是唯一的上传凭证。传出去别人就能往你磁盘里塞图片。
- **备份**：图片就是 `/opt/img-host/data/` 目录下的普通文件，`tar czf img-$(date +%F).tar.gz data/` 即可。
- **换域名**：改 `PUBLIC_BASE` 后重启容器即可，已经存下的图片路径不变。

## 本地不用 Docker 直接跑

```bash
UPLOAD_TOKEN=test123 DATA_DIR=/tmp/img PORT=3000 PUBLIC_BASE=http://127.0.0.1:3000 node server.mjs
```

```bash
curl -X POST http://127.0.0.1:3000/api/v1/upload \
  -H "Authorization: Bearer test123" -F "file=@a.png"
```
