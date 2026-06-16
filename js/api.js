class API {
    constructor() {
        const config = window.APP_CONFIG || {};
        this.proxyUrl = config.proxyUrl || '';
    }

    isConfigured() { return true; }

    _extractError(err) {
        if (typeof err === 'string') return err;
        if (err instanceof Error) return err.message;
        if (typeof err === 'object') {
            if (err.message) return err.message;
            if (err.error) return typeof err.error === 'string' ? err.error : JSON.stringify(err.error);
            try { return JSON.stringify(err); } catch(e) { return '未知错误'; }
        }
        return String(err);
    }

    async chatCompletion(messages, options = {}) {
        const body = {
            messages: messages,
            stream: false,
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.95
        };
        if (options.maxTokens) body.max_completion_tokens = options.maxTokens;

        let response;
        try {
            response = await fetch(`${this.proxyUrl}/api/chatcompletion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.authManager.getAuthHeaders() },
                body: JSON.stringify(body)
            });
        } catch (fetchError) {
            throw new Error('无法连接到服务器，请确保server.js正在运行');
        }

        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error('API返回数据格式异常，请重试');
        }

        if (data.error) {
            throw new Error(this._extractError(data.error));
        }

        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            const content = data.choices[0].message.content;
            if (content && content.trim()) return content;
        }
        throw new Error('API未返回有效内容，请重试');
    }

    async identifyObject(imageBase64, retryCount = 0) {
        const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

        const prompt = `请识别这张图片中的主体物体，返回其英文名称、中文翻译、音标和分类。

重要：只返回纯JSON，不要添加任何其他文字或markdown代码块标记。

返回格式：
{"english":"主体物体的英文单词","chinese":"中文名称","phonetic":"英式音标","category":"分类","description":"简短英文描述"}

分类可选值：animal、food、plant、vehicle、furniture、clothing、electronics、nature、body、school、home、other

要求：
1. english必须是常见的基础英语单词，适合英语学习者
2. 如果图片中有多个物体，选择最显著、最居中的主体
3. phonetic使用国际音标格式
4. description用3-5个英文单词简短描述`;

        let response;
        try {
            response = await fetch(`${this.proxyUrl}/api/understand_image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.authManager.getAuthHeaders() },
                body: JSON.stringify({ image_base64: imageUrl, prompt: prompt })
            });
        } catch (fetchError) {
            throw new Error('无法连接到服务器，请确保server.js正在运行');
        }

        if (response.status === 503 && retryCount < 3) {
            const waitTime = 3000 * (retryCount + 1);
            console.log(`[API] Image understanding 503, retry ${retryCount + 1}/3 after ${waitTime}ms`);
            await Utils.sleep(waitTime);
            return this.identifyObject(imageBase64, retryCount + 1);
        }

        if (response.status === 503) {
            throw new Error('图片识别服务繁忙，请稍后重试');
        }

        if (!response.ok) {
            throw new Error(`图片识别请求失败(${response.status})`);
        }

        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error('图片理解返回数据格式异常');
        }

        if (data.error) {
            throw new Error(this._extractError(data.error));
        }

        if (data.result) {
            let resultText = data.result;
            if (typeof resultText === 'object') {
                resultText = resultText.content || JSON.stringify(resultText);
            }
            const parsed = Utils.repairJSON(resultText);
            if (parsed && parsed.english && parsed.chinese) {
                return parsed;
            }
        }

        throw new Error('图片识别结果解析失败，请重试');
    }

    async generatePhrases(word, category, description) {
        const messages = [
            {
                role: 'system',
                content: `你是一个英语教学助手。根据给定的英语单词，生成3个实用英语短语。

重要：只返回纯JSON，不要添加任何其他文字或markdown代码块标记。

返回格式：
{"phrases":[{"english":"英语短语","chinese":"中文翻译","phonetic":"短语音标"},{"english":"英语短语","chinese":"中文翻译","phonetic":"短语音标"},{"english":"英语短语","chinese":"中文翻译","phonetic":"短语音标"}]}

要求：
1. 短语必须包含给定的单词
2. 短语长度3-8个词，适合英语初学者
3. 短语要实用、日常、贴近生活
4. 使用简单时态（一般现在时、现在进行时）
5. 难度递增：第一个最简单，第三个稍难`
            },
            {
                role: 'user',
                content: `单词：${word}\n分类：${category}\n描述：${description || ''}\n\n请生成3个包含该单词的实用英语短语。`
            }
        ];

        const responseText = await this.chatCompletion(messages, {
            temperature: 0.7,
            maxTokens: 800
        });

        const parsed = Utils.repairJSON(responseText);
        if (parsed && parsed.phrases && Array.isArray(parsed.phrases) && parsed.phrases.length > 0) {
            return parsed.phrases;
        }
        throw new Error('短语生成结果解析失败，请重试');
    }

    async evaluatePronunciation(referenceText, userText, duration) {
        const messages = [
            {
                role: 'system',
                content: `你是一个英语发音评估专家。根据参考文本和用户语音识别结果，评估用户的发音质量。

重要：只返回纯JSON，不要添加任何其他文字或markdown代码块标记。

返回格式：
{"accuracy":85,"fluency":70,"tone":75,"overall":78,"feedback":"鼓励性反馈","suggestions":["建议1","建议2"],"word_analysis":[{"word":"参考词","status":"correct|wrong|missed","user_word":"用户说的词"}]}

评分标准：
- accuracy(0-100)：发音准确度，基于识别文本与参考文本的匹配程度
- fluency(0-100)：流利度，基于语速和停顿
- tone(0-100)：语调评分，基于句子节奏感
- overall(0-100)：综合评分 = accuracy*0.4 + fluency*0.3 + tone*0.3

要求：
1. feedback要鼓励为主，简短温暖
2. suggestions给1-2个具体改进建议
3. word_analysis逐词分析，标记正确/错误/遗漏`
            },
            {
                role: 'user',
                content: `参考短语：${referenceText}\n用户识别文本：${userText}\n录音时长：${duration}秒\n词数：${referenceText.split(/\s+/).length}\n\n请评估发音质量。`
            }
        ];

        const responseText = await this.chatCompletion(messages, {
            temperature: 0.3,
            maxTokens: 800
        });

        const parsed = Utils.repairJSON(responseText);
        if (parsed && typeof parsed.accuracy === 'number') {
            return parsed;
        }
        throw new Error('评分结果解析失败，请重试');
    }

    async generateDialogue(subject, category, sceneDescription) {
        const messages = [
            {
                role: 'system',
                content: `你是一个英语教学助手。根据给定的主题和场景，生成一段简单的英语对话。

重要：只返回纯JSON，不要添加任何其他文字或markdown代码块标记。

返回格式：
{"dialogue":[{"speaker":"A","english":"Hello!","chinese":"你好！"},{"speaker":"B","english":"Hi!","chinese":"嗨！"}],"practice_prompt":"Now it's your turn! Try to answer: ___","practice_answer":"参考答案"}

要求：
1. 生成3-4轮对话（6-8条消息）
2. 对话必须涉及给定的主题单词
3. 两个说话人A和B，场景自然
4. 使用简单英语，适合初学者
5. 每句英文不超过10个词
6. practice_prompt是给用户的练习提示，留出空白让用户回答
7. practice_answer是参考答案`
            },
            {
                role: 'user',
                content: `主题单词：${subject}\n分类：${category}\n场景描述：${sceneDescription || `A scene involving ${subject}`}\n\n请生成一段包含该单词的简单英语对话。`
            }
        ];

        const responseText = await this.chatCompletion(messages, {
            temperature: 0.7,
            maxTokens: 1200
        });

        const parsed = Utils.repairJSON(responseText);
        if (parsed && parsed.dialogue && Array.isArray(parsed.dialogue)) {
            return parsed;
        }
        throw new Error('对话生成结果解析失败，请重试');
    }

    async generateSceneResponse(subject, dialogueHistory, userAnswer) {
        const historyText = dialogueHistory.map(d => `${d.speaker}: "${d.text}"`).join('\n');

        const messages = [
            {
                role: 'system',
                content: `You are having a natural English conversation about ${subject}. Continue the dialogue naturally based on the user's response. Keep responses short (1-2 sentences). Use simple English suitable for beginners.`
            },
            {
                role: 'user',
                content: `Conversation so far:\n${historyText}\n\nUser just said: "${userAnswer}"\n\nPlease respond as the other person in a natural, conversational way.`
            }
        ];

        try {
            const response = await this.chatCompletion(messages, {
                temperature: 0.8,
                maxTokens: 100
            });
            return response;
        } catch (e) {
            throw new Error('生成回应失败，请重试');
        }
    }
}

window.MinimaxAPI = API;
