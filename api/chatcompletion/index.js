const { CORS_HEADERS, XF_API_KEY, XF_API_HOST, XF_MODEL, httpsRequest } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const chatBody = {
        model: XF_MODEL,
        messages: req.body.messages || [],
        stream: false,
        temperature: req.body.temperature || 0.7,
        top_p: req.body.top_p || 0.95
    };
    if (req.body.max_completion_tokens) chatBody.max_tokens = req.body.max_completion_tokens;

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await httpsRequest(XF_API_HOST, '/v2/chat/completions', chatBody, XF_API_KEY);
            if (result.status === 200) return res.status(200).json(result.data);

            const errorMsg = result.data.error ? (result.data.error.message || JSON.stringify(result.data.error)) : `HTTP ${result.status}`;
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }
            return res.status(result.status).json({ error: `对话失败: ${errorMsg}` });
        } catch (e) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }
            return res.status(503).json({ error: '对话服务暂时不可用', retryable: true });
        }
    }
};
