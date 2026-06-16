const { CORS_HEADERS, MS_API_KEY, MS_API_HOST, MS_MODEL, httpsRequest, httpsGet } = require('../_lib');

module.exports = async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { prompt, size } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const imageSize = size || '1024x768';
    console.log(`[ImageGen] Start - Prompt: ${prompt.substring(0, 100)}, Size: ${imageSize}`);

    const imageBody = {
        model: MS_MODEL,
        prompt: prompt,
        size: imageSize,
        steps: 8,
        guidance: 0
    };

    const maxRetries = 2;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // 步骤1: 提交异步任务
            console.log(`[ImageGen] Submit attempt ${attempt + 1}/${maxRetries}`);
            let submitResult;
            try {
                submitResult = await httpsRequest(
                    MS_API_HOST, '/v1/images/generations', imageBody, MS_API_KEY, 30000,
                    { 'X-ModelScope-Async-Mode': 'true' }
                );
            } catch (submitErr) {
                console.error(`[ImageGen] Submit network error: ${submitErr.message}`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                return res.status(502).json({ error: `图片生成服务网络错误: ${submitErr.message}` });
            }

            console.log(`[ImageGen] Submit response: status=${submitResult.status}, body=${JSON.stringify(submitResult.data).substring(0, 300)}`);

            if (submitResult.status >= 400) {
                const errMsg = submitResult.data?.error?.message || submitResult.data?.message || JSON.stringify(submitResult.data);
                console.error(`[ImageGen] Submit API error: HTTP ${submitResult.status} - ${errMsg}`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return res.status(502).json({ error: `图片生成API错误(${submitResult.status}): ${errMsg}` });
            }

            const taskId = submitResult.data?.task_id;
            if (!taskId) {
                const errorMsg = submitResult.data?.error?.message || submitResult.data?.error || submitResult.data?.message || JSON.stringify(submitResult.data);
                console.error(`[ImageGen] No task_id in response: ${errorMsg}`);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    continue;
                }
                return res.status(502).json({ error: `图片生成提交失败: ${errorMsg}` });
            }

            console.log(`[ImageGen] Task submitted: ${taskId}`);

            // 步骤2: 轮询任务结果（缩短间隔，加快响应）
            const pollTimeout = 50000; // 50秒轮询超时，留10秒给函数本身
            const pollInterval = 3000; // 3秒轮询一次
            const startTime = Date.now();
            let pollCount = 0;

            while (Date.now() - startTime < pollTimeout) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                pollCount++;

                let pollResult;
                try {
                    pollResult = await httpsGet(
                        MS_API_HOST, `/v1/tasks/${taskId}`, MS_API_KEY, 15000,
                        { 'X-ModelScope-Task-Type': 'image_generation' }
                    );
                } catch (pollErr) {
                    console.error(`[ImageGen] Poll #${pollCount} network error: ${pollErr.message}`);
                    continue; // 轮询网络错误，继续重试
                }

                const taskStatus = pollResult.data?.task_status;
                console.log(`[ImageGen] Poll #${pollCount}: status=${taskStatus}, elapsed=${Date.now() - startTime}ms`);

                if (taskStatus === 'SUCCEED') {
                    const imageUrl = pollResult.data?.output_images?.[0];
                    if (imageUrl) {
                        console.log(`[ImageGen] Success! URL: ${imageUrl.substring(0, 100)}...`);
                        return res.status(200).json({ url: imageUrl, model: MS_MODEL });
                    }
                    console.error('[ImageGen] SUCCEED but no output_images:', JSON.stringify(pollResult.data).substring(0, 300));
                    return res.status(502).json({ error: '图片生成成功但未返回图片URL' });
                }

                if (taskStatus === 'FAILED') {
                    const errorMsg = pollResult.data?.errors?.message || pollResult.data?.message || JSON.stringify(pollResult.data);
                    console.error(`[ImageGen] Task FAILED: ${errorMsg}`);
                    if (attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        break; // 跳出轮询，进入下一次重试
                    }
                    return res.status(502).json({ error: `图片生成失败: ${errorMsg}` });
                }
            }

            // 轮询超时
            console.error(`[ImageGen] Poll timeout after ${pollCount} polls, ${Date.now() - startTime}ms`);
            if (attempt < maxRetries - 1) {
                continue;
            }
            return res.status(504).json({ error: '图片生成超时，请稍后重试', retryable: true });
        } catch (e) {
            console.error(`[ImageGen] Exception attempt ${attempt + 1}: ${e.message}\n${e.stack}`);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            return res.status(500).json({ error: `图片生成服务异常: ${e.message}` });
        }
    }

    return res.status(500).json({ error: '图片生成失败，所有重试已耗尽' });
};
