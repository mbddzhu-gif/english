const { CORS_HEADERS, XUNFEI_TTS_API_KEY, XUNFEI_TTS_API_SECRET, XUNFEI_TTS_APP_ID, XUNFEI_TTS_VCN, generateXunfeiAuthUrl } = require('../../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const url = generateXunfeiAuthUrl({
        host: 'tts-api.xfyun.cn',
        path: '/v2/tts',
        apiSecret: XUNFEI_TTS_API_SECRET,
        apiKey: XUNFEI_TTS_API_KEY
    });

    return res.status(200).json({ url, appId: XUNFEI_TTS_APP_ID, vcn: XUNFEI_TTS_VCN });
};
