# Fuma Lab 运行手册

本文面向维护和运行当前仓库的操作人员，覆盖部署、检查、内容更新、回滚、
备份、升级和故障处理。所有命令默认在仓库根目录执行。

## 1. 运行基线

| 项目 | 当前值 |
| --- | --- |
| Compose 服务 | `docs` |
| 生产镜像 | `fuma-lab:prod` |
| 本地开发镜像 | `fuma-lab:local` |
| 应用入口 | `/docs` |
| 容器端口 | `3000` |
| 生产宿主机地址 | `127.0.0.1:3000` |
| 裸 `docker compose` 本地沙箱 | `fuma-lab-local`，`127.0.0.1:3009` |
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
| `COMPOSE_PROJECT_NAME` | 部署脚本或环境文件 | production: `fuma-lab`；staging: `fuma-lab-stg`；本地沙箱: `fuma-lab-local` | 重新创建目标项目容器 |
| `DOCS_IMAGE` | 部署脚本或环境文件 | production: `fuma-lab:prod`；staging: `fuma-lab:stg`；本地沙箱: `fuma-lab:local` | 重新构建并创建容器 |
| `DOCS_PORT` | `compose.yaml` 端口映射 | production: `3000`；staging: `3001`；本地沙箱: `3009` | 重新创建容器 |
| `SITE_URL` | Compose 构建参数、Dockerfile 环境 | production 默认 `http://localhost:3000`，正式域名应在 `envs/production.env` 设置 | 重新构建镜像并创建容器 |
| `ROBOTS_NOINDEX` | Compose 构建参数、Next.js headers | staging: `1`；production: 未设置 | 重新构建镜像并创建容器 |
| `NODE_VERSION` | `.node-version`、`Dockerfile`、`compose.yaml` | `24.18.0` | 同步三处并完整重建 |

`DOCS_PORT` 只改变宿主机端口，容器内部仍为 `3000`。`SITE_URL` 用于 Next.js
元数据基址并在构建阶段固化，因此重启现有容器不会更新它。

使用非默认端口时，两项应保持一致：

```bash
DOCS_PORT=3100 SITE_URL=http://127.0.0.1:3100 npm run deploy
```

使用域名时，保持 Compose 端口仅绑定回环地址，由同机受控反向代理访问：

```bash
SITE_URL=https://docs.example.com npm run deploy
```

反向代理、证书和认证不属于本仓库，部署前必须另行完成。

## 3. 初次部署

### 3.1 前置检查

Docker 路径只要求 Docker Engine 和 Compose v2：

```bash
docker version
docker compose version
COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod DOCS_PORT=3000 \
  docker compose config --quiet
git status --short
```

`git status` 应为空。若需要在宿主机执行 Node.js 检查，还需安装
`.node-version` 指定的 Node.js 版本并运行 `npm ci`。

干净工作区是可复现发布的默认要求。若明确需要验证尚未提交的当前工作区，
必须先审查 `git status --short` 和 `git diff`，并在本次 changelog 中记录
构建内容。Docker 会包含未被 `.dockerignore` 排除的未跟踪文件；在提交之前，
该镜像无法仅凭 Git 历史重建。

确认目标端口没有被其他服务占用：

```bash
ss -ltnp | grep ':3000 '
```

没有输出通常表示端口空闲。若已占用，使用其他 `DOCS_PORT`，不要停止未知
服务。

### 3.2 构建和启动

将构建和切换分开，构建失败时现有容器仍继续运行：

```bash
npm run deploy
```

首次启动后检查：

```bash
COMPOSE_PROJECT_NAME=fuma-lab docker compose ps
COMPOSE_PROJECT_NAME=fuma-lab docker compose logs --tail=100 docs
curl -fsS http://127.0.0.1:3000/docs >/dev/null
```

`docker compose ps` 应显示 `healthy`。启动后等待健康检查完成；若持续处于
`starting` 或转为 `unhealthy`，按第 11 节检查。

## 4. 日常生命周期

资料或代码更新后的标准发布入口：

```bash
npm run deploy
```

该入口构建并验证新镜像、保存运行中镜像、切换服务、执行烟雾测试，并在
切换后的检查失败时自动回滚。Docker-only 宿主机可使用等价入口
`bash scripts/deploy.sh`，无需安装项目 Node.js 运行环境。只验证候选镜像而
不替换容器：

