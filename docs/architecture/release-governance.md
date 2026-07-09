# Fuma Lab 发布治理体系方案

本文定义 Fuma Lab 从本地开发、staging 验证到 production 发布的目标体系。
它是架构方案，不属于某个单独 feature；在实现前，
`docs/features/fumadocs/operations.md` 仍是生产操作事实来源。

## 1. 目标

建立一条可审计、可回滚、可扩展的发布路径：

```text
local/dev -> stg branch -> staging environment -> PR -> production branch -> production
```

The original target name for the production branch was `master`; this repository
currently uses `main` (`origin/HEAD -> origin/main`). The implemented workflow
therefore treats `main` as the production branch unless the repository is later
renamed.

这条路径要回答四个问题：

- 当前环境运行的是哪个提交、哪个镜像、哪组配置。
- 变更在进入生产前经过了哪些自动检查和人工验收。
- 发布失败时如何自动恢复到上一版。
- 多环境扩张时如何复用同一套发布机制，而不是复制脚本。

## 2. 设计原则

1. 本地默认服务开发，不代表任何真实环境。
2. staging 和 production 必须由自动化入口部署，不依赖裸
   `docker compose up` 的隐含语义。
3. 发布物以 Git commit 和不可变镜像 tag 为单位晋级。
4. 环境差异来自显式配置和 secret，不来自分支内的代码分叉。
5. staging 是生产发布门禁，不只是一个可访问的预览站点。
6. staging 和 production 共享部署内核，差异通过 `--env` 或环境文件注入。
7. 运行手册只记录已经实现和验证的事实，路线图记录尚未落地的目标。

## 3. 环境模型

| 环境 | 触发方式 | 主要用途 | 镜像策略 | 访问策略 |
| --- | --- | --- | --- | --- |
| local/dev | 开发者本机命令 | 快速开发、手工验证 | `fuma-lab:local` | 仅本机回环地址 |
| staging | 合并到 `stg` 或手动受控触发 | 发布前验收、产品检查、集成验证 | commit SHA + `fuma-lab:stg` 指针 | Cloudflare Access + `noindex` |
| production | 合并到 `main` 后受控触发 | 对外正式服务 | commit SHA + `fuma-lab:prod` 指针 | 正式域名、生产访问控制 |

`fuma-lab:local` 只属于本地开发。staging 和 production 不应依赖这个 tag，
因为它是可变的、难以审计，也不适合作为回滚目标。

## 4. 分支和晋级模型

推荐主线：

```text
feature/* -> stg -> PR -> main
```

- `feature/*`：功能开发和本地验证。可以使用 `npm run verify`、
  `npm run deploy:check` 或本地 compose 沙箱，但不得直接代表 staging。
- `stg`：预发布分支。合并后自动构建不可变镜像并部署到 staging。
- `main`：生产发布分支。只有 staging 验收通过且通过 PR review 的提交才允许
  进入。agent 不直接 push `main` 或 `master`。

如果未来需要更严格的控制，可以把 PR source 从 `stg` 改为显式 release 分支：

```text
feature/* -> stg -> release/<date-or-version> -> PR -> main
```

当前规模下可以先使用 `stg -> main` PR，但不能直接 push 生产分支。

## 5. 发布物模型

每次 CI 构建应生成不可变发布物：

```text
fuma-lab:<git-sha>
```

同时可以维护环境指针 tag：

```text
fuma-lab:stg
fuma-lab:prod
```

环境指针只表示“该环境当前版本”，不能作为审计依据。审计和回滚必须记录
commit SHA、镜像 digest、部署时间、触发人或触发事件。

最低发布记录字段：

| 字段 | 说明 |
| --- | --- |
| Git SHA | 源码版本 |
| Image digest | 实际运行镜像 |
| Environment | staging 或 production |
| Config set | 使用的环境文件或 CI secret 集合 |
| Verification result | 自动检查和 smoke test 结果 |
| Promotion source | staging 验收对应的提交 |
| Rollback target | 上一个健康版本的 digest/tag |

## 6. 配置模型

同一份源码按环境注入配置：

| 配置 | local/dev | staging | production |
| --- | --- | --- | --- |
| `SITE_URL` | 本地 URL | `https://stg.t3s7.com` | 正式域名 |
| `DOCS_PORT` | 本地端口 | staging 本机端口 | production 本机端口 |
| `ROBOTS_NOINDEX` | 可选 | `1` | 未设置 |
| Tunnel token | 无 | staging secret | production secret 或宿主机服务 |
| Compose project | 本地项目 | staging 项目 | production 项目 |

生产部署必须拒绝 placeholder 域名、空 production secret、以及
`ROBOTS_NOINDEX=1` 这类明显错误配置。

## 7. 部署入口

目标状态使用一个共享部署内核：

```bash
scripts/deploy.sh --env staging
scripts/deploy.sh --env production
```

或等价 npm 入口：

```bash
npm run deploy:stg
npm run deploy:prod
```

共享步骤：

1. 读取环境配置并校验危险值。
2. 校验 Git 状态、目标分支、提交和工作区策略。
3. 构建不可变镜像 tag。
4. 运行 lint、docs check、type check 和生产 build。
5. 保存当前环境的 rollback target。
6. 切换目标服务。
7. 等待健康检查。
8. 执行环境 smoke tests。
9. 失败时自动恢复上一版。
10. 输出部署摘要。

环境差异只影响配置、smoke test 的期望值和外部集成检查，不应复制整套部署逻辑。

## 8. 自动检查和验收门禁

### 8.1 local/dev

最低要求：

```bash
npm run verify
npm run build
```

