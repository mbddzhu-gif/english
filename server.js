const http = require('http');
const https = require('https');
const crypto = require('crypto');

const API_KEY = process.env.MINIMAX_API_KEY || '';
const API_HOST = 'https://api.minimaxi.com';
const PORT = 3456;

const XUNFEI = {
    appId: process.env.XUNFEI_APP_ID || '2aa0879e',
    apiSecret: process.env.XUNFEI_API_SECRET || '',
    apiKey: process.env.XUNFEI_API_KEY || '',
    iseHost: 'ise-api.xfyun.cn',
    isePath: '/v2/open-ise',
    iatHost: 'iat-api.xfyun.cn',
    iatPath: '/v2/iat'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const RETRYABLE_CODES = [1000, 1001, 1002, 2064, 2061];

function generateXunfeiAuthUrl(host, path) {
    if (!XUNFEI.apiSecret || !XUNFEI.apiKey) throw new Error('Missing XUNFEI_API_KEY or XUNFEI_API_SECRET');
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signatureSha = crypto.createHmac('sha256', XUNFEI.apiSecret)
        .update(signatureOrigin)
        .digest('base64');
    const authorizationOrigin = `api_key="${XUNFEI.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    return `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

function minimaxRequest(endpoint, body, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (remaining, delay = 1500) => {
            const urlObj = new URL(API_HOST + endpoint);
            const postData = JSON.stringify(body);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'MM-API-Source': 'minimax-mcp',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const errorCode = parsed.base_resp ? parsed.base_resp.status_code : 0;
                        if (RETRYABLE_CODES.includes(errorCode) && remaining > 0) {
                            const nextDelay = Math.min(delay * 2, 10000);
                            console.log(`[Proxy] Retry ${endpoint} (code=${errorCode}), remaining: ${remaining}, delay: ${delay}ms`);
                            setTimeout(() => attempt(remaining - 1, nextDelay), delay);
                            return;
                        }
                        resolve({ status: res.statusCode, data: parsed });
                    } catch (e) {
                        resolve({ status: res.statusCode, data: data });
                    }
                });
            });
            req.on('error', (e) => {
                if (remaining > 0) {
                    console.log(`[Proxy] Network retry ${endpoint}, remaining: ${remaining}`);
                    setTimeout(() => attempt(remaining - 1, delay), delay);
                } else {
                    reject(e);
                }
            });
            req.setTimeout(60000, () => {
                req.destroy();
                if (remaining > 0) {
                    console.log(`[Proxy] Timeout retry ${endpoint}, remaining: ${remaining}`);
                    setTimeout(() => attempt(remaining - 1, delay), delay);
                } else {
                    reject(new Error('Request timeout'));
                }
            });
            req.write(postData);
            req.end();
        };
        attempt(retries, 1500);
    });
}

async function handleUnderstandImage(body) {
    const { image_base64, prompt } = body;
    if (!image_base64 || !prompt) {
        return { status: 400, data: { error: 'Missing image_base64 or prompt' } };
    }

    let imageUrl = image_base64.startsWith('data:') ? image_base64 : `data:image/jpeg;base64,${image_base64}`;

    const base64Data = imageUrl.split(',')[1] || '';
    const sizeInMB = (base64Data.length * 3 / 4) / (1024 * 1024);
    console.log(`[Proxy] Image size: ${sizeInMB.toFixed(2)} MB`);

    const vlmBody = {
        prompt: prompt,
        image_url: imageUrl
    };

    try {
        const result = await minimaxRequest('/v1/coding_plan/vlm', vlmBody, 6);

        if (result.status === 200 && result.data.base_resp && result.data.base_resp.status_code === 0) {
            let content = '';
            if (result.data.choices && result.data.choices[0]) {
                content = result.data.choices[0].message.content;
            } else if (result.data.content) {
                content = result.data.content;
            } else {
                content = JSON.stringify(result.data);
            }
            console.log('[Proxy] VLM succeeded');
            return { status: 200, data: { result: content, model: 'coding-plan-vlm' } };
        }

        const errorCode = result.data.base_resp ? result.data.base_resp.status_code : 0;
        const errorMsg = result.data.base_resp ? result.data.base_resp.status_msg : '';

        if (RETRYABLE_CODES.includes(errorCode)) {
            console.log(`[Proxy] VLM retryable error exhausted: code=${errorCode}`);
            return { status: 503, data: { error: '图片识别服务繁忙，请稍后重试', code: errorCode, retryable: true } };
        }

        console.log(`[Proxy] VLM failed: code=${errorCode} msg=${errorMsg}`);
        return { status: 500, data: { error: errorMsg || `API error code ${errorCode}` } };
    } catch (e) {
        console.log(`[Proxy] VLM exception: ${e.message}`);
        return { status: 503, data: { error: '图片识别服务暂时不可用，请稍后重试', retryable: true } };
    }
}

