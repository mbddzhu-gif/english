require('dotenv').config();
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getSupabase } = require('./db');

const PORT = 3456;

// 智谱 GLM-4.6V-Flash 图像识别
const ZHIPU_API_KEY = '51b00eab6a7b469687aa4cc228a70e1a.hCDzLmQOFuEQTG0L';
const ZHIPU_API_HOST = 'https://open.bigmodel.cn';
const ZHIPU_VLM_MODEL = 'glm-4.6v-flash';

// ModelScope Z-Image-Turbo 图片生成
const MS_API_KEY = 'ms-f76bd564-e3d6-4215-8e8c-13a3366c1733';
const MS_API_HOST = 'https://api-inference.modelscope.cn';
const MS_MODEL = 'Tongyi-MAI/Z-Image-Turbo';

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

// ============ JWT 认证 ============
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

// ============ 通用 HTTPS 请求 ============
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

// ============ 通用 HTTPS GET 请求 ============
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
                console.log('[Proxy] Zhipu VLM succeeded');
                return { status: 200, data: { result: content, model: ZHIPU_VLM_MODEL } };
            }

            const errorMsg = result.data.error ? result.data.error.message : `HTTP ${result.status}`;
            console.log(`[Proxy] Zhipu VLM failed: ${errorMsg}, attempt ${attempt + 1}/${maxRetries}`);

            // 检测服务过载错误
            const overloadKeywords = ['访问量过大', 'rate limit', 'too many requests', '并发', '限流', 'overload'];
            const isOverload = overloadKeywords.some(kw => errorMsg.toLowerCase().includes(kw.toLowerCase()));

            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryIntervals[attempt]));
                continue;
            }

            if (isOverload) {
                return { status: 503, data: { error: '图片识别服务繁忙，请稍后重试', retryable: true } };
            }
            return { status: 500, data: { error: `图片识别失败: ${errorMsg}` } };
        } catch (e) {
            console.log(`[Proxy] Zhipu VLM exception: ${e.message}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, retryIntervals[attempt]));
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

// ============ 图片生成 - ModelScope Z-Image-Turbo（异步模式） ============
async function handleImageGeneration(body) {
    const { prompt, size } = body;
    if (!prompt) {
        return { status: 400, data: { error: 'Missing prompt' } };
    }

    const imageBody = {
        model: MS_MODEL,
        prompt: prompt,
        size: size || '1024x768',
        steps: 8,
        guidance: 1.5
    };

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // 步骤1: 提交异步任务
            const submitResult = await httpsRequest(
                MS_API_HOST, '/v1/images/generations', imageBody, MS_API_KEY, 60000,
                { 'X-ModelScope-Async-Mode': 'true' }
            );

            const taskId = submitResult.data.task_id;
            if (!taskId) {
                const errorMsg = submitResult.data.error || submitResult.data.message || JSON.stringify(submitResult.data);
                console.log(`[Proxy] Z-Image submit failed: ${errorMsg}, attempt ${attempt + 1}/${maxRetries}`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                    continue;
                }
                return { status: 500, data: { error: `图片生成提交失败: ${errorMsg}` } };
            }

            console.log(`[Proxy] Z-Image task submitted: ${taskId}`);

            // 步骤2: 轮询任务结果
            const pollTimeout = 120000; // 最多等2分钟
            const pollInterval = 4000;  // 每4秒轮询一次
            const startTime = Date.now();

            while (Date.now() - startTime < pollTimeout) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                const pollResult = await httpsGet(
                    MS_API_HOST, `/v1/tasks/${taskId}`, MS_API_KEY, 30000,
                    { 'X-ModelScope-Task-Type': 'image_generation' }
                );

                const taskStatus = pollResult.data.task_status;

                if (taskStatus === 'SUCCEED') {
                    const imageUrl = pollResult.data.output_images && pollResult.data.output_images[0];
                    if (imageUrl) {
                        console.log('[Proxy] Z-Image generation succeeded');
                        return { status: 200, data: { url: imageUrl, model: MS_MODEL } };
                    }
                    return { status: 500, data: { error: '图片生成成功但未返回图片URL' } };
                }

                if (taskStatus === 'FAILED') {
                    const errorMsg = (pollResult.data.errors && pollResult.data.errors.message) || '未知错误';
                    console.log(`[Proxy] Z-Image task failed: ${errorMsg}`);
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                        break; // 跳出轮询，进入下一次重试
                    }
                    return { status: 500, data: { error: `图片生成失败: ${errorMsg}` } };
                }

                // RUNNING 或其他状态，继续轮询
                console.log(`[Proxy] Z-Image task status: ${taskStatus}`);
            }

            // 轮询超时
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return { status: 504, data: { error: '图片生成超时，请稍后重试' } };
        } catch (e) {
            console.log(`[Proxy] Z-Image exception: ${e.message}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return { status: 503, data: { error: '图片生成服务暂时不可用，请稍后重试', retryable: true } };
        }
    }
}

