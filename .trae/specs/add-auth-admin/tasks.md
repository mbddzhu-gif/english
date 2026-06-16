# Tasks

- [x] Task 1: 修复图片识别 API 错误处理
  - [x] 1.1: server.js handleUnderstandImage 重试间隔改为 5s/15s/30s
  - [x] 1.2: 智谱 API 过载时返回 503 而非 500
  - [x] 1.3: api/understand_image/index.js 同步修改
  - [x] 1.4: 前端 app.js 对 503 错误显示"服务繁忙，请稍后重试"

- [x] Task 2: 搭建 Supabase 数据库
  - [x] 2.1: 创建 db.js 和 api/_db.js 模块
  - [x] 2.2: 创建 db/schema.sql 建表脚本
  - [x] 2.3: 在 Supabase 中执行建表脚本
  - [x] 2.4: 在 api/_lib.js 和 server.js 中添加数据库连接配置

- [x] Task 3: 实现用户注册 API
  - [x] 3.1: 安装 bcryptjs 和 jsonwebtoken 依赖
  - [x] 3.2: api/auth/register/index.js - 注册端点（手机号+昵称+密码）
  - [x] 3.3: server.js 添加 /api/auth/register 路由
  - [x] 3.4: 输入验证（手机号11位、昵称2-20字符、密码6-20字符）

- [x] Task 4: 实现用户登录 API
  - [x] 4.1: api/auth/login/index.js - 登录端点（手机号+密码→JWT）
  - [x] 4.2: server.js 添加 /api/auth/login 路由
  - [x] 4.3: api/auth/me/index.js - 获取当前用户信息端点
  - [x] 4.4: server.js 添加 /api/auth/me 路由

- [x] Task 5: 实现 JWT 认证中间件
  - [x] 5.1: api/_lib.js 添加 verifyToken 中间件函数
  - [x] 5.2: server.js 中间件添加 JWT 验证逻辑
  - [x] 5.3: 前端 js/api.js 所有请求添加 Authorization header

- [x] Task 6: 实现用户使用记录 API
  - [x] 6.1: api/usage/index.js - POST 记录使用行为
  - [x] 6.2: server.js 添加 /api/usage 路由
  - [x] 6.3: 前端在图像识别、跟读练习、场景对话完成后调用记录 API

- [x] Task 7: 前端登录/注册页面
  - [x] 7.1: index.html 添加 page-login 和 page-register section
  - [x] 7.2: css/style.css 添加登录/注册页面样式
  - [x] 7.3: js/auth.js 实现登录/注册逻辑和 token 管理
  - [x] 7.4: js/app.js 修改页面流程：未登录→登录页，登录后→首页
  - [x] 7.5: js/api.js 所有请求添加 Authorization header

- [x] Task 8: 管理后台
  - [x] 8.1: admin.html 管理后台页面（独立页面）
  - [x] 8.2: api/admin/users/index.js - 用户列表 API
  - [x] 8.3: api/admin/stats/index.js - 使用统计 API
  - [x] 8.4: server.js 添加管理后台 API 路由
  - [x] 8.5: 管理员权限验证（is_admin 字段检查）

- [x] Task 9: 修复 admin.html 字段名不匹配问题
  - [x] 9.1: 修复 dailyUsage → dailyStats 字段名
  - [x] 9.2: 修复 createdAt → created_at, usageCount → usage_count, isAdmin → is_admin 字段名

- [x] Task 10: 集成测试与部署
  - [x] 10.1: 在 Supabase 中创建数据库表
  - [x] 10.2: 本地测试注册/登录流程
  - [x] 10.3: 本地测试管理后台访问权限
  - [x] 10.4: 本地测试使用记录写入
  - [x] 10.5: vercel.json 配置已验证正确
  - [ ] 10.6: 推送代码到 GitHub

# Task Dependencies
- All tasks completed except 10.6 (push to GitHub)
