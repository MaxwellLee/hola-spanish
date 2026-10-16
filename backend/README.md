# Luna 后端接入

网页本身无需密钥：教材、合成朗读、划词翻译与生词复习均独立工作。Luna 的 AI 对话尚需部署本目录的 Worker 并设置服务端密钥。当前源码已实现接入，不代表已完成真实 Kimi 调用验证。

## 首次配置

1. 注册并登录 Cloudflare。确认当前账户可部署 Workers 与基于 SQLite 的 Durable Objects，并查看当前套餐费用。本项目不承诺云平台永久免费。
2. 在本目录按 Cloudflare 官方文档安装并登录 Wrangler，然后执行 `npx wrangler deploy`。初次部署会创建服务和用量计数对象；未设置密钥时 AI 返回“尚未完成后端配置”。
3. 在 Cloudflare 控制台打开该 Worker 的 Settings → Variables and Secrets，添加两个 **Secret**，不要添加为普通公开变量：
   - `MOONSHOT_API_KEY`：你的 Kimi API 密钥，仅在该加密配置框中输入。
   - `STUDY_ACCESS_TOKEN`：自行生成的至少 16 位随机学习口令，供你们使用网页时连接。它与 Kimi 密钥不同，不要重复使用其他账号的密码。
4. 核对普通配置：`KIMI_MODEL` 必须是你的 Kimi API 账户支持的模型；默认值只是经文档核实的接口示例，仍需实际验证。中国大陆平台使用 `https://api.moonshot.cn/v1`；国际平台可改为 `https://api.moonshot.ai/v1`。二者的账号与密钥不可假定互通。
5. 复制部署得到的 HTTPS 服务根地址。在网页右下角打开 Luna → 齿轮，填写后端地址和学习口令。**网页中不填写 Kimi 密钥。**
6. 发送一句简短测试，例如“陪我练习自我介绍”，确认真实响应、费用和模型效果后再常态使用。

`ALLOWED_ORIGIN` 填网页的源（例如 `https://maxwelllee.github.io`，不含仓库路径）。在其他域名部署时必须修改。仅限制来源不能替代认证，因此每次 AI 请求同时验证学习口令。

## 用量与数据边界

- 默认全家合计每天最多 100 次 AI 请求，按北京时间午夜重置；至少间隔 5 秒。上限由 Durable Object 事务持久维护，Worker 重启不会重置。
- 上游失败也计为一次尝试，以保守限制调用量；这个请求次数上限不等于人民币预算。请同时在 Kimi 平台核对账户额度、用量与模型价格。
- 输入最多 12 条消息、总计 10000 字符，另含当前页最多 2400 字符。输出有 token 上限。
- 后端只保存日期、计数和上次请求时间，不存聊天正文；请求会发给 Kimi，仍适用服务商的数据处理规则。
- 学习口令只在网页内存中保留。刷新或重新打开后，需要再次输入。Kimi 密钥从不返回浏览器。
- 本项目仅做文本对话和反馈，不声称测量发音准确率。手机可用系统键盘的语音输入，但语音转写并不是发音评分。

## 官方资料

- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Durable Objects 入门](https://developers.cloudflare.com/durable-objects/get-started/)
- [Kimi Chat Completions](https://platform.kimi.ai/docs/api/chat)

文档核查时间：2026-10。模型名称、价格、平台界面与可用套餐可能变化，以配置时的官方页面为准。
