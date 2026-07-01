# Fuma Lab 运行手册

本文面向维护和运行当前仓库的操作人员，覆盖部署、检查、内容更新、回滚、
备份、升级和故障处理。所有命令默认在仓库根目录执行。

## 1. 运行基线

| 项目 | 当前值 |
| --- | --- |
| Compose 服务 | `docs` |
| 本地镜像 | `fuma-lab:local` |
| 应用入口 | `/docs` |
| 容器端口 | `3000` |
| 默认宿主机地址 | `127.0.0.1:3000` |
| 健康检查 | 容器内请求 `http://127.0.0.1:3000/docs` |
| Node.js | `24.18.0`，允许范围 `>=24.14.0 <25` |
| 重启策略 | `unless-stopped` |
| 持久化卷 | 无 |

运行模型是“源码和内容 → 多阶段 Docker 构建 → 只读容器”。文档、搜索索引
和静态资源都在镜像内。容器可随时替换，`content/docs` 和 Git 历史才是内容
的事实来源。

Compose 还应用以下约束：

- 以镜像内的 `node` 用户运行。
- 根文件系统只读，仅 `/tmp` 和 `/app/.next/cache` 使用临时文件系统。
- 删除全部 Linux capabilities，并启用 `no-new-privileges`。
- PID 上限为 256。
- `local` 日志驱动单文件上限 10 MiB，最多保留 3 个文件。
- 未设置 CPU 或内存上限；需在观测实际负载后再配置。

不要依赖自动生成的容器名。所有日常命令均以 Compose 服务名 `docs` 为目标。

## 2. 配置语义

| 设置 | 定义位置 | 默认值 | 修改后的动作 |
| --- | --- | --- | --- |
| `DOCS_PORT` | `compose.yaml` 端口映射 | `3000` | 重新创建容器 |
| `SITE_URL` | Compose 构建参数、Dockerfile 环境 | `http://localhost:3000` | 重新构建镜像并创建容器 |
| `NODE_VERSION` | `.node-version`、`Dockerfile`、`compose.yaml` | `24.18.0` | 同步三处并完整重建 |

`DOCS_PORT` 只改变宿主机端口，容器内部仍为 `3000`。`SITE_URL` 用于 Next.js
元数据基址并在构建阶段固化，因此重启现有容器不会更新它。

使用非默认端口时，两项应保持一致：

```bash
DOCS_PORT=3100 SITE_URL=http://127.0.0.1:3100 \
  docker compose up -d --build
```

使用域名时，保持 Compose 端口仅绑定回环地址，由同机受控反向代理访问：

```bash
SITE_URL=https://docs.example.com docker compose build --pull
docker compose up -d --no-build
```

反向代理、证书和认证不属于本仓库，部署前必须另行完成。

## 3. 初次部署

### 3.1 前置检查

Docker 路径只要求 Docker Engine 和 Compose v2：

```bash
docker version
docker compose version
docker compose config --quiet
git status --short
```

`git status` 应为空。若需要在宿主机执行 Node.js 检查，还需安装
`.node-version` 指定的 Node.js 版本并运行 `npm ci`。

确认目标端口没有被其他服务占用：

```bash
ss -ltnp | grep ':3000 '
```

没有输出通常表示端口空闲。若已占用，使用其他 `DOCS_PORT`，不要停止未知
服务。

### 3.2 构建和启动

将构建和切换分开，构建失败时现有容器仍继续运行：

```bash
docker compose build --pull
docker compose up -d --no-build
```

首次启动后检查：

```bash
docker compose ps
docker compose logs --tail=100 docs
curl -fsS http://127.0.0.1:3000/docs >/dev/null
```

`docker compose ps` 应显示 `healthy`。启动后等待健康检查完成；若持续处于
`starting` 或转为 `unhealthy`，按第 11 节检查。

## 4. 日常生命周期

