class SceneManager {
    constructor(api) {
        this.api = api;
        this.currentDialogue = null;
        this.sceneImageUrl = null;
        this.dialogueHistory = [];
        this.currentTurnIndex = 0;
        this.isAppTurn = true;
        this.subject = '';
        this.category = '';
        this.errorStats = {
            totalUtterances: 0,
            totalErrors: 0,
            errorTypes: {
                tense: 0,
                subject_verb: 0,
                article: 0,
                preposition: 0,
                word_order: 0,
                plural: 0,
                pronunciation: 0,
                other: 0
            },
            scores: [],
            recentErrors: []
        };
    }

    async generateScene(subject, category) {
        this.subject = subject;
        this.category = category;
        const imageUrl = await this.api.generateSceneImage(subject, category);
        this.sceneImageUrl = imageUrl;
        return imageUrl;
    }

    async generateDialogue(subject, category) {
        this.subject = subject;
        this.category = category;
        const result = await this.api.generateDialogue(subject, category);
        this.currentDialogue = result;
        this.dialogueHistory = [];
        this.currentTurnIndex = 0;
        this.isAppTurn = true;
        return result;
    }

    renderDialogue(container) {
        if (!container || !this.currentDialogue) return;
        container.innerHTML = '';

        const dialogue = this.currentDialogue.dialogue;
        dialogue.forEach((item, index) => {
            const bubble = this._createDialogueBubble(item, index);
            container.appendChild(bubble);
        });
    }

    _createDialogueBubble(item, index, evaluation) {
        const bubble = document.createElement('div');
        bubble.className = `dialogue-bubble ${item.speaker === 'A' ? 'left' : 'right'}`;
        bubble.dataset.index = index;

        let evalHtml = '';
        if (evaluation && item.speaker !== 'A') {
            const scoreClass = evaluation.score >= 4 ? 'score-good' : evaluation.score >= 3 ? 'score-ok' : 'score-poor';
            const scoreStars = '★'.repeat(evaluation.score) + '☆'.repeat(5 - evaluation.score);

            let correctionsHtml = '';
            if (evaluation.corrections && evaluation.corrections.length > 0) {
                correctionsHtml = evaluation.corrections.map(c => `
                    <div class="correction-item">
                        <span class="correction-original">${c.original}</span>
                        <span class="correction-arrow">→</span>
                        <span class="correction-corrected">${c.corrected}</span>
                        <span class="correction-reason">${c.reason}</span>
                    </div>
                `).join('');
            }

            const translationHtml = evaluation.translation
                ? `<div class="eval-translation">📝 ${evaluation.translation}</div>` : '';

            evalHtml = `
                <div class="dialogue-evaluation ${scoreClass}">
                    <div class="eval-score">${scoreStars}</div>
                    ${translationHtml}
                    ${correctionsHtml ? `<div class="eval-corrections">${correctionsHtml}</div>` : ''}
                    ${evaluation.suggestion ? `<div class="eval-suggestion">💡 ${evaluation.suggestion}</div>` : ''}
                </div>
            `;
        }

        bubble.innerHTML = `
            <div class="dialogue-speaker">${item.speaker === 'A' ? '👤 对方' : '🎯 我'}</div>
            <div class="dialogue-english">
                ${item.english}
                <button class="btn-play-bubble" data-text="${item.english}" title="播放此句">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
            </div>
            ${item.chinese ? `<div class="dialogue-chinese">${item.chinese}</div>` : ''}
            ${evalHtml}
        `;
        return bubble;
    }

    getInitialDialogueLines() {
        if (!this.currentDialogue || !this.currentDialogue.dialogue) return [];
        return this.currentDialogue.dialogue;
    }

    addDialogueLine(speaker, english, chinese, evaluation) {
        const item = { speaker, english, chinese };
        this.dialogueHistory.push(item);

        const container = document.getElementById('dialogue-list');
        if (container) {
            const bubble = this._createDialogueBubble(item, this.dialogueHistory.length, evaluation);
            container.appendChild(bubble);
            container.scrollTop = container.scrollHeight;
        }
        return item;
    }

