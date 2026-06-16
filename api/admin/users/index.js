const { CORS_HEADERS, verifyToken } = require('../../_lib');
const { getSupabase } = require('../../_db');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = verifyToken(req);
    if (!user || !user.isAdmin) return res.status(403).json({ error: '无权限访问' });

    try {
        const supabase = getSupabase();
        const { data: users, error } = await supabase.from('users').select('id, nickname, phone, is_admin, created_at, last_login_at').order('created_at', { ascending: false });
        if (error) throw error;

        const { data: usageCounts } = await supabase.from('usage_logs').select('user_id');

        const countMap = {};
        (usageCounts || []).forEach(r => { countMap[r.user_id] = (countMap[r.user_id] || 0) + 1; });

        const masked = (users || []).map(u => ({
            ...u,
            phone: u.phone.slice(0, 3) + '****' + u.phone.slice(-4),
            usage_count: countMap[u.id] || 0
        }));
        return res.status(200).json({ users: masked });
    } catch (e) {
        console.error('Admin users error:', e);
        return res.status(500).json({ error: '查询失败' });
    }
};
