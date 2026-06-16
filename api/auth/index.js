const { CORS_HEADERS, verifyToken } = require('../_lib');
const { getSupabase } = require('../_db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'english-learning-secret-2024';

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

async function handleLogin(req, res) {
    const { phone, password } = req.body || {};
    if (!phone || !password) return res.status(400).json({ error: '请输入手机号和密码' });

    try {
        const supabase = getSupabase();
        const { data: users } = await supabase.from('users').select('id, phone, nickname, password_hash, is_admin').eq('phone', phone).limit(1);
        if (!users || users.length === 0) return res.status(401).json({ error: '手机号或密码错误' });

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: '手机号或密码错误' });

        await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

        const token = jwt.sign({ userId: user.id, phone: user.phone, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({ token, user: { id: user.id, nickname: user.nickname, phone: user.phone, isAdmin: user.is_admin } });
    } catch (e) {
        console.error('Login error:', e);
        return res.status(500).json({ error: '登录失败，请稍后重试' });
    }
}

async function handleRegister(req, res) {
    const { phone, nickname, password } = req.body || {};
    if (!phone || !/^\d{11}$/.test(phone)) return res.status(400).json({ error: '请输入有效的11位手机号' });
    if (!nickname || nickname.length < 2 || nickname.length > 20) return res.status(400).json({ error: '昵称需要2-20个字符' });
    if (!password || password.length < 6 || password.length > 20) return res.status(400).json({ error: '密码需要6-20个字符' });

    try {
        const supabase = getSupabase();
        const { data: existing } = await supabase.from('users').select('id').eq('phone', phone).limit(1);
        if (existing && existing.length > 0) return res.status(409).json({ error: '该手机号已注册' });

        const passwordHash = await bcrypt.hash(password, 10);
        const { data: result, error } = await supabase.from('users').insert({ phone, nickname, password_hash: passwordHash }).select('id, phone, nickname, is_admin').single();
        if (error) throw error;

        const token = jwt.sign({ userId: result.id, phone: result.phone, isAdmin: result.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({ token, user: { id: result.id, nickname: result.nickname, phone: result.phone, isAdmin: result.is_admin } });
    } catch (e) {
        console.error('Register error:', e);
        return res.status(500).json({ error: '注册失败，请稍后重试' });
    }
}

function handleMe(req, res) {
    const user = verifyToken(req);
    if (!user) return res.status(401).json({ error: '未登录或登录已过期' });
    return res.status(200).json({ user });
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action;

    if (action === 'login' && req.method === 'POST') return handleLogin(req, res);
    if (action === 'register' && req.method === 'POST') return handleRegister(req, res);
    if (action === 'me') return handleMe(req, res);

    return res.status(400).json({ error: 'Unknown auth action. Use ?action=login|register|me' });
};
