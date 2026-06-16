const { CORS_HEADERS, ZHIPU_API_KEY, ZHIPU_API_HOST, httpsRequest } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { image_base64, prompt } = req.body || {};
    if (!image_base64 || !prompt) return res.status(400).json({ error: 'Missing image_base64 or prompt' });

    const imageUrl = image_base64.startsWith('data:') ? image_base64 : `data:image/jpeg;base64,${image_base64}`;

    const zhipuBody = {
        model: 'glm-4.6v-flash',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl } },
                    { type: 'text', text: prompt }
                ]
            }
        ]
    };

    const maxRetries = 3;
    const retryIntervals = [5000, 15000, 30000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await httpsRequest(ZHIPU_API_HOST, '/api/paas/v4/chat/completions', zhipuBody, ZHIPU_API_KEY);

            if (result.status === 200) {
                let content = '';
                if (result.data.choices && result.data.choices[0] && result.data.choices[0].message) {
                    content = result.data.choices[0].message.content;
                } else if (result.data.content) {
                    content = result.data.content;
                } else {
                    content = JSON.stringify(result.data);
                }
                return res.status(200).json({ result: content, model: 'glm-4.6v-flash' });
            }

            const errorMsg = result.data.error ? result.data.error.message : `HTTP ${result.status}`;

            // 检测服务过载错误
            const overloadKeywords = ['访问量过大', 'rate limit', 'too many requests', '并发', '限流', 'overload'];
            const isOverload = overloadKeywords.some(kw => errorMsg.toLowerCase().includes(kw.toLowerCase()));

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryIntervals[attempt]));
                continue;
            }

            if (isOverload) {
                return res.status(503).json({ error: '图片识别服务繁忙，请稍后重试', retryable: true });
            }
            return res.status(500).json({ error: `图片识别失败: ${errorMsg}` });
        } catch (e) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryIntervals[attempt]));
                continue;
            }
            return res.status(503).json({ error: '图片识别服务暂时不可用，请稍后重试', retryable: true });
        }
    }
};
