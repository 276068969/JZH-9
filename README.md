# 家庭用水管控平台

一个不使用 Vue 的全栈 Web 应用示例，面向家庭用水监测、入户阀门控制、异常告警、节水计划和后台权限管理。项目使用 Node.js 原生 HTTP 服务实现后端 API，前端使用原生 HTML/CSS/JavaScript，支持 Docker 一键部署。

## 核心特点

- 前后台一体化：住户端查看家庭用水、告警和报表，后台可管理用户、阀门指令、节水计划与告警处理。
- 角色权限控制：内置 `admin`、`operator`、`resident` 三类角色，接口按角色隔离。
- 智能用水分析：按家庭汇总月度用水、近 14 日趋势、配额占比、压力均值和漏损风险。
- 远程阀门控制：运维或管理员可下发开阀、关阀命令，并保留指令记录。
- 告警闭环：支持漏水、压力异常等告警查看、处理说明填写与状态流转历史追踪，处理记录按家庭隔离。
- 节水计划：可设置家庭月度配额、提醒阈值与自动关阀策略。
- 无外部运行依赖：后端仅使用 Node.js 内置模块，数据落在 `data/store.json`，便于教学、演示和容器部署。

## 技术选型

- 前端：原生 HTML5、CSS3、JavaScript、Canvas 图表。
- 后端：Node.js 20、原生 `http` 路由、Cookie/Bearer Token 会话。
- 数据存储：JSON 文件型存储，默认路径 `data/store.json`，可通过 `DATA_FILE` 配置。
- 安全：PBKDF2 密码哈希、HttpOnly Cookie、接口级 RBAC。
- 测试：Node.js 内置 `node:test`。
- 部署：Docker、Docker Compose。

## 测试账号

| 角色 | 账号 | 密码 | 权限说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `Admin@123` | 用户管理、设备控制、告警处理、计划配置、查看全部家庭 |
| 运维员 | `operator` | `Ops@12345` | 设备控制、告警处理、计划配置、查看运维范围家庭 |
| 家庭用户 | `resident` | `Home@123` | 查看本人家庭、用水报表、告警和节水计划 |

首次启动时如果 `data/store.json` 未初始化，系统会自动写入演示数据和测试账号。

## 本地运行

```bash
npm start
```

启动后访问：

```text
http://localhost:3000
```

运行测试：

```bash
npm test
```

## Docker 部署

构建并启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

容器默认映射端口为 `3000:3000`，数据通过 Compose 挂载到本机 `./data` 目录，重启后不会丢失。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 登录并返回 Token |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/me` | 当前用户信息 |
| GET | `/api/dashboard` | 首页聚合数据 |
| GET | `/api/users` | 用户列表，管理员可用 |
| POST | `/api/users` | 新增用户，管理员可用 |
| PATCH | `/api/users/:id` | 修改用户，管理员可用 |
| GET | `/api/homes` | 家庭列表 |
| GET | `/api/alerts` | 告警列表 |
| GET | `/api/alerts/:id` | 告警详情与处理历史 |
| PATCH | `/api/alerts/:id` | 处理告警（需提交处理说明） |
| POST | `/api/commands` | 下发阀门控制指令 |
| POST | `/api/plans` | 新增或更新节水计划 |
| GET | `/api/reports/:homeId` | 家庭用水报表 |

## 目录结构

```text
.
├── data/store.json          # 演示数据与运行数据
├── public/                  # 前端静态资源
├── src/
│   ├── analytics.js         # 用水统计、报表与风险计算
│   ├── auth.js              # 会话与 Cookie 处理
│   ├── server.js            # HTTP 服务与 API 路由
│   └── store.js             # 文件型数据存储与种子数据
├── test/api.test.js         # API 与权限测试
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 可扩展方向

- 接入真实水表 MQTT/HTTP 上报通道。
- 将 JSON 文件替换为 PostgreSQL 或 MySQL。
- 增加分时水价、阶梯水价和账单模块。
- 增加短信、企业微信或邮件通知。
- 为阀门控制加入审批流和双人复核。
