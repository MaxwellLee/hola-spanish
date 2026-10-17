# Luna 后端接入

腾讯云国内部署使用独立上传包，见 [腾讯云 SCF 部署说明](TENCENT.md)。目前尚未切换网站默认后端，以下记录的是已有 Cloudflare 部署。

网页本身无需密钥：教材、合成朗读、划词翻译与生词复习均独立工作。Luna 后端已部署到 `https://hola-study-companion.maxwelllee-hola.workers.dev`，学习网页已预填此地址。当前选择 Kimi Code 会员接口，密钥和独立学习口令保存在 Cloudflare Secret。

已有部署请从下面第 3 步开始；第 1–2 步供重新部署时参考。

注意密钥的产品类型：Kimi Code 与开放平台使用不同地址、模型名和额度。当前 Cloudflare 后端使用官方海外会员地址 `MOONSHOT_BASE_URL=https://api.kimi.ai/coding/v1`、`KIMI_MODEL=kimi-for-coding`，`MOONSHOT_API_KEY` 保存会员接口密钥。请求如实标识为 `HolaSpanishStudy/1.0`。2026-10-17 实测此路径可返回真实回复；国内会员地址在本机可用，但从该 Cloudflare 后端访问返回 403。会员额度不足或服务拒绝时显示错误，不自动改用按量付费。参见 [Kimi Code 接入说明](https://www.kimi.com/code/docs/) 与 [产品和密钥区别](https://www.kimi.com/help/kimi-api/api-troubleshooting)。

## 首次配置

1. 注册并登录 Cloudflare。确认当前账户可部署 Workers 与基于 SQLite 的 Durable Objects，并查看当前套餐费用。本项目不承诺云平台永久免费。
2. 在本目录按 Cloudflare 官方文档安装并登录 Wrangler，然后执行 `npx wrangler deploy`。初次部署会创建服务和用量计数对象；未设置密钥时 AI 返回“尚未完成后端配置”。
3. 在 Cloudflare 控制台打开该 Worker 的 Settings → Variables and Secrets，添加两个 **Secret**，不要添加为普通公开变量：
   - `MOONSHOT_API_KEY`：你的 Kimi API 密钥，仅在该加密配置框中输入。
   - `STUDY_ACCESS_TOKEN`：自行生成的至少 16 位随机学习口令，供你们使用网页时连接。它与 Kimi 密钥不同，不要重复使用其他账号的密码。
   添加后点击 **Deploy** 使配置生效。
4. 核对普通配置：`KIMI_MODEL` 必须与当前服务和账户权限匹配。当前会员方案使用 `https://api.kimi.ai/coding/v1` 和 `kimi-for-coding`。若手动改用开放平台，中国站使用 `https://api.moonshot.cn/v1`，国际站使用 `https://api.moonshot.ai/v1`，同时更换密钥及对应模型；两站账号与密钥不可假定互通。
5. 在网页右下角打开 Luna → 齿轮，保留已预填的后端地址，填写学习口令。自行重新部署时才需要替换成新服务的 HTTPS 根地址。**网页中不填写 Kimi 密钥。**
6. 发送一句简短测试，例如“陪我练习自我介绍”，确认真实响应、费用和模型效果后再常态使用。

`ALLOWED_ORIGIN` 填网页的源（例如 `https://maxwelllee.github.io`，不含仓库路径）。在其他域名部署时必须修改。仅限制来源不能替代认证，因此每次 AI 请求同时验证学习口令。

## 用量与数据边界

- 默认全家合计每天最多 100 次 AI 请求，按北京时间午夜重置；至少间隔 5 秒。上限由 Durable Object 事务持久维护，Worker 重启不会重置。
- 上游失败也计为一次尝试，以保守限制调用量；这个请求次数上限不等于人民币预算。请同时在 Kimi 平台核对账户额度、用量与模型价格。
- 输入最多 12 条消息、总计 10000 字符，另含当前页最多 2400 字符。输出有 token 上限。
- 后端只保存日期、计数和上次请求时间，不存聊天正文；请求会发给 Kimi，仍适用服务商的数据处理规则。
- 学习口令只在网页内存中保留。刷新或重新打开后，需要再次输入。Kimi 密钥从不返回浏览器。
- 网页可通过浏览器语音识别转写说话内容，自动发送文字并朗读回复；后端仍只做文本对话和反馈，不接收录音、不测量发音准确率。没有兼容的识别服务时可改用系统键盘听写。

## 官方资料

- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Durable Objects 入门](https://developers.cloudflare.com/durable-objects/get-started/)
- [Kimi Chat Completions](https://platform.kimi.ai/docs/api/chat)

文档核查时间：2026-10。模型名称、价格、平台界面与可用套餐可能变化，以配置时的官方页面为准。
