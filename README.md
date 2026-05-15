# 嘴替大王

一个移动端优先的单页面 Web 应用，用来把家族群营销号内容转成不伤感情的辟谣回复。

## 本地预览

静态页面可以直接打开 `index.html` 查看。

要在本地测试完整 API 流程，先创建 `.env.local`：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_API_ENDPOINT=https://api.deepseek.com/chat/completions
```

然后运行：

```bash
node local-server.js
```

打开 `http://localhost:4173`。

## Vercel 部署

在 Vercel 项目环境变量里配置：

- `DEEPSEEK_API_KEY`：DeepSeek API Key
- `DEEPSEEK_API_ENDPOINT`：可选，默认 `https://api.deepseek.com/chat/completions`

前端只请求 `/api/generate`，不会暴露 API Key。
