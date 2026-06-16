const { CORS_HEADERS } = require('../../_lib');
const { getSupabase } = require('../../_db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'english-learning-secret-2024';

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
};
