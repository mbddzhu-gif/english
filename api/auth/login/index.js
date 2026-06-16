const { CORS_HEADERS } = require('../../_lib');
const { getSupabase } = require('../../_db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'english-learning-secret-2024';

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
};
