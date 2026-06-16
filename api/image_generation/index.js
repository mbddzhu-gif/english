const { CORS_HEADERS, MS_API_KEY, MS_API_HOST, MS_MODEL, httpsRequest, httpsGet } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, size } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const imageBody = {
        model: MS_MODEL,
        prompt: prompt,
        size: size || '1024x768',
        steps: 8,
        guidance: 0
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
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                    continue;
                }
                return res.status(500).json({ error: `图片生成提交失败: ${errorMsg}` });
            }

            // 步骤2: 轮询任务结果
            const pollTimeout = 120000;
            const pollInterval = 4000;
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
                        return res.status(200).json({ url: imageUrl, model: MS_MODEL });
                    }
                    return res.status(500).json({ error: '图片生成成功但未返回图片URL' });
                }

                if (taskStatus === 'FAILED') {
                    const errorMsg = (pollResult.data.errors && pollResult.data.errors.message) || '未知错误';
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                        break;
                    }
                    return res.status(500).json({ error: `图片生成失败: ${errorMsg}` });
                }
            }

            // 轮询超时
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return res.status(504).json({ error: '图片生成超时，请稍后重试' });
        } catch (e) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
                continue;
            }
            return res.status(503).json({ error: '图片生成服务暂时不可用', retryable: true });
        }
    }
};
