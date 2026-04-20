const { CORS_HEADERS, XUNFEI_API_KEY, XUNFEI_API_SECRET, generateXunfeiAuthUrl } = require('../../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!XUNFEI_API_KEY || !XUNFEI_API_SECRET) {
        return res.status(500).json({ error: 'Missing XUNFEI_API_KEY or XUNFEI_API_SECRET' });
    }

    const url = generateXunfeiAuthUrl({ host: 'ise-api.xfyun.cn', path: '/v2/open-ise' });
    return res.status(200).json({ url });
};

