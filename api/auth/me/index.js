const { CORS_HEADERS, verifyToken } = require('../../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = verifyToken(req);
    if (!user) return res.status(401).json({ error: '未登录或登录已过期' });

    return res.status(200).json({ user });
};
