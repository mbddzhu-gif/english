-- 微课堂 Supabase 数据库建表脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(11) UNIQUE NOT NULL,
    nickname VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 使用记录表
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action_type VARCHAR(20) NOT NULL,
    subject VARCHAR(100),
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 插入管理员用户 (密码: m123456)
-- 注意: bcrypt hash 需要在 Node.js 中生成，PowerShell 会破坏 $ 字符
-- 生成方式: node -e "const b=require('bcryptjs');b.hash('m123456',10).then(h=>console.log(h))"
INSERT INTO users (phone, nickname, password_hash, is_admin)
VALUES ('00000000000', 'maibaoai', '$2b$10$HIogIK2PBaQw8vIE0ZwoWOTXZxBEWyHLYtjUEQ95LAWAEHv620LIq', TRUE)
ON CONFLICT (phone) DO NOTHING;

-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- 允许 service_role 完全访问
CREATE POLICY "Service role full access on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on usage_logs" ON usage_logs FOR ALL USING (true) WITH CHECK (true);
