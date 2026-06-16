const { CORS_HEADERS, verifyToken } = require('../_lib');
const { getSupabase } = require('../_db');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = verifyToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });

    const { action_type, subject, detail } = req.body || {};
    if (!action_type) return res.status(400).json({ error: 'Missing action_type' });

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('usage_logs').insert({ user_id: user.userId, action_type, subject: subject || null, detail: detail || null });
        if (error) throw error;
        return res.status(201).json({ ok: true });
    } catch (e) {
        console.error('Usage log error:', e);
        return res.status(500).json({ error: '记录失败' });
    }
};