    async evaluateUserSpeech(userText, conversationContext) {
        if (!userText || userText.trim().length === 0) {
            return { score: 5, corrections: [], suggestion: '', translation: '', errorTypes: [] };
        }

        const contextSnippet = conversationContext
            ? `\n\n对话上下文：\n${conversationContext.split('\n').slice(-6).join('\n')}`
            : '';

        const messages = [
            {
                role: 'system',
                content: `你是一位专业的英语口语评测专家，专门为英语学习者评估口语表达。请在对话语境中评估用户的英语口语。

评分标准（严格执行）：
- 5分：语法正确、自然、符合语境。包括简短回应如"Where?"、"Oh, how cute!"、"Yes, I do!"——这些在对话中是完整且正确的表达。感叹句、简短回答和省略句不算错误。
- 4分：有轻微的不规范用法，但仍自然可理解（如用词稍有生硬）
- 3分：有明显的语法错误，影响理解（如时态错误、主谓不一致）
- 2分：有多个语法错误，较难理解
- 1分：错误严重，很难理解

关键规则：
1. 简短的对话回应（如"Where?"、"Oh, how cute!"、"Really?"、"Me too!"）在对话语境中是完整的句子，不要将其标记为不完整或扣分。
2. 感叹句（如"How cute!"、"What a beautiful day!"）是语法正确的结构，不要标记为错误。
3. 省略句（根据上下文省略主语/动词）是标准英语用法，不要标记为错误。
4. 只标记真正的语法错误：时态错误、主谓不一致、冠词使用错误、介词使用错误、语序错误、复数形式错误。
5. 口语表达（gonna、wanna、gotta、yeah、yup）在口语中是可以接受的。
6. 如果用户的表达语法正确且符合语境，务必给5分且纠正列表为空。
7. 必须提供用户输入的中文翻译。

重要：只返回有效的JSON，不要添加任何其他文字或markdown代码块标记。
格式：
{
  "score": 5,
  "corrections": [],
  "suggestion": "太棒了！你的表达自然流畅，非常地道！",
  "translation": "哪里？哦，好可爱！",
  "errorTypes": []
}

当存在错误时：
{
  "score": 3,
  "corrections": [
    {"original": "I goes to school", "corrected": "I go to school", "reason": "主谓不一致：I后面动词用原形", "type": "subject_verb"}
  ],
  "suggestion": "注意第一人称I后面动词不需要加s",
  "translation": "我去上学",
  "errorTypes": ["subject_verb"]
}

错误类型：tense（时态错误）、subject_verb（主谓不一致）、article（冠词使用）、preposition（介词使用）、word_order（语序错误）、plural（复数形式）、pronunciation（发音问题）、other（其他错误）

所有纠正原因（reason）和改进建议（suggestion）必须用中文书写。`
            },
            {
                role: 'user',
                content: `请在对话语境中评估以下英语口语表达："${userText}"${contextSnippet}`
            }
        ];

        try {
            const responseText = await this.api.chatCompletion(messages, {
                temperature: 0.2,
                maxTokens: 500
            });

            const parsed = Utils.repairJSON(responseText);
            if (parsed && typeof parsed.score === 'number') {
                if (!parsed.translation) parsed.translation = '';
                if (!parsed.corrections) parsed.corrections = [];
                if (!parsed.errorTypes) parsed.errorTypes = [];
                if (!parsed.suggestion) parsed.suggestion = '';
                this._recordEvaluation(parsed);
                return parsed;
            }
            return { score: 5, corrections: [], suggestion: '', translation: '', errorTypes: [] };
        } catch (error) {
            console.error('[Scene] evaluateUserSpeech failed:', error);
            return { score: 5, corrections: [], suggestion: '', translation: '', errorTypes: [] };
        }
    }

    _recordEvaluation(evaluation) {
        this.errorStats.totalUtterances++;
        this.errorStats.scores.push(evaluation.score);

        if (evaluation.corrections && evaluation.corrections.length > 0) {
            this.errorStats.totalErrors += evaluation.corrections.length;

            evaluation.corrections.forEach(c => {
                const type = c.type || 'other';
                if (this.errorStats.errorTypes[type] !== undefined) {
                    this.errorStats.errorTypes[type]++;
                } else {
                    this.errorStats.errorTypes.other++;
                }

                this.errorStats.recentErrors.push({
                    original: c.original,
                    corrected: c.corrected,
                    reason: c.reason,
                    type: type,
                    timestamp: Date.now()
                });
            });

            if (this.errorStats.recentErrors.length > 50) {
                this.errorStats.recentErrors = this.errorStats.recentErrors.slice(-50);
            }
        }
    }