```bash
# 状态
docker compose ps

# 最近日志
docker compose logs --tail=200 docs

# 持续跟踪日志
docker compose logs --tail=200 -f docs

# 重启现有容器，不重建镜像
docker compose restart docs

# 停止和重新启动
docker compose stop docs
docker compose start docs

# 删除容器和网络，保留镜像
docker compose down
```

只有进程临时异常时才使用 `restart`。内容、依赖、`SITE_URL` 或构建配置变化
都要求重新构建镜像。

检查运行时隔离：

```bash
docker inspect \
  --format 'User={{.Config.User}} Readonly={{.HostConfig.ReadonlyRootfs}} CapDrop={{json .HostConfig.CapDrop}}' \
  "$(docker compose ps -q docs)"
```

预期包含 `User=node`、`Readonly=true` 和 `["ALL"]`。

查看即时资源使用：

```bash
docker stats "$(docker compose ps -q docs)"
```

## 5. 更新个人内容

个人内容位于 `content/docs/(personal)`。括号表示 Fumadocs 路由分组，不会成为
URL 的一部分。

推荐流程：

1. 编辑或新增 `.mdx` 文件，并按需更新同目录 `meta.json`。
2. 本地运行 `npm run dev` 检查导航、链接和组件。
3. 执行完整验证。
4. 提交源码变更。
5. 按第 7 节保留当前镜像、构建、切换并检查。

完整验证命令：

```bash
npm run lint
npm run docs:check
npm run types:check
npm run build
docker compose config --quiet
```

容器没有内容卷；只编辑宿主机文件不会改变正在运行的页面。

## 6. 更新离线 Fumadocs 参考

正常构建和运行不联网。以下操作是主动的供应链更新，会访问 Fumadocs 官网和
GitHub，仅应在可审查的工作区执行。

### 6.1 更新前

```bash
git status --short
npm ci
npm run docs:check
```

工作区应为空，现有 23 篇快照应通过哈希检查。

### 6.2 同步和审查

```bash
npm run docs:sync
git diff --stat -- content/docs/fumadocs third_party/fumadocs/snapshot.json
git diff -- content/docs/fumadocs third_party/fumadocs/snapshot.json
npm run docs:check
```

同步脚本使用固定的 23 页白名单，验证响应类型和源地址，改写本地链接，去除
当前项目不支持的上游组件，并逐文件原子写入。`snapshot.json` 记录获取时间、
上游提交、来源 URL、公开 URL 和 SHA-256。

人工审查至少确认：

- 页面集合仍与固定白名单一致。
- 没有意外脚本、未知 MDX 组件或异常外链。
- 每页保留官网和源文件归属说明。
- `third_party/fumadocs/LICENSE` 和 `NOTICE.md` 完整。
- 导航、搜索、构建和容器烟雾测试通过。

若同步或审查失败，继续使用上一个已提交快照。不要手工修改快照后只更新
哈希。只有明确要放弃未提交同步结果时，才可执行：

```bash
git restore --source=HEAD -- content/docs/fumadocs third_party/fumadocs/snapshot.json
```

## 7. 发布与回滚

### 7.1 发布前保存当前镜像

`fuma-lab:local` 是可变标签。重建前为当前可用镜像创建唯一回滚标签：

```bash
ROLLBACK_TAG="fuma-lab:rollback-$(date +%Y%m%d-%H%M%S)"
docker image inspect fuma-lab:local >/dev/null
docker tag fuma-lab:local "$ROLLBACK_TAG"
printf '%s\n' "$ROLLBACK_TAG"
```

记录输出的标签。首次部署尚无旧镜像时跳过此步骤。

### 7.2 构建、切换和验证

```bash
docker compose build --pull
docker compose up -d --no-build --force-recreate
docker compose ps
curl -fsS http://127.0.0.1:3000/docs >/dev/null
curl -fsS http://127.0.0.1:3000/docs/fumadocs >/dev/null
```