涉及字幕或音频生成时还需：

```bash
npm run subtitles:build
npm run audio:build
```

### 8.2 staging 自动门禁

合并到 `stg` 后自动执行：

- 安装依赖并锁定版本。
- `npm run verify`。
- `npm run build`。
- 构建 staging 镜像。
- 部署到 staging。
- 检查 `/docs`。
- 检查搜索 API。
- 检查音频 byte-range。
- 检查 `X-Robots-Tag: noindex`。
- 检查 canonical 和 OG URL 指向 staging 域名。
- 检查 Cloudflare Access 是否阻止匿名公网访问。

### 8.3 production 自动门禁

合并到 `main` 后自动执行：

- 确认该 commit 已在 staging 成功部署并验收。
- 重新构建或提取同一不可变镜像。
- 检查 production 配置不含 staging 标志。
- 部署 production。
- 检查 `/docs`、搜索、音频、运行时隔离。
- 输出 production digest、rollback tag、health result 和工作区状态。

## 9. 产品验收

staging 验收不应只看 HTTP 200。产品视角至少覆盖：

- 本轮变更的用户价值是否清楚。
- 关键页面、导航和搜索是否符合预期。
- 日语学习内容是否完整、可读、没有明显错字或错链。
- PWA、音频、字幕、移动端阅读等体验是否受影响。
- staging 上看到的版本是否就是准备推进 production 的版本。
- 已知问题是否可接受，是否需要在 changelog 或 release note 中说明。

建议为每次 staging 晋级保留一份简短验收记录：

```text
Commit:
Staging URL:
Scope:
Automated checks:
Manual checks:
Known risks:
Approved for production by:
```

## 10. 回滚策略

回滚目标必须是上一版健康镜像，而不是“当前 tag 曾经指向的内容”。

最低要求：

- staging 和 production 各自保存最近一次健康 digest。
- 部署失败自动切回上一版。
- 手工回滚命令只接受明确环境和明确 digest/tag。
- 回滚后必须再次运行 health check 和 smoke test。

建议保留最近 5-10 个环境历史版本，方便处理连续失败或延迟发现的问题。

## 11. 可观测性和审计

当前服务规模不需要复杂平台，但发布体系至少应有：

- 部署日志。
- 环境当前版本查询命令。
- 健康检查状态。
- 最近一次部署摘要。
- 失败回滚摘要。
- staging 验收记录。

未来可以扩展：

- uptime 监控。
- 结构化日志。
- 发布 dashboard。
- 部署通知。
- 变更和 incident 关联。

## 12. 安全和权限

最低边界：

- CI secret 分环境隔离。
- staging tunnel token 不得用于 production。
- production secret 不得在 staging job 中可见。
- production job 只允许从 `main` 触发。
- staging job 只允许从 `stg` 触发。
- 部署脚本拒绝未知环境名。
- Cloudflare Access 是 staging 的强制要求，不是可选项。

## 13. 分阶段落地

### Phase 0: 文档和决策对齐

- 确认本方案。
- 明确正式 production 域名。
- 明确分支策略：`stg` 和 `main`。
- 明确 staging 验收人和 production 发布人。

### Phase 1: 本地和手工部署收敛

- 将 staging/prod 部署逻辑统一到一个脚本入口。
- 保留 local/dev 默认体验。
- 修正运行手册，避免把目标体系写成已实现事实。
- 为 staging 增加 rollback。

### Phase 2: CI/CD 接入

- 配置 `stg` 分支自动部署 staging。
- 配置 `main` 分支自动部署 production。
- 使用 commit SHA 镜像和 digest 记录。
- 输出机器可读和人可读部署摘要。

### Phase 3: 发布门禁

- staging 自动检查覆盖核心用户路径。
- production 部署要求同一 commit SHA 有 successful staging deployment。
- 增加产品验收模板。

### Phase 4: 平台化扩展

- 抽象环境配置。
- 增加部署历史和监控。
- 必要时引入基础设施即代码管理 Cloudflare。

## 14. 暂不建议做的事

- 为每个环境复制一份完整 compose 文件。
- 让 production 依赖 `fuma-lab:local`。
- 让 staging 和 production 使用两套不同部署脚本长期并存。
- 只用裸 `docker compose` 作为真实环境发布入口。
- 在运行手册里提前承诺尚未实现的 CI/CD 能力。
- 在没有并行发布需求前引入复杂 release 分支模型。

## 15. 当前实现状态

当前 Phase 1 实现已经把 staging 和 production 收敛到共享部署入口：

- production: `npm run deploy` 或 `npm run deploy:prod`。
- staging: `npm run deploy:stg` 或 `scripts/deploy.sh --env staging`。
- local/dev: 裸 `docker compose` 仍是 `fuma-lab-local` / `fuma-lab:local`。
- staging 和 production 共享构建、切换、健康检查、smoke test 和 rollback。
- 部署脚本会输出环境、镜像 ID、release tag、rollback tag、health 和工作区状态。
- GitHub Actions workflow 已提供：
  - `CI`: pull request 和所有分支 push 的验证。
  - `Deploy Staging`: push 到 `stg` 时在 self-hosted runner 上部署 staging。
  - `Deploy Production`: push 到 `main` 时先确认同一 SHA 已经成功部署到
    staging，再在 self-hosted runner 上部署 production。

仍未实现的发布治理能力：

- 目标主机上的 GitHub self-hosted runner 尚需外部配置。
- CI secret 和 Cloudflare 配置的自动化管理。
- 产品验收目前通过 production Environment required reviewers 承载；仓库已提供
  验收清单，但尚未把验收记录写入结构化发布数据库。