async function handleChatCompletion(body) {
    try {
        const result = await minimaxRequest('/v1/text/chatcompletion_v2', body, 3);
        const errorCode = result.data.base_resp ? result.data.base_resp.status_code : 0;
        if (RETRYABLE_CODES.includes(errorCode)) {
            return { status: 503, data: { error: '服务繁忙，请稍后重试', code: errorCode, retryable: true } };
        }
        if (errorCode !== 0) {
            const errorMsg = result.data.base_resp ? result.data.base_resp.status_msg : '';
            console.log(`[Proxy] Chat error: code=${errorCode} msg=${errorMsg}`);
        }
        return result;
    } catch (e) {
        console.log(`[Proxy] Chat exception: ${e.message}`);
        return { status: 503, data: { error: '对话服务暂时不可用，请稍后重试', retryable: true } };
    }
}

async function handleTTS(body) {
    try {
        return await minimaxRequest('/v1/t2a_v2', body, 2);
    } catch (e) {
        return { status: 500, data: { error: e.message } };
    }
}

async function handleImageGeneration(body) {
    try {
        const result = await minimaxRequest('/v1/image_generation', body, 4);
        const errorCode = result.data.base_resp ? result.data.base_resp.status_code : 0;
        if (RETRYABLE_CODES.includes(errorCode)) {
            return { status: 503, data: { error: '图片生成服务繁忙，请稍后重试', code: errorCode, retryable: true } };
        }
        if (errorCode !== 0) {
            const errorMsg = result.data.base_resp ? result.data.base_resp.status_msg : '';
            console.log(`[Proxy] Image generation error: code=${errorCode} msg=${errorMsg}`);
            return { status: 500, data: { error: errorMsg || `图片生成失败(code ${errorCode})` } };
        }
        return result;
    } catch (e) {
        console.log(`[Proxy] Image generation exception: ${e.message}`);
        return { status: 503, data: { error: '图片生成服务暂时不可用，请稍后重试', retryable: true } };
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, CORS_HEADERS);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const parsed = body ? JSON.parse(body) : {};
            let result;

            switch (req.url) {
                case '/api/understand_image':
                    result = await handleUnderstandImage(parsed);
                    break;
                case '/api/chatcompletion':
                    result = await handleChatCompletion(parsed);
                    break;
                case '/api/tts':
                    result = await handleTTS(parsed);
                    break;
                case '/api/image_generation':
                    result = await handleImageGeneration(parsed);
                    break;
                case '/api/xunfei/auth-ise':
                    result = { status: 200, data: { url: generateXunfeiAuthUrl(XUNFEI.iseHost, XUNFEI.isePath) } };
                    break;
                case '/api/xunfei/auth-iat':
                    result = { status: 200, data: { url: generateXunfeiAuthUrl(XUNFEI.iatHost, XUNFEI.iatPath) } };
                    break;
                case '/api/health':
                    result = { status: 200, data: { status: 'ok', time: new Date().toISOString() } };
                    break;
                default:
                    result = { status: 404, data: { error: 'Unknown endpoint: ' + req.url } };
            }

            res.writeHead(result.status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify(result.data));
        } catch (e) {
            console.error('[Proxy] Error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 MiniMax API Proxy Server running at http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/understand_image  - Image understanding (6 retries)`);
    console.log(`  POST /api/chatcompletion     - Text chat (3 retries)`);
    console.log(`  POST /api/tts                - Text to speech`);
    console.log(`  POST /api/image_generation   - Image generation (4 retries)`);
    console.log(`  GET  /api/xunfei/auth-ise    - Xunfei ISE auth URL`);
    console.log(`  GET  /api/xunfei/auth-iat    - Xunfei IAT auth URL`);
    console.log(`  GET  /api/health             - Health check`);
    console.log(`\nXunfei APPID: ${XUNFEI.appId}\n`);
});
