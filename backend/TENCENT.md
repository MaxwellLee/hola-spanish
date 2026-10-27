# 腾讯云 SCF 部署 Luna

此版本接收学习网页的 `/api/chat` 请求，使用 DeepSeek API。复用原后端的学习提示、参数校验、口令验证和上游错误处理，不自动回退到 Kimi 或 Cloudflare。

当前部署：`https://1508919580-l9m692upzz.ap-guangzhou.tencentscf.com`。2026-10-28 已验证 `/health` 返回 `provider: deepseek`、`model: deepseek-flash`、`configured: true`，公开网页带原学习口令的真实对话返回 200 和 `source: deepseek`。测试还确认刷新后恢复已保存的设备配置。这不是所有运营商或手机网络的可用性保证。旧浏览器保存的原 Cloudflare 地址会自动迁移，自定义地址保持不变。控制台字段以实际界面为准。

## 1. 创建函数

在函数服务页选择广州、命名空间 `default`，点击“新建”：

| 配置 | 值 |
| --- | --- |
| 创建方式 | 从头开始 |
| 函数类型 | 事件函数 |
| 函数名称 | `hola-luna` |
| 运行环境 | Node.js 20.19 |
| 代码提交方式 | 本地上传 ZIP 包 |
| ZIP 文件 | 项目 `private-output/hola-luna-tencent-deepseek.zip` |
| 执行方法 | `index.main_handler` |
| 内存 | 256 MB |
| 执行超时 | 60 秒 |
| 公网访问 | 开启，用于请求 DeepSeek |
| VPC / 私有网络 | 不配置；本项目不需要数据库或内网资源 |
| 触发器 | 使用函数 URL，不选择旧 API 网关或定时器 |

ZIP 根目录必须直接包含 `index.js`、`worker.mjs`、`package.json`，不需要在线安装依赖。可通过 `pwsh -File tools/package-tencent.ps1` 重新打包。包内不包含密钥或学习口令。

## 2. 环境变量

在函数配置中添加以下两个值；不要在函数源码或测试事件里填写密钥：

| 名称 | 填写内容 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek 开放平台 API 密钥 |
| `STUDY_ACCESS_TOKEN` | 项目 `private-output/学习口令.txt` 中已有的独立学习口令 |

该包已固定：网站源 `https://maxwelllee.github.io`、接口 `https://api.deepseek.com/chat/completions`。默认模型 `deepseek-flash`，可选环境变量 `DEEPSEEK_MODEL` 覆盖；请求使用 `thinking: {type: "disabled"}`。旧 `MOONSHOT_API_KEY` 不再被腾讯云入口读取；DeepSeek 密钥缺失时直接报告未配置。

先用以下测试事件检查函数能否启动，不会调用模型：

```json
{"httpMethod":"GET","path":"/health","headers":{}}
```

正常返回 `statusCode: 200`，`body` 内 `ok: true` 和 `provider: deepseek`；两个环境变量齐备时 `configured: true`。这只验证函数启动和配置存在，不代表密钥有效；仍需发送一句对话验证。

## 3. 创建函数 URL

进入函数详情的“函数 URL”→“新建函数 URL”：

- 版本可选 `$LATEST`，开启公网访问。
- 授权类型选“开放”；应用代码仍会检查独立学习口令。CAM 鉴权无法直接供当前学习网页调用。
- 先关闭平台层 CORS；应用代码已处理来源检查、OPTIONS 及跨域响应，避免平台与应用重复添加响应头。
- 不需要 WebSocket、API 网关或自购域名。函数 URL 自带 HTTPS。

保存后得到以 `tencentscf.com` 结尾的 HTTPS 地址。浏览器打开根地址，应看到 `hola-luna-tencent` 和配置状态。函数 URL 可以用于接入排查；不要发送环境变量值。

## 4. 接入网页

当前部署的地址已预填，在学习网页打开 Luna → 齿轮，输入原学习口令，保持勾选“记住这台设备”并保存即可。以后在该浏览器刷新或重新打开时自动恢复；手机和 iPad 各保存一次。可取消勾选后保存以仅在当前页面使用，或点击“退出并清除口令”。清除网站数据、无痕模式或浏览器限制可能导致需要重填。重新部署时，先把后端地址换成新的 HTTPS 根地址，发送 `Hola` 确认真实回复，再更新网页默认地址。家庭 Wi-Fi 与手机蜂窝网络仍需分别验证。已有 Cloudflare 部署保留，但网页不会自动回退到它。

前端入口：<https://maxwelllee.github.io/hola-spanish/>。电脑看到旧版本时可用 `Ctrl+F5` 刷新。

## 用量与运行限制

- 此版本无需额外数据库，调用使用 DeepSeek API 账户余额，受其频率与用量规则限制。
- 来源校验、学习口令、输入长度、回复长度和 35 秒上游超时均由后端执行。
- 每个运行实例保留 5 秒请求间隔和每日 100 次计数，但实例重启或扩容会重新计数，**不是持久的全账户每日上限，也不是费用预算**。需要严格的全账户日限额时，再接入共享持久存储。Cloudflare 原部署的 Durable Object 计数机制仍然保持不变。
- 腾讯云的调用、运行及外网流量按其规则计费；新用户权益不等于所有项目永久免费。
- 后端不输出密钥、对话或原始上游错误到应用日志。平台可能保留基础调用日志。
- 真实 iPhone/iPad 的语音识别与朗读还依赖浏览器和系统，后端只接收转写文字。

## 官方资料

- [Node.js 运行环境](https://cloud.tencent.com/document/product/583/11060)
- [函数 URL 输入和输出](https://cloud.tencent.com/document/product/583/96099)
- [创建函数 URL](https://cloud.tencent.com/document/product/583/100227)
- [环境变量](https://cloud.tencent.com/document/product/583/30228)
- [SCF 计费](https://cloud.tencent.com/document/product/583/17299)
- [DeepSeek API](https://api-docs.deepseek.com/)
