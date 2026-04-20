class App {
    constructor() {
        this.api = new MinimaxAPI();
        this.inputManager = new InputManager();
        this.speech = new SpeechManager(this.api);
        this.sceneManager = new SceneManager(this.api);
        this.xunfei = null;
        this._xunfeiInitPromise = null;
        this._loadingTipPicker = (window.LoadingTips && typeof window.LoadingTips.createPicker === 'function') ? window.LoadingTips.createPicker() : null;
        this._loadingSlowTimer = null;
        this.historyManager = new HistoryManager();
        this.inputManager.init();
        this.inputManager.onImageReady = (base64) => this._handleImageSelected(base64);
        this._setupViewportSizing();
        this._isRecording = false;
        this._recording = null;
        this._wavBlob = null;
        this._audioUrl = null;
        this._pcmData = null;
        this._sceneRecording = false;
        this._sceneMediaStream = null;
        this._sceneAudioCtx = null;
        this._sceneProcessor = null;
        this._scenePcmBuffers = [];
        this._sceneIatFinalText = '';
        this._sceneIatConnected = false;
        this._sceneRecordTimer = null;
        this._currentStep = 1;
        this._currentObject = '';
        this._currentPhrase = '';
        this._currentPhrases = [];
        this._currentImageUrl = '';
        this._currentDialogue = [];
        this._dialogueIndex = 0;
        this._sceneActive = false;
        this._initEventListeners();
    }

    _setupViewportSizing() {
        const update = () => this._updateViewportSizing();
        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', update);
            window.visualViewport.addEventListener('scroll', update);
        }
        setTimeout(update, 0);
        setTimeout(update, 200);
    }

    _updateViewportSizing() {
        const root = document.documentElement;
        const vv = window.visualViewport;
        const height = vv ? vv.height : window.innerHeight;
        root.style.setProperty('--app-height', `${Math.round(height)}px`);

        const header = document.getElementById('app-header');
        const stepIndicator = document.getElementById('step-indicator');
        const footer = document.getElementById('app-footer');
        const headerH = header && !header.classList.contains('hidden') ? header.offsetHeight : 0;
        const stepH = stepIndicator && !stepIndicator.classList.contains('hidden') ? stepIndicator.offsetHeight : 0;
        const footerH = footer ? footer.offsetHeight : 0;
        root.style.setProperty('--header-h', `${headerH}px`);
        root.style.setProperty('--step-h', `${stepH}px`);
        root.style.setProperty('--footer-h', `${footerH}px`);
    }

    _logCameraButtonVisibility() {
        const btn = document.getElementById('btn-capture');
        if (!btn) return;
        const vv = window.visualViewport;
        const vh = vv ? vv.height : window.innerHeight;
        const rect = btn.getBoundingClientRect();
        const overflow = Math.max(0, rect.bottom - vh);
        const ratio = rect.height > 0 ? overflow / rect.height : 0;
        console.log('[CameraLayout] viewportHeight=', Math.round(vh), 'btnBottom=', Math.round(rect.bottom), 'overflowPx=', Math.round(overflow), 'overflowRatio=', ratio.toFixed(2));
    }

    async _ensureXunfei() {
        if (this.xunfei) return this.xunfei;
        if (!this._xunfeiInitPromise) {
            this._xunfeiInitPromise = (async () => {
                if (!window.XunfeiSpeech) {
                    await Utils.loadScript('js/xunfei.js');
                }
                this.xunfei = new window.XunfeiSpeech();
                return this.xunfei;
            })();
        }
        return this._xunfeiInitPromise;
    }

    _initEventListeners() {
        const el = (id) => document.getElementById(id);

        el('btn-upload').addEventListener('click', () => this.inputManager.selectImage());
        el('btn-camera').addEventListener('click', () => this._showCamera());
        const iconBtn = document.querySelector('.home-camera-icon');
        if (iconBtn) iconBtn.addEventListener('click', () => this._showCamera());
        el('btn-capture').addEventListener('click', () => this._capturePhoto());
        const btnRefresh = el('btn-refresh');
        if (btnRefresh) btnRefresh.addEventListener('click', () => window.location.reload());
        el('btn-start-practice').addEventListener('click', () => this._startPractice());
        el('btn-record').addEventListener('click', () => this._startRecording());
        el('btn-play-recording').addEventListener('click', () => this._playRecording());
        el('btn-retry').addEventListener('click', () => this._goHome());
        el('btn-retry-practice').addEventListener('click', () => this._retryPractice());
        el('btn-next-step').addEventListener('click', () => this._goToScene());
        el('btn-scene-send').addEventListener('click', () => this._sendSceneAnswer());
        el('btn-scene-mic').addEventListener('click', () => this._startSceneVoiceInput());
        el('btn-scene-rerecord').addEventListener('click', () => this._rerecordSceneVoice());
        el('btn-back').addEventListener('click', () => this._goBack());
        el('btn-home').addEventListener('click', () => this._goHome());
        el('btn-start-dialogue').addEventListener('click', () => this._startDialoguePractice());
        el('btn-play-word').addEventListener('click', () => this._playWord());
        el('btn-listen-phrase').addEventListener('click', () => this._listenPhrase());
        el('btn-restart').addEventListener('click', () => this._goHome());
        el('btn-history').addEventListener('click', () => this._showHistoryPage());
        el('btn-clear-history').addEventListener('click', () => this._clearAllHistory());

        document.getElementById('dialogue-list').addEventListener('click', (e) => {
            const playBtn = e.target.closest('.btn-play-bubble');
            if (playBtn) {
                const text = playBtn.dataset.text;
                if (text) this._playDialogueLine(text, playBtn);
            }
        });

        document.getElementById('history-list').addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.history-card-delete');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (id) {
                    this.historyManager.deleteRecord(id);
                    this._renderHistoryList();
                    Utils.showToast('已删除该记录', 'info');
                }
                return;
            }

            const card = e.target.closest('.history-card');
            if (card) {
                const detailEl = card.querySelector('.history-detail');
                if (detailEl) {
                    detailEl.classList.toggle('hidden');
                }
            }
        });

        el('scene-text-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendSceneAnswer();
            }
        });
    }

    async _handleImageSelected(base64) {
        this._showLoading('正在识别图片...');

        try {
            const result = await this.api.identifyObject(base64);
            if (!result || !result.english) {
                throw new Error('无法识别图片中的物体');
            }

            this._currentObject = result.english;
            document.getElementById('result-image').src = base64;
            document.getElementById('result-english').textContent = result.english;
            document.getElementById('result-phonetic').textContent = result.phonetic || '';
            document.getElementById('result-chinese').textContent = result.chinese || '';
            document.getElementById('result-category').textContent = result.category || '';

            const phrases = await this.api.generatePhrases(result.english, result.category, result.description);
            if (phrases && phrases.length > 0) {
                this._currentPhrase = phrases[0].english || phrases[0];
                this._currentPhrases = phrases;
                const phraseList = document.getElementById('phrase-list');
                if (phraseList) {
                    phraseList.innerHTML = '';
                    phrases.forEach((phrase, index) => {
                        const english = typeof phrase === 'string' ? phrase : phrase.english;
                        const chinese = typeof phrase === 'string' ? '' : (phrase.chinese || '');
                        const phonetic = typeof phrase === 'string' ? '' : (phrase.phonetic || '');

                        const div = document.createElement('div');
                        div.className = 'phrase-item';
                        div.innerHTML = `
                            <div class="phrase-number">${index + 1}</div>
                            <div class="phrase-text">
                                <div class="phrase-english">${english}</div>
                                ${chinese ? `<div class="phrase-translation">${chinese}</div>` : ''}
                                ${phonetic ? `<div class="phrase-phonetic">${phonetic}</div>` : ''}
                            </div>
                            <button class="phrase-play-btn" data-phrase-index="${index}" title="播放">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                        `;
                        phraseList.appendChild(div);
                    });

                    phraseList.querySelectorAll('.phrase-play-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const idx = parseInt(btn.dataset.phraseIndex);
                            this._playPhraseFromList(idx);
                        });
                    });
                }
            }

            this._showPage('result');
            this._updateStepIndicator(1);
        } catch (error) {
            Utils.logError('identifyObject', error);
            Utils.showToast('图片识别失败：' + error.message, 'error');
            this._showPage('home');
        }
    }

    _showCamera() {
        this._showPage('camera');
        this._updateViewportSizing();
        setTimeout(() => this._logCameraButtonVisibility(), 200);
        this.inputManager.startCamera();
    }

    async _capturePhoto() {
        const base64 = this.inputManager.capturePhoto();
        if (base64) {
            await this._handleImageSelected(base64);
        } else {
            Utils.showToast('拍照失败', 'error');
        }
    }

    async _playWord() {
        const btn = document.getElementById('btn-play-word');
        if (!this._currentObject) {
            Utils.showToast('暂无可播放的内容', 'warning');
            return;
        }
        try {
            if (btn) btn.classList.add('playing');
            await this.speech.playWord(this._currentObject);
        } catch (error) {
            console.error('[App] playWord failed:', error.message);
            Utils.showToast('播放失败：' + error.message, 'error');
        } finally {
            if (btn) btn.classList.remove('playing');
        }
    }

    async _listenPhrase() {
        const btn = document.getElementById('btn-listen-phrase');
        if (!this._currentPhrase) {
            Utils.showToast('暂无可播放的短语', 'warning');
            return;
        }
        try {
            if (btn) btn.classList.add('playing');
            await this.speech.playPhrase(this._currentPhrase);
        } catch (error) {
            console.error('[App] listenPhrase failed:', error.message);
            Utils.showToast('播放失败：' + error.message, 'error');
        } finally {
            if (btn) btn.classList.remove('playing');
        }
    }

    async _playPhraseFromList(index) {
        if (!this._currentPhrases || !this._currentPhrases[index]) {
            Utils.showToast('暂无可播放的短语', 'warning');
            return;
        }
        const phrase = this._currentPhrases[index];
        const english = typeof phrase === 'string' ? phrase : phrase.english;
        const btn = document.querySelector(`.phrase-play-btn[data-phrase-index="${index}"]`);
        try {
            if (btn) btn.classList.add('playing');
            await this.speech.playPhrase(english);
        } catch (error) {
            console.error('[App] playPhraseFromList failed:', error.message);
            Utils.showToast('播放失败：' + error.message, 'error');
        } finally {
            if (btn) btn.classList.remove('playing');
        }
    }

    async _playDialogueLine(text, btn) {
        try {
            if (btn) btn.classList.add('playing');
            await this.speech.playPhrase(text);
        } catch (error) {
            console.error('[App] playDialogueLine failed:', error.message);
            Utils.showToast('播放失败：' + error.message, 'error');
        } finally {
            if (btn) btn.classList.remove('playing');
        }
    }

    async _startPractice() {
        document.getElementById('practice-phrase').textContent = this._currentPhrase;
        this._showPage('practice');
        this._updateStepIndicator(2);
        try {
            await this.speech.playPhrase(this._currentPhrase);
        } catch (error) {
            console.warn('[App] Practice phrase playback failed:', error.message);
        }
    }

    async _startRecording() {
        const btn = document.getElementById('btn-record');
        const statusEl = document.getElementById('record-status');

        if (this._isRecording) {
            if (this._recording) {
                try {
                    if (statusEl) statusEl.textContent = '正在处理录音...';
                    const result = await this._recording.stop();
                    this._wavBlob = result.wavBlob;
                    this._pcmData = result.pcmData;
                    this._audioUrl = URL.createObjectURL(this._wavBlob);
                    console.log('[App] 录音停止成功，WAV大小:', this._wavBlob.size, 'PCM样本数:', result.pcmData?.length);

                    btn.classList.remove('recording');
                    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>';
                    this._isRecording = false;
                    if (statusEl) statusEl.textContent = '录音完成，正在评测...';

                    await this._onRecordingComplete();
                } catch (error) {
                    console.error('[App] 停止录音失败:', error);
                    btn.classList.remove('recording');
                    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>';
                    this._isRecording = false;
                    if (statusEl) statusEl.textContent = '点击下方按钮开始跟读';
                    Utils.showToast('停止录音失败: ' + error.message, 'error');
                }
            }
            return;
        }

        try {
            await this._ensureXunfei();
            if (statusEl) statusEl.textContent = '正在请求麦克风权限...';
            this._recording = await this.xunfei.startRecording();
            console.log('[App] 录音开始成功');

            btn.classList.add('recording');
            btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';
            this._isRecording = true;
            if (statusEl) statusEl.textContent = '正在录音，再次点击停止';
        } catch (error) {
            console.error('[App] 开始录音失败:', error);
            if (statusEl) statusEl.textContent = '录音启动失败';
            if (error.name === 'NotAllowedError') {
                Utils.showToast('麦克风权限被拒绝，请在浏览器设置中允许', 'error');
            } else {
                Utils.showToast('录音启动失败: ' + error.message, 'error');
            }
        }
    }

    async _playRecording() {
        if (!this._audioUrl) {
            Utils.showToast('暂无录音，请先录音', 'warning');
            return;
        }
        const btn = document.getElementById('btn-play-recording');
        try {
            if (btn) {
                btn.classList.add('playing');
                btn.disabled = true;
            }
            const audio = new Audio(this._audioUrl);
            await new Promise((resolve, reject) => {
                audio.onended = resolve;
                audio.onerror = () => reject(new Error('播放失败'));
                audio.play().catch(reject);
            });
        } catch (error) {
            console.error('[App] 播放录音失败:', error);
            Utils.showToast('播放录音失败', 'error');
        } finally {
            if (btn) {
                btn.classList.remove('playing');
                btn.disabled = false;
            }
        }
    }

    async _onRecordingComplete() {
        this._showLoading('正在评测语音...');

        try {
            await this._ensureXunfei();
            if (!this._pcmData || this._pcmData.length === 0) {
                throw new Error('录音数据为空，请重新录音');
            }

            const duration = this._pcmData.length / 16000;
            console.log('[App] 录音时长:', duration.toFixed(2), '秒, PCM样本数:', this._pcmData.length);

            if (duration < 0.5) {
                throw new Error('录音时间太短（不足0.5秒），请重新录音');
            }
            if (duration > 180) {
                throw new Error('录音时间超过3分钟限制，请重新录音');
            }

            const audioBase64 = window.XunfeiSpeech.int16ArrayToBase64(this._pcmData);
            console.log('[App] PCM Base64长度:', audioBase64.length, '(原始PCM，无WAV头)');

            const iseResult = await this.xunfei.evaluateISE(this._currentPhrase, audioBase64);

            if (iseResult && iseResult.overall > 0) {
                this._showPracticeResult(iseResult);
            } else if (iseResult && iseResult.isRejected) {
                const exceptInfo = iseResult.exceptInfo || '';
                let reason = '语音被识别为乱读';
                if (exceptInfo === '28676') reason = '检测到乱说，请清晰朗读后重试';
                else if (exceptInfo === '28673') reason = '未检测到有效语音，请靠近麦克风朗读';
                else if (exceptInfo === '28680') reason = '背景噪音过大，请在安静环境重试';
                else if (exceptInfo === '28689') reason = '未检测到音频输入，请检查麦克风';
                throw new Error(reason);
            } else {
                throw new Error('评测结果为空，请重新录音');
            }
        } catch (error) {
            console.error('[App] 语音评测失败:', error.message);
            Utils.showToast('语音评测失败: ' + error.message, 'error');
            this._showPage('practice');
        }
    }

    _showPracticeResult(scores) {
        document.getElementById('score-value').textContent = scores.overall;
        document.getElementById('score-accuracy-val').textContent = scores.accuracy;
        document.getElementById('score-fluency-val').textContent = scores.fluency;
        document.getElementById('score-standard-val').textContent = scores.standard;
        document.getElementById('score-integrity-val').textContent = scores.integrity;
        document.getElementById('score-accuracy').style.width = scores.accuracy + '%';
        document.getElementById('score-fluency').style.width = scores.fluency + '%';
        document.getElementById('score-standard').style.width = scores.standard + '%';
        document.getElementById('score-integrity').style.width = scores.integrity + '%';

        this._updateTooltips(scores);

        const feedbackEl = document.getElementById('score-feedback');
        if (feedbackEl) {
            const scoringEngine = new ScoringEngine();
            feedbackEl.textContent = scoringEngine.getFeedback(scores.overall);
        }

        const wordCompEl = document.getElementById('word-comparison');
        if (wordCompEl && scores.wordAnalysis && scores.wordAnalysis.length > 0) {
            wordCompEl.innerHTML = scores.wordAnalysis.map(w => {
                const cls = w.status === 'correct' ? 'word-tag correct' : w.status === 'missed' ? 'word-tag missed' : 'word-tag wrong';
                return `<span class="${cls}">${w.word}</span>`;
            }).join(' ');
        }

        document.getElementById('practice-result').classList.remove('hidden');
        document.getElementById('practice-actions').classList.remove('hidden');

        const playRecBtn = document.getElementById('btn-play-recording');
        if (playRecBtn && this._audioUrl) {
            playRecBtn.style.display = '';
        }

        const statusEl = document.getElementById('record-status');
        if (statusEl) statusEl.textContent = '评测完成';

        this._showPage('practice');
    }

    _updateTooltips(scores) {
        const wa = scores.wordAnalysis || [];
        const missedWords = wa.filter(w => w.status === 'missed').map(w => w.word);
        const wrongWords = wa.filter(w => w.status === 'wrong').map(w => w.word);
        const correctWords = wa.filter(w => w.status === 'correct').map(w => w.word);

        const accuracyIssues = [];
        const accuracyTips = [];
        if (wrongWords.length > 0) {
            accuracyIssues.push(`发音错误: ${wrongWords.join(', ')}`);
            accuracyTips.push(`重点练习 "${wrongWords.join('", "')}" 的发音，注意元音和辅音的口型`);
        }
        if (scores.accuracy < 60) {
            accuracyTips.push('尝试先听标准发音，模仿跟读，注意每个音素的口型位置');
        } else if (scores.accuracy < 80) {
            accuracyTips.push('发音基本正确，注意细节音素的准确性');
        }

        const fluencyIssues = [];
        const fluencyTips = [];
        if (scores.fluency < 60) {
            fluencyIssues.push('朗读节奏不连贯，停顿过多');
            fluencyTips.push('先慢速朗读，确保每个词连贯，再逐步提速');
            fluencyTips.push('注意意群之间的自然停顿，而非逐词停顿');
        } else if (scores.fluency < 80) {
            fluencyTips.push('节奏基本流畅，注意长句中的自然换气点');
        }

        const standardIssues = [];
        const standardTips = [];
        if (wrongWords.length > 0) {
            standardIssues.push(`重音/语调问题: ${wrongWords.join(', ')}`);
        }
        if (scores.standard < 60) {
            standardTips.push('注意英语句子的升降调模式：一般疑问句升调，陈述句降调');
            standardTips.push('关注关键词的重音位置，英语重音影响语义');
        } else if (scores.standard < 80) {
            standardTips.push('语调基本正确，注意句子末尾的升降调变化');
        }

        const integrityIssues = [];
        const integrityTips = [];
        if (missedWords.length > 0) {
            integrityIssues.push(`漏读: ${missedWords.join(', ')}`);
            integrityTips.push(`注意不要遗漏 "${missedWords.join('", "')}" 等词`);
        }
        if (scores.integrity < 60) {
            integrityTips.push('确保完整朗读所有内容，不要跳过任何词');
        } else if (scores.integrity < 80) {
            integrityTips.push('朗读基本完整，注意小词（冠词、介词）不要遗漏');
        }

        this._setTooltipContent('accuracy', accuracyIssues, accuracyTips);
        this._setTooltipContent('fluency', fluencyIssues, fluencyTips);
        this._setTooltipContent('standard', standardIssues, standardTips);
        this._setTooltipContent('integrity', integrityIssues, integrityTips);
    }

    _setTooltipContent(dimension, issues, tips) {
        const issuesEl = document.getElementById(`tooltip-${dimension}-issues`);
        const tipsEl = document.getElementById(`tooltip-${dimension}-tips`);

        if (issuesEl) {
            if (issues.length > 0) {
                issuesEl.innerHTML = `<div class="tooltip-issues-label">⚠ 扣分原因</div><ul class="tooltip-issues-list">${issues.map(i => `<li>${i}</li>`).join('')}</ul>`;
            } else {
                issuesEl.innerHTML = '<div style="color:#27ae60;font-size:12px">✓ 该维度表现良好</div>';
            }
        }

        if (tipsEl) {
            if (tips.length > 0) {
                tipsEl.innerHTML = `<div class="tooltip-tips-label">💡 改进建议</div><ul class="tooltip-tips-list">${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
            }
        }
    }

    _retryPractice() {
        document.getElementById('practice-result').classList.add('hidden');
        document.getElementById('practice-actions').classList.add('hidden');
        document.getElementById('btn-play-recording').style.display = 'none';
        const statusEl = document.getElementById('record-status');
        if (statusEl) statusEl.textContent = '点击下方按钮开始跟读';
        this._wavBlob = null;
        this._audioUrl = null;
        this._pcmData = null;
    }

    async _goToScene() {
        this._showLoading('正在准备场景对话...');

        try {
            const dialogueResult = await this.api.generateDialogue(this._currentObject, 'other');

            let sceneDescription = '';
            if (dialogueResult && dialogueResult.dialogue && dialogueResult.dialogue.length > 0) {
                this._currentDialogue = dialogueResult.dialogue.map(d => ({
                    speaker: d.speaker === 'A' ? 'Person A' : 'Person B',
                    text: d.english,
                    chinese: d.chinese || ''
                }));
                sceneDescription = dialogueResult.dialogue
                    .map(d => d.english)
                    .join('. ');
            } else {
                this._currentDialogue = [];
            }

            this._showLoading('正在生成场景图片...');
            const imageUrl = await this.api.generateSceneImage(
                this._currentObject,
                'other',
                sceneDescription
            );

            if (!imageUrl) {
                throw new Error('图片生成失败');
            }

            this._currentImageUrl = imageUrl;
            this._dialogueIndex = 0;
            this._showScenePage(imageUrl);
        } catch (error) {
            Utils.logError('goToScene', error, { subject: this._currentObject });
            Utils.showToast('生成场景失败：' + error.message, 'error');
            this._showPage('practice');
        }
    }

    _showScenePage(imageUrl) {
        this._sceneActive = true;
        const sceneImg = document.getElementById('scene-image');
        const sceneLoading = document.getElementById('scene-loading');
        if (sceneImg) sceneImg.src = imageUrl;
        if (sceneLoading) sceneLoading.style.display = 'none';

        const referenceContent = document.getElementById('reference-content');
        if (referenceContent && this._currentDialogue.length > 0) {
            referenceContent.innerHTML = this._currentDialogue.map(line => `
                <div class="reference-line">
                    <span class="reference-speaker">${line.speaker === 'Person A' ? 'A' : 'B'}</span>
                    <span class="reference-english">${line.text}</span>
                    ${line.chinese ? `<span class="reference-chinese">${line.chinese}</span>` : ''}
                </div>
            `).join('');
        }

        const dialogueList = document.getElementById('dialogue-list');
        if (dialogueList) dialogueList.innerHTML = '';

        this._showPage('scene');
        this._updateStepIndicator(3);
    }

    async _startDialoguePractice() {
        this._dialogueIndex = 0;
        this._sceneActive = true;
        const dialogueList = document.getElementById('dialogue-list');
        if (dialogueList) dialogueList.innerHTML = '';
        this.sceneManager.resetDialogueState();

        const btn = document.getElementById('btn-start-dialogue');
        if (btn) btn.textContent = '重新开始对话练习';

        await this._playNextAppLine();
    }

    async _playNextAppLine() {
        if (this._dialogueIndex >= this._currentDialogue.length) {
            this._setTurnIndicator('轮到你了！');
            return;
        }

        if (!this._sceneActive) return;

        const line = this._currentDialogue[this._dialogueIndex];
        if (line.speaker === 'Person A') {
            this._setTurnIndicator('对方正在说话...');
            try {
                await this.speech.playPhrase(line.text);
            } catch (e) {
                console.warn('TTS播放失败:', e);
            }

            if (!this._sceneActive) return;

            this.sceneManager.addDialogueLine('A', line.text, line.chinese);
            this._dialogueIndex++;

            if (this._dialogueIndex < this._currentDialogue.length) {
                const nextLine = this._currentDialogue[this._dialogueIndex];
                if (nextLine.speaker === 'Person B') {
                    this._setTurnIndicator('轮到你了！');
                } else {
                    await this._playNextAppLine();
                }
            } else {
                this._setTurnIndicator('轮到你了！');
            }
        } else {
            this._setTurnIndicator('轮到你了！');
        }
    }

    async _startSceneVoiceInput() {
        const btnMic = document.getElementById('btn-scene-mic');

        if (this._sceneRecording) {
            this._stopSceneRecording();
            return;
        }

        try {
            await this._ensureXunfei();
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                Utils.showToast('浏览器不支持录音功能，请使用Chrome浏览器', 'error');
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });

            this._sceneRecording = true;
            this._sceneMediaStream = stream;
            this._scenePcmBuffers = [];
            this._sceneIatFinalText = '';
            this._sceneIatConnected = false;
            btnMic.classList.add('recording');

            this._sceneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this._sceneAudioCtx.state === 'suspended') {
                try { await this._sceneAudioCtx.resume(); } catch (e) {}
            }

            const source = this._sceneAudioCtx.createMediaStreamSource(stream);
            const processor = this._sceneAudioCtx.createScriptProcessor(4096, 1, 1);
            this._sceneProcessor = processor;

            const silentGain = this._sceneAudioCtx.createGain();
            silentGain.gain.value = 0;
            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(this._sceneAudioCtx.destination);

            const nativeRate = this._sceneAudioCtx.sampleRate;

            processor.onaudioprocess = (e) => {
                if (!this._sceneRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const resampled = window.XunfeiSpeech.resampleBuffer(inputData, nativeRate, 16000);
                const int16Data = window.XunfeiSpeech.float32ToInt16(resampled);
                this._scenePcmBuffers.push(new Int16Array(int16Data));

                if (this._sceneIatConnected && this.xunfei.iatWs && this.xunfei.iatWs.readyState === WebSocket.OPEN) {
                    const base64Audio = window.XunfeiSpeech.int16ArrayToBase64(int16Data);
                    this.xunfei.sendIATAudio(base64Audio, 1);
                }

                const outputData = e.outputBuffer.getChannelData(0);
                for (let i = 0; i < outputData.length; i++) { outputData[i] = 0; }
            };

            this._sceneRecordTimer = setTimeout(() => {
                this._stopSceneRecording();
            }, 15000);

            try {
                const iatStarted = await this.xunfei.startIAT(
                    (result) => {
                        if (result.text) {
                            document.getElementById('scene-text-input').value = result.fullText || result.text;
                        }
                    },
                    (finalText) => {
                        this._sceneIatFinalText = finalText;
                    },
                    (error) => {
                        console.warn('[SceneIAT] Error:', error.message);
                    }
                );

                if (iatStarted) {
                    this._sceneIatConnected = true;
                    this.xunfei.sendIATFirstFrame();
                }
            } catch (e) {
                console.warn('[SceneIAT] Start failed:', e.message);
            }

        } catch (error) {
            this._sceneRecording = false;
            btnMic.classList.remove('recording');
            if (error.name === 'NotAllowedError') {
                Utils.showToast('麦克风权限被拒绝', 'error');
            } else {
                Utils.showToast('录音启动失败：' + error.message, 'error');
            }
        }
    }

    _stopSceneRecording() {
        const btnMic = document.getElementById('btn-scene-mic');

        if (this._sceneIatConnected && this.xunfei) {
            this.xunfei.stopIAT();
            this._sceneIatConnected = false;
        }

        if (this._sceneProcessor) {
            this._sceneProcessor.disconnect();
            this._sceneProcessor = null;
        }
        if (this._sceneAudioCtx) {
            this._sceneAudioCtx.close().catch(() => {});
            this._sceneAudioCtx = null;
        }
        if (this._sceneMediaStream) {
            this._sceneMediaStream.getTracks().forEach(t => t.stop());
            this._sceneMediaStream = null;
        }

        clearTimeout(this._sceneRecordTimer);
        this._sceneRecording = false;
        btnMic.classList.remove('recording');

        const recognized = this._sceneIatFinalText || document.getElementById('scene-text-input').value.trim();
        if (recognized) {
            document.getElementById('scene-text-input').value = recognized;
            const rerecordBtn = document.getElementById('btn-scene-rerecord');
            if (rerecordBtn) rerecordBtn.classList.remove('hidden');
            setTimeout(() => this._sendSceneAnswer(), 300);
        }
    }

    _rerecordSceneVoice() {
        document.getElementById('scene-text-input').value = '';
        const rerecordBtn = document.getElementById('btn-scene-rerecord');
        if (rerecordBtn) rerecordBtn.classList.add('hidden');
        this._startSceneVoiceInput();
    }

    async _sendSceneAnswer() {
        const input = document.getElementById('scene-text-input');
        const userText = input.value.trim();
        if (!userText) {
            Utils.showToast('请输入回答', 'warning');
            return;
        }

        this._setTurnIndicator('正在评测你的表达...');
        input.value = '';

        let evaluation = null;
        try {
            const context = this.sceneManager.buildConversationContext();
            evaluation = await this.sceneManager.evaluateUserSpeech(userText, context);
        } catch (e) {
            console.warn('[App] Speech evaluation failed:', e);
        }

        if (!this._sceneActive) return;

        const userTranslation = (evaluation && evaluation.translation) ? evaluation.translation : '';
        this.sceneManager.addDialogueLine('B', userText, userTranslation, evaluation);

        try {
            this._setTurnIndicator('正在生成回应...');
            const context = this.sceneManager.buildConversationContext();
            const response = await this.sceneManager.generateAppResponse(userText, context);

            if (!this._sceneActive) return;

            if (response && response.english) {
                this._setTurnIndicator('对方正在说话...');
                try {
                    await this.speech.playPhrase(response.english);
                } catch (e) {
                    console.warn('TTS播放失败:', e);
                }
                if (this._sceneActive) {
                    this.sceneManager.addDialogueLine('A', response.english, response.chinese || '');
                }
            }
            if (this._sceneActive) {
                this._setTurnIndicator('轮到你了！');
                this._updateErrorReport();
            }
        } catch (error) {
            Utils.logError('sendSceneAnswer', error);
            if (this._sceneActive) {
                Utils.showToast('生成回应失败，请重试', 'error');
                this._setTurnIndicator('轮到你了！');
            }
        }
    }

    _updateErrorReport() {
        const report = this.sceneManager.getErrorReport();
        const panel = document.getElementById('error-report-panel');
        const summaryEl = document.getElementById('error-report-summary');
        const weakEl = document.getElementById('error-report-weak');

        if (!panel || !report || report.totalUtterances < 1) return;

        panel.classList.remove('hidden');
        if (summaryEl) summaryEl.textContent = report.summary;

        if (weakEl && report.weakAreas && report.weakAreas.length > 0) {
            const maxCount = Math.max(...report.weakAreas.map(a => a.count));
            weakEl.innerHTML = report.weakAreas.map(area => `
                <div class="weak-area-item">
                    <span class="weak-area-label">${area.type}</span>
                    <div class="weak-area-bar"><div class="weak-area-fill" style="width:${Math.round(area.count / maxCount * 100)}%"></div></div>
                    <span class="weak-area-count">${area.count}次</span>
                </div>
            `).join('');
        } else if (weakEl) {
            weakEl.innerHTML = '<div style="font-size:12px;color:var(--text-hint)">暂无错误记录，继续保持！</div>';
        }
    }

    _setTurnIndicator(text) {
        const indicator = document.getElementById('scene-turn-status');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.textContent = text;
        }
    }

    _showLoading(text) {
        const tipEl = document.getElementById('loading-text');
        const slowEl = document.getElementById('loading-slow');
        const loadingPage = document.getElementById('page-loading');

        let tip = (text && String(text).trim().length > 0) ? String(text) : '加载中...';
        if (this._loadingTipPicker) {
            const picked = this._loadingTipPicker.next();
            if (picked && picked.text) tip = picked.text;
        }

        if (tipEl) tipEl.textContent = tip;
        if (slowEl) slowEl.classList.add('hidden');
        if (this._loadingSlowTimer) clearTimeout(this._loadingSlowTimer);
        this._loadingSlowTimer = setTimeout(() => {
            const page = document.getElementById('page-loading');
            if (page && page.style.display !== 'none') {
                const slow = document.getElementById('loading-slow');
                if (slow) slow.classList.remove('hidden');
            }
        }, 15000);

        if (loadingPage) loadingPage.style.display = 'block';
        this._updateViewportSizing();
    }

    _showPage(pageId) {
        const pageMap = {
            'home': 'page-home',
            'input': 'page-home',
            'loading': 'page-loading',
            'practice': 'page-practice',
            'scene': 'page-scene',
            'camera': 'page-camera',
            'result': 'page-result',
            'history': 'page-history'
        };
        const pages = ['page-home', 'page-camera', 'page-loading', 'page-result', 'page-practice', 'page-scene', 'page-history'];
        const targetId = pageMap[pageId] || pageId;
        pages.forEach(id => {
            const page = document.getElementById(id);
            if (page) page.style.display = id === targetId ? 'block' : 'none';
        });

        const header = document.getElementById('app-header');
        const stepIndicator = document.getElementById('step-indicator');
        const btnBack = document.getElementById('btn-back');
        const btnHome = document.getElementById('btn-home');

        const isHome = pageId === 'home' || pageId === 'input';
        const isHistory = pageId === 'history';
        if (header) header.classList.toggle('hidden', isHome);
        if (stepIndicator) stepIndicator.classList.toggle('hidden', isHome || isHistory);
        if (btnBack) btnBack.classList.toggle('hidden', isHome);
        if (btnHome) btnHome.classList.toggle('hidden', isHome);
        const loadingPage = document.getElementById('page-loading');
        if (loadingPage) loadingPage.style.display = 'none';
        this._updateViewportSizing();
        setTimeout(() => this._updateViewportSizing(), 0);
    }

    _updateStepIndicator(step) {
        this._currentStep = step;
        const steps = document.querySelectorAll('#step-indicator .step');
        steps.forEach((el, index) => {
            el.classList.toggle('active', index < step);
            el.classList.toggle('current', index === step - 1);
        });
    }

    _goBack() {
        this._sceneActive = false;
        this.speech.stop();
        if (this._currentStep === 3) {
            this._showPage('practice');
            this._updateStepIndicator(2);
        } else if (this._currentStep === 2) {
            this._showPage('result');
            this._updateStepIndicator(1);
        } else {
            this._goHome();
        }
    }

    _goHome() {
        this._sceneActive = false;
        this._saveCurrentSession();
        this.speech.stop();
        this._stopRecording();
        this._stopSceneRecording();
        this.sceneManager.resetDialogueState();
        this.inputManager.stopCamera();
        this._showPage('home');
        this._updateStepIndicator(1);
    }

    _saveCurrentSession() {
        if (!this._currentObject) return;

        const dialogue = this.sceneManager.dialogueHistory || [];
        const errorReport = this.sceneManager.getErrorReport();

        const record = this.historyManager.createRecord(
            this._currentObject,
            '',
            this._currentImageUrl,
            this._currentPhrases,
            dialogue.map(d => ({
                speaker: d.speaker,
                english: d.english,
                chinese: d.chinese || '',
                timestamp: new Date().toISOString()
            })),
            errorReport.totalUtterances > 0 ? errorReport : null
        );

        const savedId = this.historyManager.saveRecord(record);
        if (savedId) {
            console.log('[App] Session saved:', savedId);
        }
    }

    _stopRecording() {
        if (this._isRecording && this._recording) {
            try { this._recording.stop(); } catch (e) {}
            this._isRecording = false;
        }
        this._wavBlob = null;
        this._audioUrl = null;
        this._pcmData = null;
    }

    _showHistoryPage() {
        this._renderHistoryList();
        this._showPage('history');
    }

    _renderHistoryList() {
        const listEl = document.getElementById('history-list');
        const emptyEl = document.getElementById('history-empty');
        if (!listEl) return;

        const records = this.historyManager.getAllRecords();

        if (records.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) {
                listEl.appendChild(emptyEl);
                emptyEl.style.display = '';
            } else {
                listEl.innerHTML = `
                    <div class="history-empty" id="history-empty">
                        <div class="history-empty-icon">📖</div>
                        <p>还没有学习记录</p>
                        <p class="history-empty-hint">拍照识物后，学习记录会自动保存在这里</p>
                    </div>
                `;
            }
            return;
        }

        listEl.innerHTML = records.map(record => {
            const date = record.createdAt ? new Date(record.createdAt) : new Date();
            const timeStr = `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

            const phraseCount = record.phraseCount || (record.phrases ? record.phrases.length : 0);
            const dialogueTurns = record.dialogueTurns || (record.dialogue ? record.dialogue.length : 0);

            let phrasesHtml = '';
            if (record.phrases && record.phrases.length > 0) {
                const phraseTags = record.phrases.slice(0, 5).map(p => {
                    const eng = typeof p === 'string' ? p : p.english;
                    return `<span class="history-detail-phrase">${eng}</span>`;
                }).join('');
                phrasesHtml = `
                    <div class="history-detail-section">
                        <div class="history-detail-label">实用短语</div>
                        <div class="history-detail-phrases">${phraseTags}</div>
                    </div>
                `;
            }

            let dialogueHtml = '';
            if (record.dialogue && record.dialogue.length > 0) {
                const lines = record.dialogue.slice(0, 6).map(d => {
                    const speakerClass = d.speaker === 'A' ? 'speaker-a' : 'speaker-b';
                    const speakerLabel = d.speaker === 'A' ? '对方' : '我';
                    return `<div class="history-detail-line"><span class="${speakerClass}">${speakerLabel}：</span>${d.english || ''}${d.chinese ? ` (${d.chinese})` : ''}</div>`;
                }).join('');
                const moreLines = record.dialogue.length > 6 ? `<div class="history-detail-line" style="color:var(--text-light)">...还有${record.dialogue.length - 6}条对话</div>` : '';
                dialogueHtml = `
                    <div class="history-detail-section">
                        <div class="history-detail-label">场景对话</div>
                        <div class="history-detail-dialogue">${lines}${moreLines}</div>
                    </div>
                `;
            }

            let errorHtml = '';
            if (record.errorReport && record.errorReport.totalUtterances > 0) {
                errorHtml = `
                    <div class="history-detail-section">
                        <div class="history-detail-label">错误统计</div>
                        <div style="font-size:12px;color:var(--text-secondary)">${record.errorReport.summary || ''}</div>
                    </div>
                `;
            }

            return `
                <div class="history-card" data-id="${record.id}">
                    <div class="history-card-header">
                        <span class="history-card-subject">${record.subject || '未知'}</span>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span class="history-card-time">${timeStr}</span>
                            <button class="history-card-delete" data-id="${record.id}" title="删除">✕</button>
                        </div>
                    </div>
                    <div class="history-card-stats">
                        <span>📝 ${phraseCount}个短语</span>
                        <span>💬 ${dialogueTurns}轮对话</span>
                    </div>
                    <div class="history-detail hidden">
                        ${phrasesHtml}
                        ${dialogueHtml}
                        ${errorHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    _clearAllHistory() {
        if (!confirm('确定要清空所有学习记录吗？此操作不可恢复。')) return;
        this.historyManager.clearAll();
        this._renderHistoryList();
        Utils.showToast('已清空所有记录', 'info');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
