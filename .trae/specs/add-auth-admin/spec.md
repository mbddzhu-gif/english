# 用户注册登录与管理后台 Spec

## Why
当前应用无用户系统，所有学习记录仅存于浏览器 localStorage，无法跨设备同步，也无法追踪用户使用情况。需要添加注册登录功能和管理后台，以便管理用户和了解应用使用数据。同时修复图片识别 API 过载时的 500 错误。

## What Changes
- 修复图片识别 API 过载时的错误处理（500 → 503 + 更长退避重试）
- 新增注册页面（手机号 + 昵称 + 密码）
- 新增登录页面
- 新增 JWT 认证中间件，所有 API 需登录后访问
- 新增 Supabase 数据库，存储用户信息和使用记录
- 新增管理后台页面（仅管理员 maibaoai 可访问）
- 新增用户使用记录 API（记录每次学习行为）
- **BREAKING**：所有现有 API 端点需携带 Authorization header

## Impact
- Affected code: server.js, api/_lib.js, api/*, index.html, js/app.js, js/api.js, js/config.js, js/history.js
- 新增文件: api/auth/register/index.js, api/auth/login/index.js, api/auth/me/index.js, api/admin/users/index.js, api/admin/stats/index.js, api/usage/index.js, js/auth.js, css/auth.css, admin.html, api/admin/
- 数据库: Supabase 实例，2 张表（users, usage_logs）

## ADDED Requirements

### Requirement: 图片识别错误处理优化
系统 SHALL 在智谱 API 返回"访问量过大"错误时，返回 503 状态码而非 500，并使用更长的退避重试间隔（5s/15s/30s），前端应提示用户"服务繁忙，请稍后重试"。

#### Scenario: 智谱 API 过载
- **WHEN** 智谱 API 返回"访问量过大"错误
- **THEN** 后端重试3次（间隔5s/15s/30s），全部失败后返回 503 + `{"error": "图片识别服务繁忙，请稍后重试", "retryable": true}`
- **AND** 前端显示友好提示"服务繁忙，请稍后重试"

### Requirement: 用户注册
系统 SHALL 提供注册功能，用户需填写手机号、昵称和密码。

#### Scenario: 注册成功
- **WHEN** 用户提交有效的手机号（11位数字）、昵称（2-20字符）和密码（6-20字符）
- **THEN** 系统创建用户记录，自动登录并跳转到首页

#### Scenario: 手机号已注册
- **WHEN** 用户提交已注册的手机号
- **THEN** 系统返回错误"该手机号已注册"

### Requirement: 用户登录
系统 SHALL 提供登录功能，用户通过手机号 + 密码登录。

#### Scenario: 登录成功
- **WHEN** 用户提交正确的手机号和密码
- **THEN** 系统返回 JWT token，前端存储到 localStorage，跳转首页

#### Scenario: 凭证错误
- **WHEN** 用户提交错误的手机号或密码
- **THEN** 系统返回 401 错误"手机号或密码错误"

### Requirement: API 认证中间件
系统 SHALL 对所有 /api/ 端点（除 /api/auth/* 和 /api/health 外）要求 JWT 认证。

#### Scenario: 未登录访问受保护 API
- **WHEN** 请求未携带有效 Authorization header
- **THEN** 返回 401 错误

#### Scenario: 已登录访问受保护 API
- **WHEN** 请求携带有效 JWT token
- **THEN** 正常处理请求

### Requirement: 用户使用记录
系统 SHALL 记录用户的每次学习行为到数据库。

#### Scenario: 记录学习行为
- **WHEN** 用户完成一次图像识别、跟读练习或场景对话
- **THEN** 系统记录 user_id、action_type（identify/practice/dialogue）、subject、created_at 到 usage_logs 表

### Requirement: 管理后台
系统 SHALL 提供管理后台页面，仅管理员账号（maibaoai/m123456）可访问。

#### Scenario: 管理员登录后台
- **WHEN** 管理员用 maibaoai 账号登录并访问后台
- **THEN** 显示管理后台页面，包含：用户列表、使用统计

#### Scenario: 非管理员访问后台
- **WHEN** 非管理员用户尝试访问后台
- **THEN** 返回 403 错误，提示"无权限访问"

### Requirement: 管理后台 - 用户列表
系统 SHALL 在管理后台显示所有注册用户列表。

#### Scenario: 查看用户列表
- **WHEN** 管理员访问用户列表
- **THEN** 显示：昵称、手机号（脱敏，如 138****1234）、注册时间、最后登录时间、使用次数

### Requirement: 管理后台 - 使用统计
系统 SHALL 在管理后台显示使用统计数据。

#### Scenario: 查看使用统计
- **WHEN** 管理员访问使用统计
- **THEN** 显示：总用户数、今日活跃用户数、总使用次数、今日使用次数、近7天每日使用趋势图

## MODIFIED Requirements

### Requirement: 前端页面流程
首页前增加登录/注册页面，未登录用户必须先登录才能使用应用。登录后自动跳转首页。

### Requirement: 学习记录存储
学习记录除保存到 localStorage 外，同时保存到数据库 usage_logs 表。

## REMOVED Requirements
无
