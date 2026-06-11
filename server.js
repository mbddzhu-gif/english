const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 3456;

// 智谱 GLM-4.6V-Flash 图像识别
const ZHIPU_API_KEY = '51b00eab6a7b469687aa4cc228a70e1a.hCDzLmQOFuEQTG0L';
const ZHIPU_API_HOST = 'https://open.bigmodel.cn';
const ZHIPU_VLM_MODEL = 'glm-4.6v-flash';

// 星火 Coding Plan 聊天 API
const XF_API_KEY = 'f50a5a1d8f94fb89e08ff98ff0b23b26:YTJhZjBkZTYxMjgwNDdjYjlhNTVmMWFk';
const XF_API_HOST = 'https://maas-coding-api.cn-huabei-1.xf-yun.com';
const XF_MODEL = 'astron-code-latest';

// 讯飞语音（ISE/IAT 语音评测和听写）
const XUNFEI = {
    appId: '2aa0879e',
    apiSecret: 'NGZjMTMyMDE1MzgyNTEzNjcxYWI3MzVl',
    apiKey: '91978f9b204f20a13a321f0d0dbd30db',
    iseHost: 'ise-api.xfyun.cn',
    isePath: '/v2/open-ise',
    iatHost: 'iat-api.xfyun.cn',
    iatPath: '/v2/iat'
};

// 讯飞语音合成（TTS）
const XUNFEI_TTS = {
    appId: 'ddd5e0b5',
    apiSecret: 'ZmUwMGQzNTUyZTI5NWYyNTQ4MWJlZjA5',
    apiKey: '41d3fea0ddb55e7b0bf982689eb92caf',
    host: 'tts-api.xfyun.cn',
    path: '/v2/tts',
    vcn: 'x4_enus_luna_assist'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// ============ 通用 HTTPS 请求 ============
function httpsRequest(host, endpoint, body, apiKey, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(host + endpoint);
        const postData = JSON.stringify(body);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.write(postData);
        req.end();
    });
}

// ============ 讯飞语音鉴权 ============
function generateXunfeiAuthUrl(host, urlPath, apiSecret, apiKey) {
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${urlPath} HTTP/1.1`;
    const signatureSha = crypto.createHmac('sha256', apiSecret)
        .update(signatureOrigin)
        .digest('base64');
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    return `wss://${host}${urlPath}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

// ============ 图像识别 - 智谱 GLM-4.6V-Flash ============
async function handleUnderstandImage(body) {
    const { image_base64, prompt } = body;
    if (!image_base64 || !prompt) {
        return { status: 400, data: { error: 'Missing image_base64 or prompt' } };
    }

    let imageUrl = image_base64.startsWith('data:') ? image_base64 : `data:image/jpeg;base64,${image_base64}`;

    const base64Data = imageUrl.split(',')[1] || '';
    const sizeInMB = (base64Data.length * 3 / 4) / (1024 * 1024);
    console.log(`[Proxy] Image size: ${sizeInMB.toFixed(2)} MB`);

    const zhipuBody = {
        model: ZHIPU_VLM_MODEL,
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
                console.log('[Proxy] Zhipu VLM succeeded');
                return { status: 200, data: { result: content, model: ZHIPU_VLM_MODEL } };
            }

            const errorMsg = result.data.error ? result.data.error.message : `HTTP ${result.status}`;
            console.log(`[Proxy] Zhipu VLM failed: ${errorMsg}, attempt ${attempt + 1}/${maxRetries}`);

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }

            return { status: 500, data: { error: `图片识别失败: ${errorMsg}` } };
        } catch (e) {
            console.log(`[Proxy] Zhipu VLM exception: ${e.message}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }
            return { status: 503, data: { error: '图片识别服务暂时不可用，请稍后重试', retryable: true } };
        }
    }
}

// ============ 聊天 - 星火 Coding Plan ============
async function handleChatCompletion(body) {
    // 将前端传来的 messages 转发，强制使用 astron-code-latest 模型
    const chatBody = {
        model: XF_MODEL,
        messages: body.messages || [],
        stream: false,
        temperature: body.temperature || 0.7,
        top_p: body.top_p || 0.95
    };
    if (body.max_completion_tokens) {
        chatBody.max_tokens = body.max_completion_tokens;
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await httpsRequest(XF_API_HOST, '/v2/chat/completions', chatBody, XF_API_KEY);

            if (result.status === 200) {
                console.log('[Proxy] Chat succeeded');
                return result;
            }

            const errorMsg = result.data.error ? (result.data.error.message || JSON.stringify(result.data.error)) : `HTTP ${result.status}`;
            console.log(`[Proxy] Chat failed: ${errorMsg}, attempt ${attempt + 1}/${maxRetries}`);

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }

            return { status: result.status, data: { error: `对话失败: ${errorMsg}` } };
        } catch (e) {
            console.log(`[Proxy] Chat exception: ${e.message}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                continue;
            }
            return { status: 503, data: { error: '对话服务暂时不可用，请稍后重试', retryable: true } };
        }
    }
}