```bash
npm run deploy:check
```

可通过 `DEPLOY_BASE_URL`、`DEPLOY_HEALTH_TIMEOUT`、`DEPLOY_PULL`、
`DEPLOY_ENV_FILE`、`DEPLOY_IMAGE`、`DEPLOY_SERVICE` 和
`DEPLOY_SMOKE_MARKER` 调整非默认
环境。日常发布优先使用该入口；以下底层命令主要用于状态检查、故障处理和
手工回滚。

```bash
# 状态
COMPOSE_PROJECT_NAME=fuma-lab docker compose ps

# 最近日志
COMPOSE_PROJECT_NAME=fuma-lab docker compose logs --tail=200 docs

# 持续跟踪日志
COMPOSE_PROJECT_NAME=fuma-lab docker compose logs --tail=200 -f docs

# 重启现有容器，不重建镜像
COMPOSE_PROJECT_NAME=fuma-lab docker compose restart docs

# 停止和重新启动
COMPOSE_PROJECT_NAME=fuma-lab docker compose stop docs
COMPOSE_PROJECT_NAME=fuma-lab docker compose start docs

# 删除容器和网络，保留镜像
COMPOSE_PROJECT_NAME=fuma-lab docker compose down
```

只有进程临时异常时才使用 `restart`。内容、依赖、`SITE_URL` 或构建配置变化
都要求重新构建镜像。

### 4.1 GitHub Actions 自动化

仓库提供三条 GitHub Actions workflow：

| Workflow | 触发 | Runner | 作用 |
| --- | --- | --- | --- |
| `CI` | pull request 和所有分支 push | GitHub-hosted `ubuntu-latest` | `npm ci`、`npm run verify`、`npm run build`、Compose 配置检查 |
| `Deploy Staging` | push 到 `stg` 或手动触发 | self-hosted runner：`self-hosted` + `fuma-lab` | 生成 `envs/staging.env`，通过主机 `cloudflared` 暴露 `127.0.0.1:3001`，并执行 `scripts/deploy.sh --env staging` |
| `Deploy Production` | push 到 `main` 或手动触发 | GitHub-hosted gate + self-hosted runner：`self-hosted` + `fuma-lab` | 先确认当前 SHA 已有 successful staging deployment，再生成 `envs/production.env` 并执行 `scripts/deploy.sh --env production` |

当前仓库远端默认生产分支是 `main`。若后续要改成 `master`，需要先完成分支命名
迁移，再修改 production workflow 的触发分支。

部署 workflow 只有在目标主机上注册了 GitHub self-hosted runner 后才会真正
执行。runner 用户必须能访问 Docker API，并能在 checkout 工作区运行 Bash、
Docker 和 Compose。

production workflow 的 staging gate 使用 GitHub Deployments API 检查当前
`GITHUB_SHA` 是否已经在 `staging` 环境成功部署。因此生产晋级应推广同一个
已经通过 staging 的提交 SHA。若使用 merge commit 产生新的 SHA，gate 会拒绝
部署；推荐从 `stg` 快进/合并到 `main` 时保持待发布提交本身不变，或先让新的
生产候选 SHA 经过 staging。

GitHub Environments / Variables / Secrets：

| 环境 | 名称 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- | --- |
| staging | 无 secret | - | - | 默认使用主机常驻 `cloudflared.service`，GitHub Actions 不持有 tunnel token |
| staging | `STAGING_SITE_URL` | variable | 否 | 默认 `https://stg.t3s7.com` |
| staging | `STAGING_DOCS_PORT` | variable | 否 | 默认 `3001` |
| production | `PRODUCTION_SITE_URL` | variable | 是 | 正式公开基址，production workflow 不接受空值 |
| production | `PRODUCTION_DOCS_PORT` | variable | 否 | 默认 `3000` |

只有改回 compose 管理 staging tunnel 时，才需要额外引入 tunnel secret 和
`COMPOSE_PROFILES=tunnel`。

GitHub Environment deployment branch policies 当前限制为：`staging` 只允许
`stg` 分支部署，`production` 只允许 `main` 分支部署。`production` 还配置了
required reviewer `saberu-ops`，用于在自动检查通过后保留一次人为发布确认。

