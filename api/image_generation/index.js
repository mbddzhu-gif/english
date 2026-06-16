const https = require('https');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const MS_API_KEY = 'ms-f76bd564-e3d6-4215-8e8c-13a3366c1733';
const MS_API_HOST = 'https://api-inference.modelscope.cn';
const MS_MODEL = 'Tongyi-MAI/Z-Image-Turbo';

function httpsRequest(host, endpoint, body, apiKey, timeout = 30000, extraHeaders = {}) {
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

function httpsGet(host, endpoint, apiKey, timeout = 15000, extraHeaders = {}) {
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

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, size, task_id } = req.body || {};

    // 模式2: 查询任务结果
    if (task_id) {
        try {
            const pollResult = await httpsGet(
                MS_API_HOST, `/v1/tasks/${task_id}`, MS_API_KEY, 15000,
                { 'X-ModelScope-Task-Type': 'image_generation' }
            );

            const taskStatus = pollResult.data?.task_status;
            console.log(`[ImageGen] Poll task ${task_id}: status=${taskStatus}`);

            if (taskStatus === 'SUCCEED') {
                const imageUrl = pollResult.data?.output_images?.[0];
                if (imageUrl) {
                    return res.status(200).json({ status: 'succeeded', url: imageUrl, model: MS_MODEL });
                }
                return res.status(200).json({ status: 'succeeded', error: '未返回图片URL' });
            }

            if (taskStatus === 'FAILED') {
                const errorMsg = pollResult.data?.errors?.message || pollResult.data?.message || '未知错误';
                return res.status(200).json({ status: 'failed', error: errorMsg });
            }

            return res.status(200).json({ status: taskStatus || 'running' });
        } catch (e) {
            console.error(`[ImageGen] Poll error: ${e.message}`);
            return res.status(200).json({ status: 'error', error: e.message });
        }
    }

    // 模式1: 提交生成任务
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const imageSize = size || '1024x768';
    console.log(`[ImageGen] Submit - Prompt: ${prompt.substring(0, 100)}, Size: ${imageSize}`);

    const imageBody = {
        model: MS_MODEL,
        prompt: prompt,
        size: imageSize,
        steps: 8,
        guidance: 1.5
    };

    try {
        const submitResult = await httpsRequest(
            MS_API_HOST, '/v1/images/generations', imageBody, MS_API_KEY, 30000,
            { 'X-ModelScope-Async-Mode': 'true' }
        );

        console.log(`[ImageGen] Submit response: status=${submitResult.status}, body=${JSON.stringify(submitResult.data).substring(0, 300)}`);

        if (submitResult.status >= 400) {
            const errMsg = submitResult.data?.error?.message || submitResult.data?.message || JSON.stringify(submitResult.data);
            // 检查是否是配额用完
            if (errMsg.includes('quota') || errMsg.includes('exceeded')) {
                return res.status(200).json({ status: 'failed', error: '今日图片生成配额已用完，请明天再试' });
            }
            return res.status(502).json({ error: `API错误(${submitResult.status}): ${errMsg}` });
        }

        const taskId = submitResult.data?.task_id;
        if (!taskId) {
            const errorMsg = submitResult.data?.error?.message || submitResult.data?.error || submitResult.data?.message || JSON.stringify(submitResult.data);
            // 检查是否是配额用完
            if (errorMsg.includes('quota') || errorMsg.includes('exceeded')) {
                return res.status(200).json({ status: 'failed', error: '今日图片生成配额已用完，请明天再试' });
            }
            return res.status(502).json({ error: `提交失败: ${errorMsg}` });
        }

        // 检查是否已经直接返回了结果
        if (submitResult.data?.task_status === 'SUCCEED') {
            const pollResult = await httpsGet(
                MS_API_HOST, `/v1/tasks/${taskId}`, MS_API_KEY, 15000,
                { 'X-ModelScope-Task-Type': 'image_generation' }
            );
            if (pollResult.data?.task_status === 'SUCCEED' && pollResult.data?.output_images?.[0]) {
                return res.status(200).json({ status: 'succeeded', url: pollResult.data.output_images[0], model: MS_MODEL, task_id: taskId });
            }
        }

        // 返回task_id，让前端轮询
        return res.status(200).json({ status: 'submitted', task_id: taskId });
    } catch (e) {
        console.error(`[ImageGen] Submit error: ${e.message}\n${e.stack}`);
        return res.status(502).json({ error: `网络错误: ${e.message}` });
    }
};
