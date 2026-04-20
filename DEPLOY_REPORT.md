# Vercel 部署报告（微课堂2）

## 1. 部署形态结论
- 前端：静态站点（`index.html` + `css/` + `js/`），不依赖 Next/React/Vue。
- 后端：Vercel Functions（`api/`）负责代理第三方（MiniMax）与生成讯飞 WebSocket 鉴权 URL。
- Vercel 配置：使用 `@vercel/static-build` 生成静态产物到 `dist/`，并保留 `api/` Functions。

## 2. 已识别并修复的部署阻塞项
- 修复：补齐缺失接口
  - 新增 `/api/xunfei/auth-iat` 与 `/api/xunfei/auth-ise` Functions，用于生成讯飞 WS 鉴权 URL。
- 修复：环境变量缺失导致的不可诊断失败
  - `MINIMAX_API_KEY` 未配置时，Functions 会明确返回错误（避免带空 Bearer 调用第三方）。
- 修复：仓库敏感信息风险
  - `server.js` 移除硬编码密钥，改为读取环境变量。
- 修复：部署体积/构建时间风险
  - 移除仓库中的 `node_modules/`，通过依赖安装获取。

## 3. 构建与包体优化
- 新增构建脚本：`npm run build`（[build.js](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/build.js)）
  - 输出目录：`dist/`
  - 对 `js/*.js`、`css/*.css` 进行压缩（esbuild transform），并保留原目录结构，降低静态资源体积。
- 代码分割/懒加载（无需引入框架）
  - 将 `js/xunfei.js` 从首屏移除，改为在首次触发语音相关能力时动态加载（[app.js](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/js/app.js) + [utils.js](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/js/utils.js)）。

## 4. 路由、重定向与缓存策略
- `vercel.json` 增加缓存头：
  - HTML（`/`、`/index.html`）：强制 revalidate，避免发布后客户端拿到旧页面。
  - JS/CSS（`/js/*`、`/css/*`）：浏览器每次校验，CDN 可缓存 1 天（兼顾更新与加速）。
- 当前应用不使用 SPA 路由；如未来需要“子路径直达 index.html”，可再追加 rewrite（需明确业务需求后添加）。

## 5. 环境变量清单（Vercel Project Settings）
在 Vercel Dashboard → Project → Settings → Environment Variables 设置：
- `MINIMAX_API_KEY`：MiniMax Bearer token（必需）
- `XUNFEI_API_KEY`：讯飞 APIKey（语音能力必需）
- `XUNFEI_API_SECRET`：讯飞 APISecret（语音能力必需）
- `XUNFEI_APP_ID`：讯飞 APPID（可选；目前前端也有同值）

示例文件：[.env.example](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/.env.example)

## 6. 验证与测试
- Functions 冒烟测试：
  - 运行 `node smoke-tests.js`，验证：
    - `/api/xunfei/auth-iat` 可生成 wss URL
    - 讯飞 env 缺失时返回 500
    - MiniMax env 缺失时返回可诊断错误
- 构建验证：
  - 运行 `npm run build`，确认 `dist/` 产物齐全（`index.html`、`css/`、`js/`）。

## 7. 部署到 Vercel（操作步骤）
推荐通过 Dashboard 连接 Git 仓库：
1) Import Project → 选择仓库
2) Framework Preset 选 “Other”
3) Build Command：`npm run build`
4) Output Directory：`dist`
5) 配置环境变量（见第 5 节）
6) Deploy

CLI 方式（需要登录 Vercel）：
- `npx -y vercel`（首次会引导登录与创建项目）
- `npx -y vercel --prod`

## 8. 后续维护建议
- 安全
  - 不要在仓库中保留任何真实密钥；仅通过 Vercel Environment Variables 管理。
  - 如需对外开放接口，建议为 `/api/*` 增加基础防滥用策略（频率限制/简单签名/验证码方案）。
- 可观测性
  - 在 Functions 中引入统一的错误码与脱敏日志结构，便于定位线上故障。
- 性能
  - 若未来引入 Hash 文件名（例如升级到完整 bundling），可将 `/js/*`、`/css/*` 缓存提升为 `immutable`，进一步降低回源与重复下载。