建议在 GitHub Environment `production` 上启用 required reviewers，把产品验收
作为生产部署前的人为 gate。自动检查能确认服务可运行，不能替代“是否应该上线”
的产品判断。

详细 runner 注册、GitHub Environment、晋级流程和产品验收清单见
[`release-automation.md`](release-automation.md)。

检查运行时隔离：

```bash
docker inspect \
  --format 'User={{.Config.User}} Readonly={{.HostConfig.ReadonlyRootfs}} CapDrop={{json .HostConfig.CapDrop}}' \
  "$(COMPOSE_PROJECT_NAME=fuma-lab docker compose ps -q docs)"
```

预期包含 `User=node`、`Readonly=true` 和 `["ALL"]`。

查看即时资源使用：

```bash
docker stats "$(COMPOSE_PROJECT_NAME=fuma-lab docker compose ps -q docs)"
```

## 5. 更新个人内容

个人内容位于 `content/docs/(personal)`。括号表示 Fumadocs 路由分组，不会成为
URL 的一部分。

推荐流程：

1. 编辑或新增 `.mdx` 文件，并按需更新同目录 `meta.json`。
2. 日语 N2 同专题新课优先使用 `npm run note:new` 生成固定结构。
3. 本地运行 `npm run dev` 检查导航、链接和组件。
4. 执行完整验证。
5. 代码或应用配置有变化时，在 `docs/reviews` 下追加 round changelog；单纯
   内容修改也建议记录来源、校正和验证结果。
6. 提交源码变更。
7. 按第 7 节保留当前镜像、构建、切换并检查。

新增一篇听力转口语课程：

```bash
npm run note:new -- \
  --slug 04-requesting-a-change \
  --title "第四课：请求调整安排" \
  --description "学习说明原因、提出请求和确认调整结果"
```

目录和新专题约定见
[`docs/features/japanese-n2/content-authoring.md`](../japanese-n2/content-authoring.md)。

完整验证命令：

```bash
npm run lint
npm run docs:check
npm run types:check
npm run build
COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod DOCS_PORT=3000 \
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

### 7.1 标准发布

生产发布入口是：

```bash
npm run deploy
```

该命令会：

1. 加载 production 环境配置并固定 Compose project 为 `fuma-lab`。
2. 验证 Compose 配置和 Git whitespace。
3. 保存当前运行镜像为 `fuma-lab:production-rollback-<timestamp>`。
4. 构建 `fuma-lab:prod`。
5. 为新镜像额外打 `fuma-lab:production-<git-sha>-<timestamp>` release tag。
6. 重新创建 `docs` 服务。
7. 等待健康检查并验证运行时隔离。
8. 检查 `/docs`、N2 页面、搜索和音频 Range 请求。
9. 任一切换后检查失败时自动恢复上一镜像。

成功后记录输出：

```text
ENVIRONMENT=production
DEPLOYED_IMAGE=...
RELEASE_TAG=...
ROLLBACK_TAG=...
SERVICE_HEALTH=healthy
WORKING_TREE=clean|dirty
```

### 7.2 只构建验证

验证候选镜像但不替换容器：

```bash
npm run deploy:check
```

该命令会使用临时 candidate tag，不会改变 `fuma-lab:prod` 或正在运行的容器。

### 7.3 手工应急回滚

正常情况下不需要手工回滚；`npm run deploy` 会在切换后失败时自动恢复。
只有自动回滚未验证成功、或需要主动回到指定版本时，才手工执行：

```bash
docker tag fuma-lab:production-rollback-YYYYMMDD-HHMMSS fuma-lab:prod
COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod DOCS_PORT=3000 \
  docker compose up -d --no-build --force-recreate docs
COMPOSE_PROJECT_NAME=fuma-lab docker compose ps
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
docker save fuma-lab:prod \
  | gzip > ../fuma-lab-image-$(date +%Y%m%d).tar.gz
