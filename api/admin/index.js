const { CORS_HEADERS, verifyToken } = require('../_lib');
const { getSupabase } = require('../_db');

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

async function handleStats(req, res) {
    const user = verifyToken(req);
    if (!user || !user.isAdmin) return res.status(403).json({ error: '无权限访问' });

    try {
        const supabase = getSupabase();
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: totalUsage } = await supabase.from('usage_logs').select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsage } = await supabase.from('usage_logs').select('*', { count: 'exact', head: true }).gte('created_at', today);
        const { data: todayActiveData } = await supabase.from('usage_logs').select('user_id').gte('created_at', today);
        const todayActive = new Set((todayActiveData || []).map(r => r.user_id)).size;

        const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
        const { data: dailyData } = await supabase.from('usage_logs').select('created_at').gte('created_at', sevenDaysAgo);

        const dailyMap = {};
        (dailyData || []).forEach(r => {
            const date = r.created_at.split('T')[0];
            dailyMap[date] = (dailyMap[date] || 0) + 1;
        });
        const dailyStats = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            dailyStats.push({ date: d, count: dailyMap[d] || 0 });
        }

        return res.status(200).json({ totalUsers: totalUsers || 0, totalUsage: totalUsage || 0, todayUsage: todayUsage || 0, todayActive, dailyStats });
    } catch (e) {
        console.error('Admin stats error:', e);
        return res.status(500).json({ error: '查询失败' });
    }
}

async function handleUsers(req, res) {
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
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action;

    if (action === 'stats') return handleStats(req, res);
    if (action === 'users') return handleUsers(req, res);

    return res.status(400).json({ error: 'Unknown admin action. Use ?action=stats|users' });
};