若使用非默认端口或域名，构建时提供 `SITE_URL`，创建容器时提供
`DOCS_PORT`，并在检查命令中使用实际端口。

检查两个内容分区和搜索接口：

```bash
curl -fsS http://127.0.0.1:3000/docs | grep '个人文档'
curl -fsS http://127.0.0.1:3000/docs | grep 'Fumadocs 参考'
curl -fsS 'http://127.0.0.1:3000/api/search?query=Layout'
```

### 7.3 镜像回滚

新容器异常时，将已记录的回滚标签重新指向 Compose 使用的标签：

```bash
docker tag fuma-lab:rollback-YYYYMMDD-HHMMSS fuma-lab:local
docker compose up -d --no-build --force-recreate
docker compose ps
curl -fsS http://127.0.0.1:3000/docs >/dev/null
```

镜像回滚不会回退源码。修正源码或切换到已知 Git 提交后再构建，才能形成
持久的修复。不要在未保留本地修改时使用强制 Git 重置。

## 8. 备份与恢复

### 8.1 需要备份的内容

本服务没有数据库、上传目录或命名卷。必须保留的是：

- 完整 Git 仓库和所有已提交文档。
- 未提交但需要保留的个人内容。
- 可选的最近可用 Docker 镜像。
- 反向代理、TLS 和认证配置；它们位于本仓库之外。

本机 Git 提交不是异机备份。应配置受控的私有远端或定期生成并转移 Git
bundle。个人文档可能包含隐私内容，备份介质需要加密和访问控制。

创建只包含已提交历史的 Git bundle：

```bash
git status --short
BACKUP="../fumadocs-backup-$(date +%Y%m%d).bundle"
git bundle create "$BACKUP" --all
git bundle verify "$BACKUP"
```

可选地导出当前镜像：

```bash
docker save fuma-lab:local \
  | gzip > ../fuma-lab-image-$(date +%Y%m%d).tar.gz
```

### 8.2 从源码恢复

1. 恢复或克隆 Git 仓库。
2. 安装 Docker Engine 和 Compose v2。
3. 恢复仓库外的代理和访问控制配置。
4. 执行 `docker compose config --quiet`。
5. 使用正确的 `SITE_URL` 构建镜像。
6. 启动并执行第 7.2 节的检查。

从 bundle 恢复示例：

```bash
git clone fumadocs-backup-YYYYMMDD.bundle fumadocs
cd fumadocs
docker compose build --pull
docker compose up -d --no-build
```

从镜像归档临时恢复：

```bash
gzip -dc fuma-lab-image-YYYYMMDD.tar.gz | docker load
docker compose up -d --no-build
```

镜像归档适合快速恢复，但源码和 Git 历史仍是长期事实来源。

## 9. Node.js 与依赖升级

### 9.1 Node.js

升级 Node.js 时必须同步修改：

- `.node-version`
- `Dockerfile` 的默认 `NODE_VERSION`
- `compose.yaml` 的 `build.args.NODE_VERSION`
- `package.json` 的 `engines` 范围（仅在支持范围变化时）

随后执行 `npm ci`、完整验证和全新 Docker 构建。三处版本不一致会导致本地
开发、锁文件生成和容器构建使用不同运行时。

### 9.2 npm 与 Fumadocs

依赖变更必须同时提交 `package.json` 和 `package-lock.json`。Fumadocs 核心、
UI 和 MDX 包可能有配套要求，应一起阅读发行说明并在独立变更中升级。

最低验证：

```bash
npm ci
npm run lint
npm run docs:check
npm run types:check
npm run build
npm audit
docker compose build --pull --no-cache
docker compose up -d --no-build --force-recreate
```

不要盲目执行 `npm audit fix --force`。在 2026-07-01 的基线中，审计报告的
两个 moderate 项来自 Next.js 16.2.9 内嵌的 PostCSS 8.4.31；强制修复会引入
破坏性 Next.js 降级，因此当前选择等待稳定上游修复。升级时重新运行审计，
不要假设这一结论永久有效。

