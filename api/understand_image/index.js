const { minimaxRequest, CORS_HEADERS } = require('../_lib');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { image_base64, prompt } = req.body || {};

    if (!image_base64 || !prompt) {
        return res.status(400).json({ error: 'Missing image_base64 or prompt' });
    }

    const imageUrl = image_base64.startsWith('data:') ? image_base64 : `data:image/jpeg;base64,${image_base64}`;

    try {
        const result = await minimaxRequest('/v1/coding_plan/vlm', {
            prompt: prompt,
            image_url: imageUrl
        });

        if (result.status === 200 && result.data.base_resp && result.data.base_resp.status_code === 0) {
            let content = '';
            if (result.data.choices && result.data.choices[0]) {
                content = result.data.choices[0].message.content;
            } else if (result.data.content) {
                content = result.data.content;
            } else {
                content = JSON.stringify(result.data);
            }
            return res.status(200).json({ result: content, model: 'coding-plan-vlm' });
        }

        const errorCode = result.data.base_resp ? result.data.base_resp.status_code : 0;
        const errorMsg = result.data.base_resp ? result.data.base_resp.status_msg : '';
        return res.status(500).json({ error: errorMsg || `API error code ${errorCode}` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