// ============ 图片生成 - 智谱 Cogview-3-Flash ============
async function handleImageGeneration(body) {
    const { prompt, size } = body;
    if (!prompt) {
        return { status: 400, data: { error: 'Missing prompt' } };
    }

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
                const imageUrl = result.data.data[0].url;
                console.log('[Proxy] Image generation succeeded');
                return { status: 200, data: { url: imageUrl, model: 'cogview-3-flash' } };
            }

            const errorMsg = result.data.error ? result.data.error.message : `HTTP ${result.status}`;
            console.log(`[Proxy] Image generation failed: ${errorMsg}, attempt ${attempt + 1}/${maxRetries}`);

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }

            return { status: 500, data: { error: `图片生成失败: ${errorMsg}` } };
        } catch (e) {
            console.log(`[Proxy] Image generation exception: ${e.message}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return { status: 503, data: { error: '图片生成服务暂时不可用，请稍后重试', retryable: true } };
        }
    }
}

// ============ 静态文件服务 ============
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

function serveStaticFile(req, res) {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = path.join(__dirname, filePath);

    if (!fullPath.startsWith(__dirname)) {
        return false;
    }

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return false;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const data = fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': contentType, ...CORS_HEADERS });
        res.end(data);
        return true;
    } catch (e) {
        return false;
    }
}

// ============ HTTP 服务器 ============
const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, CORS_HEADERS);
        res.end();
        return;
    }

    // 静态文件优先
    if (req.method === 'GET' && serveStaticFile(req, res)) {
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
                case '/api/image_generation':
                    result = await handleImageGeneration(parsed);
                    break;
                case '/api/xunfei/auth-ise':
                    result = { status: 200, data: { url: generateXunfeiAuthUrl(XUNFEI.iseHost, XUNFEI.isePath, XUNFEI.apiSecret, XUNFEI.apiKey) } };
                    break;
                case '/api/xunfei/auth-iat':
                    result = { status: 200, data: { url: generateXunfeiAuthUrl(XUNFEI.iatHost, XUNFEI.iatPath, XUNFEI.apiSecret, XUNFEI.apiKey) } };
                    break;
                case '/api/xunfei/auth-tts':
                    result = { status: 200, data: { url: generateXunfeiAuthUrl(XUNFEI_TTS.host, XUNFEI_TTS.path, XUNFEI_TTS.apiSecret, XUNFEI_TTS.apiKey), appId: XUNFEI_TTS.appId, vcn: XUNFEI_TTS.vcn } };
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
    console.log(`\n🚀 微课堂 Server running at http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/understand_image  - 图像识别 (智谱 GLM-4.6V-Flash)`);
    console.log(`  POST /api/chatcompletion     - 文本聊天 (星火 Astron)`);
    console.log(`  GET  /api/xunfei/auth-ise    - 讯飞 ISE 鉴权`);
    console.log(`  GET  /api/xunfei/auth-iat    - 讯飞 IAT 鉴权`);
    console.log(`  GET  /api/health             - 健康检查\n`);
});
