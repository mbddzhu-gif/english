const https = require('https');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'english-learning-secret-2024';

function verifyToken(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
        return jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch (e) {
        return null;
    }
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// 智谱 API
const ZHIPU_API_KEY = '51b00eab6a7b469687aa4cc228a70e1a.hCDzLmQOFuEQTG0L';
const ZHIPU_API_HOST = 'https://open.bigmodel.cn';

// ModelScope Z-Image-Turbo
const MS_API_KEY = 'ms-f76bd564-e3d6-4215-8e8c-13a3366c1733';
const MS_API_HOST = 'https://api-inference.modelscope.cn';
const MS_MODEL = 'Tongyi-MAI/Z-Image-Turbo';

// 星火 Coding Plan
const XF_API_KEY = 'f50a5a1d8f94fb89e08ff98ff0b23b26:YTJhZjBkZTYxMjgwNDdjYjlhNTVmMWFk';
const XF_API_HOST = 'https://maas-coding-api.cn-huabei-1.xf-yun.com';
const XF_MODEL = 'astron-code-latest';

// 讯飞语音（ISE/IAT）
const XUNFEI_API_KEY = '91978f9b204f20a13a321f0d0dbd30db';
const XUNFEI_API_SECRET = 'NGZjMTMyMDE1MzgyNTEzNjcxYWI3MzVl';

// 讯飞语音合成（TTS）
const XUNFEI_TTS_API_KEY = '41d3fea0ddb55e7b0bf982689eb92caf';
const XUNFEI_TTS_API_SECRET = 'ZmUwMGQzNTUyZTI5NWYyNTQ4MWJlZjA5';
const XUNFEI_TTS_APP_ID = 'ddd5e0b5';
const XUNFEI_TTS_VCN = 'x4_enus_luna_assist';

function httpsRequest(host, endpoint, body, apiKey, timeout = 60000, extraHeaders = {}) {
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
                'Content-Length': Buffer.byteLength(postData),
                ...extraHeaders
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

function httpsGet(host, endpoint, apiKey, timeout = 60000, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(host + endpoint);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...extraHeaders
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
        req.end();
    });
}

function generateXunfeiAuthUrl({ host, path, apiSecret, apiKey }) {
    const secret = apiSecret || XUNFEI_API_SECRET;
    const key = apiKey || XUNFEI_API_KEY;
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signatureSha = crypto.createHmac('sha256', secret)
        .update(signatureOrigin)
        .digest('base64');
    const authorizationOrigin = `api_key="${key}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    return `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

module.exports = {
    CORS_HEADERS,
    JWT_SECRET,
    verifyToken,
    ZHIPU_API_KEY,
    ZHIPU_API_HOST,
    MS_API_KEY,
    MS_API_HOST,
    MS_MODEL,
    XF_API_KEY,
    XF_API_HOST,
    XF_MODEL,
    XUNFEI_API_KEY,
    XUNFEI_API_SECRET,
    XUNFEI_TTS_API_KEY,
    XUNFEI_TTS_API_SECRET,
    XUNFEI_TTS_APP_ID,
    XUNFEI_TTS_VCN,
    httpsRequest,
    httpsGet,
    generateXunfeiAuthUrl
};
