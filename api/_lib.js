const https = require('https');
const crypto = require('crypto');

const API_KEY = process.env.MINIMAX_API_KEY || '';
const API_HOST = 'https://api.minimaxi.com';
const XUNFEI_API_KEY = process.env.XUNFEI_API_KEY || '';
const XUNFEI_API_SECRET = process.env.XUNFEI_API_SECRET || '';

function minimaxRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
        if (!API_KEY) {
            reject(new Error('Missing MINIMAX_API_KEY'));
            return;
        }
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
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function generateXunfeiAuthUrl({ host, path, apiKey = XUNFEI_API_KEY, apiSecret = XUNFEI_API_SECRET }) {
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signatureSha = crypto.createHmac('sha256', apiSecret).update(signatureOrigin).digest('base64');
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');
    return `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

module.exports = {
    minimaxRequest,
    CORS_HEADERS,
    API_KEY,
    API_HOST,
    XUNFEI_API_KEY,
    XUNFEI_API_SECRET,
    generateXunfeiAuthUrl
};
