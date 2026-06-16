const { CORS_HEADERS, verifyToken } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).json({ ok: true }); // 静默接受，不强制认证

    try {
        const { step, errorMessage, errorType, stack, userAgent, url, extra } = req.body || {};

        const logEntry = {
            timestamp: new Date().toISOString(),
            step: step || 'unknown',
            errorType: errorType || 'unknown',
            errorMessage: (errorMessage || '').substring(0, 500),
            stack: stack ? stack.substring(0, 1000) : null,
            userAgent: userAgent ? userAgent.substring(0, 200) : null,
            url: url ? url.substring(0, 200) : null,
            extra: extra || null
        };

        console.error(`[ClientError] ${JSON.stringify(logEntry)}`);

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('[ErrorLog] Failed to process:', e.message);
        return res.status(200).json({ ok: true }); // 永远不返回错误，避免二次报错
    }
};
