const { CORS_HEADERS, verifyToken } = require('../../_lib');
const { getSupabase } = require('../../_db');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();

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
};