```

### 8.2 从源码恢复

1. 恢复或克隆 Git 仓库。
2. 安装 Docker Engine 和 Compose v2。
3. 恢复仓库外的代理和访问控制配置。
4. 执行 production Compose 配置检查。
5. 使用正确的 `SITE_URL` 执行 `npm run deploy`。
6. 确认第 7.1 节输出为 `SERVICE_HEALTH=healthy`。

从 bundle 恢复示例：

```bash
git clone fumadocs-backup-YYYYMMDD.bundle fumadocs
cd fumadocs
npm run deploy
```

从镜像归档临时恢复：

```bash
gzip -dc fuma-lab-image-YYYYMMDD.tar.gz | docker load
COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod DOCS_PORT=3000 \
  docker compose up -d --no-build docs
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
npm run deploy:check
npm run deploy
```

不要盲目执行 `npm audit fix --force`。审计结果会随 npm 漏洞数据库变化，
即使锁文件未变，数量也可能不同。每次升级都应重新运行 `npm audit`、阅读
完整依赖路径、确认是否有兼容的稳定版本，并把当次结论写入 changelog。
不得仅为清空报告而采用破坏性降级或 `--force`。

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
| 容器未启动 | `COMPOSE_PROJECT_NAME=fuma-lab docker compose ps -a`、`COMPOSE_PROJECT_NAME=fuma-lab docker compose logs docs` | 修正配置或构建错误后重新创建 |
| 状态为 `unhealthy` | 日志、容器内 `/docs` 健康请求、磁盘和内存 | 先确认进程错误，再重启；持续失败则回滚 |
| 宿主机端口冲突 | `ss -ltnp \| grep ':3000 '` | 使用其他 `DOCS_PORT`，不要停止未知服务 |
| 修改内容后页面不变 | `git diff`、镜像创建时间 | 内容在镜像内，重新构建并创建容器 |
| `/` 返回非文档页或跳转 | 请求 `/docs` | 当前文档入口固定为 `/docs` |
| `SITE_URL` 仍是旧值 | 检查构建命令和页面元数据 | 使用正确变量重新构建；重启无效 |
| `docs:check` 哈希不匹配 | 检查快照和 `snapshot.json` 差异 | 审查并重新同步，或恢复完整的已提交快照 |
| `docs:sync` 请求失败 | 网络、官网响应、GitHub API 限制 | 保留旧快照，稍后重试；不要提交部分结果 |
| 构建失败但旧站仍可用 | `npm run deploy:check` 输出 | 不执行切换，修复后重建 |
| 中日文搜索没有结果 | `app/api/search/route.ts`、`lib/search-tokenizer.ts` | 使用至少两个连续 CJK 字符复测；当前混合分词以双字切分，单个 CJK 字符不是目标查询单位 |
| 磁盘空间持续增长 | `docker system df`、镜像和构建缓存 | 确认回滚需求后按第 12 节清理 |

进一步诊断健康状态：

```bash
docker inspect --format '{{json .State.Health}}' \
  "$(COMPOSE_PROJECT_NAME=fuma-lab docker compose ps -q docs)"
COMPOSE_PROJECT_NAME=fuma-lab docker compose logs --since=30m docs
curl -v http://127.0.0.1:3000/docs
```

## 12. 清理

先确认当前容器、镜像和回滚需求：

```bash
COMPOSE_PROJECT_NAME=fuma-lab docker compose ps
docker image ls 'fuma-lab'
docker system df
```

删除已确认不再需要的单个回滚镜像：

```bash
docker image rm fuma-lab:production-rollback-YYYYMMDD-HHMMSS
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
| 配置检查 | `COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod DOCS_PORT=3000 docker compose config --quiet` |
| 发布 | `npm run deploy` |
| 只验证发布候选 | `npm run deploy:check` |
| 状态 | `COMPOSE_PROJECT_NAME=fuma-lab docker compose ps` |
| 日志 | `COMPOSE_PROJECT_NAME=fuma-lab docker compose logs --tail=200 -f docs` |
| 重新创建当前生产镜像 | `COMPOSE_PROJECT_NAME=fuma-lab DOCS_IMAGE=fuma-lab:prod docker compose up -d --no-build --force-recreate docs` |
| 停止 | `COMPOSE_PROJECT_NAME=fuma-lab docker compose down` |
| 快照校验 | `npm run docs:check` |
| 完整应用构建 | `npm run build` |
| HTTP 烟雾检查 | `curl -fsS http://127.0.0.1:3000/docs >/dev/null` |
| N2 内容检查 | `curl -fsS http://127.0.0.1:3000/docs/japanese-n2 >/dev/null` |
| 日语搜索检查 | `curl -fsS --get --data-urlencode 'query=終わり次第' http://127.0.0.1:3000/api/search` |
