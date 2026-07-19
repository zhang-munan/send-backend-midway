# GitHub 发布操作手册

这套方案把后端和管理端构建为 Docker 镜像，保存在 GitHub Container Registry（GHCR）。服务器只保存运行配置和数据；创建版本标签后，GitHub Actions 会构建镜像，经过 `production` 审批再更新容器。

> 用户端 H5 由 HBuilderX 手工构建，构建产物通过 GitHub Release 上传后自动部署；微信小程序审核发布仍是独立流程。

## 1. 提交发布文件

在电脑终端执行。命令只暂存本次发布文件，不会碰其他未提交改动：

```bash
cd /Users/zhangmunan/project/bangni-shuochukou/backend
git add .gitignore .dockerignore src/comm/path.ts src/config/config.default.ts src/config/config.prod.ts Dockerfile.production deploy .github pnpm-lock.yaml
git commit -m "ci: add production deployment"
git push -u origin release/0.x

cd /Users/zhangmunan/project/bangni-shuochukou/frontend/admin
git add .dockerignore Dockerfile.production .github
git commit -m "ci: add production deployment"
git push -u origin release/0.x

cd /Users/zhangmunan/project/bangni-shuochukou/frontend/user-app
git add .dockerignore Dockerfile.h5 deploy scripts .github config/prod.ts
git commit -m "ci: add H5 release deployment"
git push -u origin release/0.x
```

三个项目的首个发布分支统一为 `release/0.x`。后续开发从该发布分支创建 `feature/**`，完成后通过 Pull Request 合并回 `release/0.x`；正式版本只能从 `release/**` 构建和发布。现有 `8.x` 和 `main` 暂时保留为历史基线。

`backend/pnpm-lock.yaml` 过去被忽略，本次必须提交；它保证云端每次安装同一批依赖版本。

## 2. 初始化服务器（只做一次）

先确认服务器已有 Docker、Docker Compose v2、Nginx 和现有生产 MySQL。先备份数据库；本方案不会创建、删除或迁移数据库。

```bash
docker --version
docker compose version
sudo nginx -t
sudo mkdir -p /opt/apps/bangni-shuochukou/uploads
sudo chown -R deploy:deploy /opt/apps/bangni-shuochukou
```

将本目录的 `compose.production.yml` 上传为服务器上的 `/opt/apps/bangni-shuochukou/compose.yml`，并将 `.env.production.example` 上传为 `/opt/apps/bangni-shuochukou/.env.production`。编辑 `.env.production`：

- `DB_HOST` 保持 `mysql`，它会通过服务器已有的外部 Docker 网络 `app-net` 访问共享 MySQL。
- 填现有数据库的端口、账号、密码与库名。
- 执行 `openssl rand -hex 32`，把输出填入 `APP_KEYS`。
- 把三个镜像地址中的 `你的GitHub用户名` 改为实际 GitHub 用户名。

然后执行：

```bash
chmod 600 /opt/apps/bangni-shuochukou/.env.production
```

继续使用现有 `app_user`，不要让应用使用 MySQL `root`。先确认它能从 Docker 网络连接并且仅拥有所需数据库权限：

```sql
SELECT User, Host FROM mysql.user WHERE User = 'app_user';
SHOW GRANTS FOR 'app_user'@'%';
```

`Host` 需要包含 `%` 或允许 `app-net` 网段，否则动态容器地址无法连接；授权中应包含 `db_bangni.*`。如果缺少该库权限，再执行 `GRANT ALL PRIVILEGES ON db_bangni.* TO 'app_user'@'%';`。MySQL 公网端口仍应由 UFW 和云安全组限制。

## 3. 配置 Nginx 和 GHCR

将 `nginx-site.conf.example` 的域名、证书路径改为真实值，安装为 Nginx 站点配置。你现有配置中 `location /` 的静态 `root /var/www/mljxcloud` 段，要替换为该示例的 `proxy_pass http://127.0.0.1:8101` 段。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

在 GitHub 个人设置创建一个仅限这三个仓库、权限为 **Packages: Read** 的 fine-grained token。仅在服务器运行：

```bash
docker login ghcr.io -u 你的GitHub用户名
```

按提示粘贴 token。不要把 token、数据库密码或 `.env.production` 放入 GitHub。

## 4. 配置 GitHub Secrets 和审批

在电脑生成专用部署 SSH 密钥：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/bangni_github_deploy -C "bangni-github-deploy"
```

将 `.pub` 文件内容追加到服务器部署用户的 `~/.ssh/authorized_keys`。分别进入后端、管理端和用户端三个仓库的 **Settings → Secrets and variables → Actions**，都添加：

| 名称 | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 服务器公网 IP 或域名（不带 `https://`） |
| `DEPLOY_PORT` | SSH 端口，通常 `22` |
| `DEPLOY_USER` | 服务器部署用户名，例如 `ubuntu` |
| `DEPLOY_SSH_KEY` | 私钥文件的完整内容（不是 `.pub`） |

接着在每个仓库 **Settings → Environments** 创建 `production`：只允许 `v*` 标签部署；如果当前 GitHub 套餐支持，设置 Required reviewer。最后在 **Settings → Actions → General** 确认 `GITHUB_TOKEN` 允许读写权限，以便推送 GHCR 镜像。

## 5. 第一次发布

先后端、再管理端；分别在两个仓库执行：

```bash
git tag v0.1.0
git push origin v0.1.0
```

打开 GitHub 的 **Actions** 页面，等待检查完成；在 `Publish image and deploy production` 等待处点 **Review deployments → Approve and deploy**。首次后端发布成功后，再发布管理端。

在服务器核查：

```bash
cd /opt/apps/bangni-shuochukou
docker compose --env-file .env.production -f compose.yml ps
docker compose --env-file .env.production -f compose.yml logs --tail=100 bangni-backend
```

## 6. 发布手机端 H5

1. 确保用户端代码已经通过 Pull Request 合并到对应的 `release/**` 分支，本地切换并更新。以下以 `release/0.x` 为例：

```bash
cd /Users/zhangmunan/project/bangni-shuochukou/frontend/user-app
git switch release/0.x
git pull --ff-only origin release/0.x
```

2. 在 HBuilderX 中打开 `user-app`，选择 **发行 → 网站-PC Web或手机H5**。构建完成后确认存在 `unpackage/dist/build/h5/index.html`。
3. 上传构建产物并创建 GitHub Release：

```bash
bash scripts/publish-h5-release.sh v0.1.0
```

脚本只上传一个 `h5-dist.tar.gz` Release 附件，不会把 `unpackage` 提交到 Git。Release 创建后，GitHub Actions 会构建 H5 Nginx 镜像；审批 `production` 后自动更新服务器 `127.0.0.1:8102`。
4. 给 H5 域名配置 `nginx-site.conf.example` 中的 H5 server 段和 HTTPS 证书，然后运行 `sudo nginx -t && sudo systemctl reload nginx`。

## 日常发布与回滚

后端和管理端每次审核合并到 `release/**` 后创建新标签。H5 合并到 `release/**` 后由 HBuilderX 构建，再运行发布脚本创建 Release。工作流会验证版本提交确实属于远程 `release/**` 分支。只更新某一端，就只发布对应仓库。回滚时，在 GitHub **Actions → 对应工作流 → Run workflow**，在 `version` 填已发布过的旧标签，再审批即可。
