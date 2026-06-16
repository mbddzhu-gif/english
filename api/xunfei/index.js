const { CORS_HEADERS, XUNFEI_TTS_API_KEY, XUNFEI_TTS_API_SECRET, XUNFEI_TTS_APP_ID, XUNFEI_TTS_VCN, XUNFEI_API_KEY, XUNFEI_API_SECRET, generateXunfeiAuthUrl } = require('../_lib');

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

function handleTts(req, res) {
    const url = generateXunfeiAuthUrl({
        host: 'tts-api.xfyun.cn',
        path: '/v2/tts',
        apiSecret: XUNFEI_TTS_API_SECRET,
        apiKey: XUNFEI_TTS_API_KEY
    });
    return res.status(200).json({ url, appId: XUNFEI_TTS_APP_ID, vcn: XUNFEI_TTS_VCN });
}

function handleIse(req, res) {
    const url = generateXunfeiAuthUrl({ host: 'ise-api.xfyun.cn', path: '/v2/open-ise', apiSecret: XUNFEI_API_SECRET, apiKey: XUNFEI_API_KEY });
    return res.status(200).json({ url });
}

function handleIat(req, res) {
    const url = generateXunfeiAuthUrl({ host: 'iat-api.xfyun.cn', path: '/v2/iat', apiSecret: XUNFEI_API_SECRET, apiKey: XUNFEI_API_KEY });
    return res.status(200).json({ url });
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const action = req.query.action;

    if (action === 'tts') return handleTts(req, res);
    if (action === 'ise') return handleIse(req, res);
    if (action === 'iat') return handleIat(req, res);

    return res.status(400).json({ error: 'Unknown xunfei action. Use ?action=tts|ise|iat' });
};