npm 11 还可能提示 `esbuild` 和 `sharp` 的安装脚本未获批准。当前本地和容器
构建均已通过，但不应无条件批准未知脚本；先核对包来源、版本和构建需求。

## 10. 安全要求

- 保持 Compose 端口绑定为 `127.0.0.1`。
- 公网访问前必须在外层提供 TLS 和身份认证。
- 当前应用不读取运行时密钥；不要把凭证写入 MDX、镜像构建参数或仓库。
- `.env` 文件被 Git 和 Docker 构建上下文排除，但仍需限制本机权限。
- 离线参考是经过修改的第三方内容，更新后必须审查差异和许可证。
- 定期检查基础镜像、npm 依赖和宿主机 Docker 更新。
- 备份中包含个人内容时，使用加密存储和最小权限。

若误将端口暴露到公网，应先在防火墙或 Compose 层撤销暴露，再检查访问日志
和内容敏感性；仅增加页面提示不构成访问控制。

## 11. 故障处理

| 现象 | 检查 | 处理 |
| --- | --- | --- |
| 容器未启动 | `docker compose ps -a`、`docker compose logs docs` | 修正配置或构建错误后重新创建 |
| 状态为 `unhealthy` | 日志、容器内 `/docs` 健康请求、磁盘和内存 | 先确认进程错误，再重启；持续失败则回滚 |
| 宿主机端口冲突 | `ss -ltnp \| grep ':3000 '` | 使用其他 `DOCS_PORT`，不要停止未知服务 |
| 修改内容后页面不变 | `git diff`、镜像创建时间 | 内容在镜像内，重新构建并创建容器 |
| `/` 返回非文档页或跳转 | 请求 `/docs` | 当前文档入口固定为 `/docs` |
| `SITE_URL` 仍是旧值 | 检查构建命令和页面元数据 | 使用正确变量重新构建；重启无效 |
| `docs:check` 哈希不匹配 | 检查快照和 `snapshot.json` 差异 | 审查并重新同步，或恢复完整的已提交快照 |
| `docs:sync` 请求失败 | 网络、官网响应、GitHub API 限制 | 保留旧快照，稍后重试；不要提交部分结果 |
| 构建失败但旧站仍可用 | `docker compose build` 输出 | 不执行切换，修复后重建 |
| 中文搜索结果不理想 | `app/api/search/route.ts` | 当前分词语言为 `english`，属于已知限制 |
| 磁盘空间持续增长 | `docker system df`、镜像和构建缓存 | 确认回滚需求后按第 12 节清理 |

进一步诊断健康状态：

```bash
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q docs)"
docker compose logs --since=30m docs
curl -v http://127.0.0.1:3000/docs
```

## 12. 清理

先确认当前容器、镜像和回滚需求：

```bash
docker compose ps
docker image ls 'fuma-lab'
docker system df
```

删除已确认不再需要的单个回滚镜像：

```bash
docker image rm fuma-lab:rollback-YYYYMMDD-HHMMSS
```

清理未使用的构建缓存：

```bash
docker builder prune
```

不要使用未经检查的 `docker system prune -a`，它可能删除其他项目镜像和可用
回滚点。

## 13. 快速命令

| 目的 | 命令 |
| --- | --- |
| 配置检查 | `docker compose config --quiet` |
| 启动 | `docker compose up -d --no-build` |
| 状态 | `docker compose ps` |
| 日志 | `docker compose logs --tail=200 -f docs` |
| 构建 | `docker compose build --pull` |
| 重新创建 | `docker compose up -d --no-build --force-recreate` |
| 停止 | `docker compose down` |
| 快照校验 | `npm run docs:check` |
| 完整应用构建 | `npm run build` |
| HTTP 烟雾检查 | `curl -fsS http://127.0.0.1:3000/docs >/dev/null` |