// ============ 认证 - 注册 ============
async function handleAuthRegister(body) {
    const { phone, nickname, password } = body || {};
    if (!phone || !/^\d{11}$/.test(phone)) return { status: 400, data: { error: '请输入有效的11位手机号' } };
    if (!nickname || nickname.length < 2 || nickname.length > 20) return { status: 400, data: { error: '昵称需要2-20个字符' } };
    if (!password || password.length < 6 || password.length > 20) return { status: 400, data: { error: '密码需要6-20个字符' } };

    try {
        const supabase = getSupabase();
        const { data: existing } = await supabase.from('users').select('id').eq('phone', phone).limit(1);
        if (existing && existing.length > 0) return { status: 409, data: { error: '该手机号已注册' } };

        const passwordHash = await bcrypt.hash(password, 10);
        const { data: result, error } = await supabase.from('users').insert({ phone, nickname, password_hash: passwordHash }).select('id, phone, nickname, is_admin').single();
        if (error) throw error;

        const token = jwt.sign({ userId: result.id, phone: result.phone, isAdmin: result.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        return { status: 201, data: { token, user: { id: result.id, nickname: result.nickname, phone: result.phone, isAdmin: result.is_admin } } };
    } catch (e) {
        console.error('Register error:', e);
        return { status: 500, data: { error: '注册失败，请稍后重试' } };
    }
}

// ============ 认证 - 登录 ============
async function handleAuthLogin(body) {
    const { phone, password } = body || {};
    if (!phone || !password) return { status: 400, data: { error: '请输入手机号和密码' } };

    try {
        const supabase = getSupabase();
        const { data: users } = await supabase.from('users').select('id, phone, nickname, password_hash, is_admin').eq('phone', phone).limit(1);
        if (!users || users.length === 0) return { status: 401, data: { error: '手机号或密码错误' } };

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return { status: 401, data: { error: '手机号或密码错误' } };

        await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
        const token = jwt.sign({ userId: user.id, phone: user.phone, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        return { status: 200, data: { token, user: { id: user.id, nickname: user.nickname, phone: user.phone, isAdmin: user.is_admin } } };
    } catch (e) {
        console.error('Login error:', e);
        return { status: 500, data: { error: '登录失败，请稍后重试' } };
    }
}

// ============ 认证 - 获取当前用户 ============
function handleAuthMe(req) {
    const user = verifyToken(req);
    if (!user) return { status: 401, data: { error: '未登录或登录已过期' } };
    return { status: 200, data: { user } };
}

// ============ 使用记录 ============
async function handleUsage(req, body) {
    const user = verifyToken(req);
    if (!user) return { status: 401, data: { error: '未登录' } };

    const { action_type, subject, detail } = body || {};
    if (!action_type) return { status: 400, data: { error: 'Missing action_type' } };

    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('usage_logs').insert({ user_id: user.userId, action_type, subject: subject || null, detail: detail || null });
        if (error) throw error;
        return { status: 201, data: { ok: true } };
    } catch (e) {
        console.error('Usage log error:', e);
        return { status: 500, data: { error: '记录失败' } };
    }
}

// ============ 管理员 - 用户列表 ============
async function handleAdminUsers(req) {
    const user = verifyToken(req);
    if (!user || !user.isAdmin) return { status: 403, data: { error: '无权限访问' } };

    try {
        const supabase = getSupabase();
        const { data: users, error } = await supabase.from('users').select('id, nickname, phone, is_admin, created_at, last_login_at').order('created_at', { ascending: false });
        if (error) throw error;

        const { data: usageCounts } = await supabase.from('usage_logs').select('user_id');

        const countMap = {};
        (usageCounts || []).forEach(r => { countMap[r.user_id] = (countMap[r.user_id] || 0) + 1; });

        const masked = (users || []).map(u => ({
            ...u,
            phone: u.phone.slice(0, 3) + '****' + u.phone.slice(-4),
            usage_count: countMap[u.id] || 0
        }));
        return { status: 200, data: { users: masked } };
    } catch (e) {
        console.error('Admin users error:', e);
        return { status: 500, data: { error: '查询失败' } };
    }
}

// ============ 管理员 - 统计数据 ============
async function handleAdminStats(req) {
    const user = verifyToken(req);
    if (!user || !user.isAdmin) return { status: 403, data: { error: '无权限访问' } };

    try {
        const supabase = getSupabase();
        const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
        const { count: totalUsage } = await supabase.from('usage_logs').select('*', { count: 'exact', head: true });

        const today = new Date().toISOString().split('T')[0];
        const { count: todayUsage } = await supabase.from('usage_logs').select('*', { count: 'exact', head: true }).gte('created_at', today);
        const { data: todayActiveData } = await supabase.from('usage_logs').select('user_id').gte('created_at', today);
        const todayActive = new Set((todayActiveData || []).map(r => r.user_id)).size;

        const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
        const { data: dailyData } = await supabase.from('usage_logs').select('created_at').gte('created_at', sevenDaysAgo);

        const dailyMap = {};
        (dailyData || []).forEach(r => {
            const date = r.created_at.split('T')[0];
            dailyMap[date] = (dailyMap[date] || 0) + 1;
        });
        const dailyStats = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            dailyStats.push({ date: d, count: dailyMap[d] || 0 });
        }

        return { status: 200, data: { totalUsers: totalUsers || 0, totalUsage: totalUsage || 0, todayUsage: todayUsage || 0, todayActive, dailyStats } };
    } catch (e) {
        console.error('Admin stats error:', e);
        return { status: 500, data: { error: '查询失败' } };
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
                case '/api/auth/register':
                    result = await handleAuthRegister(parsed);
                    break;
                case '/api/auth/login':
                    result = await handleAuthLogin(parsed);
                    break;
                case '/api/auth/me':
                    result = handleAuthMe(req);
                    break;
                case '/api/usage':
                    result = await handleUsage(req, parsed);
                    break;
                case '/api/admin/users':
                    result = await handleAdminUsers(req);
                    break;
                case '/api/admin/stats':
                    result = await handleAdminStats(req);
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
    console.log(`  POST /api/image_generation  - 图片生成 (Z-Image-Turbo)`);
    console.log(`  GET  /api/xunfei/auth-ise    - 讯飞 ISE 鉴权`);
    console.log(`  GET  /api/xunfei/auth-iat    - 讯飞 IAT 鉴权`);
    console.log(`  POST /api/auth/register     - 用户注册`);
    console.log(`  POST /api/auth/login        - 用户登录`);
    console.log(`  GET  /api/auth/me           - 获取当前用户`);
    console.log(`  POST /api/usage             - 使用记录`);
    console.log(`  GET  /api/admin/users       - 管理员-用户列表`);
    console.log(`  GET  /api/admin/stats       - 管理员-统计数据`);
    console.log(`  GET  /api/health             - 健康检查\n`);
});