    getErrorReport() {
        const stats = this.errorStats;
        if (stats.totalUtterances === 0) {
            return { summary: '暂无评测数据', details: null };
        }

        const avgScore = (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1);
        const sortedTypes = Object.entries(stats.errorTypes)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

        const typeNames = {
            tense: '时态错误',
            subject_verb: '主谓不一致',
            article: '冠词使用',
            preposition: '介词使用',
            word_order: '语序错误',
            plural: '复数形式',
            pronunciation: '发音问题',
            other: '其他错误'
        };

        const weakAreas = sortedTypes.map(([type, count]) => ({
            type: typeNames[type] || type,
            count: count,
            percentage: Math.round(count / stats.totalErrors * 100)
        }));

        let level = '初级';
        if (avgScore >= 4.5) level = '优秀';
        else if (avgScore >= 4) level = '良好';
        else if (avgScore >= 3) level = '中级';
        else if (avgScore >= 2) level = '基础';

        const recentMistakes = stats.recentErrors.slice(-5).map(e => ({
            original: e.original,
            corrected: e.corrected,
            reason: e.reason
        }));

        return {
            summary: `已评测${stats.totalUtterances}次，平均${avgScore}分（${level}），共${stats.totalErrors}个错误`,
            averageScore: parseFloat(avgScore),
            level: level,
            totalUtterances: stats.totalUtterances,
            totalErrors: stats.totalErrors,
            weakAreas: weakAreas,
            recentMistakes: recentMistakes
        };
    }

    async generateAppResponse(userMessage, conversationContext) {
        const messages = [
            {
                role: 'system',
                content: `你是一个英语教学助手，正在和用户进行场景对话练习。主题是"${this.subject}"。

规则：
1. 你扮演对话中的角色，根据用户说的话自然地回应
2. 回应要简短（不超过10个英文单词），使用简单英语
3. 保持对话连贯，引导对话围绕主题"${this.subject}"展开
4. 如果用户说的英语有语法错误，在回应中自然地使用正确的表达方式（不要直接纠正）
5. 每次只说一句话

重要：只返回纯JSON，不要添加任何其他文字或markdown代码块标记。
返回格式：
{"english":"你的英文回应","chinese":"中文翻译"}`
            },
            {
                role: 'user',
                content: conversationContext + `\n\n用户刚才说：${userMessage}\n\n请用英语回应，保持对话自然流畅。`
            }
        ];

        const responseText = await this.api.chatCompletion(messages, {
            temperature: 0.7,
            maxTokens: 200
        });

        const parsed = Utils.repairJSON(responseText);
        if (parsed && parsed.english) {
            return parsed;
        }
        return { english: 'That sounds great! Tell me more.', chinese: '听起来不错！告诉我更多。' };
    }

    buildConversationContext() {
        const lines = [];
        if (this.currentDialogue && this.currentDialogue.dialogue) {
            this.currentDialogue.dialogue.forEach(d => {
                lines.push(`${d.speaker === 'A' ? 'Person A' : 'Person B'}: ${d.english}`);
            });
        }
        this.dialogueHistory.forEach(d => {
            const speaker = d.speaker === 'A' ? 'Person A' : d.speaker === 'B' ? 'Person B' : 'You';
            lines.push(`${speaker}: ${d.english}`);
        });
        return lines.join('\n');
    }

    resetDialogueState() {
        this.dialogueHistory = [];
        this.currentTurnIndex = 0;
        this.isAppTurn = true;
    }

    resetErrorStats() {
        this.errorStats = {
            totalUtterances: 0,
            totalErrors: 0,
            errorTypes: {
                tense: 0,
                subject_verb: 0,
                article: 0,
                preposition: 0,
                word_order: 0,
                plural: 0,
                pronunciation: 0,
                other: 0
            },
            scores: [],
            recentErrors: []
        };
    }
}

window.SceneManager = SceneManager;
