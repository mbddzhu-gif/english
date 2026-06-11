const { CORS_HEADERS, ZHIPU_API_KEY, ZHIPU_API_HOST, httpsRequest } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, size } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const imageBody = {
        model: 'cogview-3-flash',
        prompt: prompt,
        size: size || '1344x768'
    };

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await httpsRequest(ZHIPU_API_HOST, '/api/paas/v4/images/generations', imageBody, ZHIPU_API_KEY);

            if (result.status === 200 && result.data.data && result.data.data.length > 0) {
                return res.status(200).json({ url: result.data.data[0].url, model: 'cogview-3-flash' });
            }

            const errorMsg = result.data.error ? result.data.error.message : `HTTP ${result.status}`;
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return res.status(500).json({ error: `图片生成失败: ${errorMsg}` });
        } catch (e) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return res.status(503).json({ error: '图片生成服务暂时不可用', retryable: true });
        }
    }
};
