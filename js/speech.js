class SpeechManager {
    constructor(api) {
        this.api = api;
        this.currentAudio = null;
        this.currentSpeed = 1.0;
        this.isSpeaking = false;
        this.words = [];
        this.currentWordIndex = -1;
        this.onWordHighlight = null;
        this._highlightTimer = null;
        this._playbackId = 0;
        this._ttsCache = {};
    }

    async playPhrase(text, speed = 1.0) {
        this.stop();
        const playbackId = this._playbackId;
        this.currentSpeed = speed;

        console.log('[Speech] playPhrase start:', text, 'speed:', speed);

        try {
            const audioUrl = await this._xunfeiTTS(text, speed);
            if (playbackId !== this._playbackId) return;

            return this._playAudio(audioUrl, text, playbackId);
        } catch (e) {
            console.warn('[Speech] Xunfei TTS failed, falling back to WebSpeech:', e.message);
            if (playbackId !== this._playbackId) return;
            return this._playWithWebSpeech(text, speed);
        }
    }

    async playWord(word) {
        this.stop();
        const playbackId = this._playbackId;

        console.log('[Speech] playWord start:', word);

        try {
            const audioUrl = await this._xunfeiTTS(word, 0.8);
            if (playbackId !== this._playbackId) return;

            return this._playAudio(audioUrl, word, playbackId);
        } catch (e) {
            console.warn('[Speech] Xunfei TTS word failed, falling back to WebSpeech:', e.message);
            if (playbackId !== this._playbackId) return;
            return this._playWithWebSpeech(word, 0.8);
        }
    }

    // ============ 讯飞 TTS WebSocket ============
    _xunfeiTTS(text, speed) {
        return new Promise(async (resolve, reject) => {
            try {
                const config = window.APP_CONFIG || {};
                const proxyUrl = config.proxyUrl || '';
                const res = await fetch(`${proxyUrl}/api/xunfei/auth-tts`);
                const authData = await res.json();

                if (!authData.url) {
                    reject(new Error('获取TTS鉴权失败'));
                    return;
                }

                const ws = new WebSocket(authData.url);
                let audioChunks = [];

                ws.onopen = () => {
                    const speedVal = Math.min(100, Math.max(0, Math.round((speed || 1.0) * 50)));
                    const request = {
                        common: { app_id: authData.appId },
                        business: {
                            aue: 'lame',
                            sfl: 1,
                            auf: 'audio/L16;rate=24000',
                            vcn: authData.vcn || 'x4_enus_luna_assist',
                            tte: 'UTF8',
                            speed: speedVal,
                            volume: 50,
                            pitch: 50,
                            bgs: 0
                        },
                        data: {
                            status: 2,
                            text: btoa(unescape(encodeURIComponent(text)))
                        }
                    };
                    ws.send(JSON.stringify(request));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.code !== 0) {
                            console.error('[Speech] TTS error:', data.code, data.message);
                            ws.close();
                            reject(new Error(data.message || 'TTS合成失败'));
                            return;
                        }

                        if (data.data && data.data.audio) {
                            const binaryStr = atob(data.data.audio);
                            const bytes = new Uint8Array(binaryStr.length);
                            for (let i = 0; i < binaryStr.length; i++) {
                                bytes[i] = binaryStr.charCodeAt(i);
                            }
                            audioChunks.push(bytes);
                        }

                        if (data.code === 0 && data.data && data.data.status === 2) {
                            ws.close();
                            const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                            const combined = new Uint8Array(totalLength);
                            let offset = 0;
                            for (const chunk of audioChunks) {
                                combined.set(chunk, offset);
                                offset += chunk.length;
                            }
                            const blob = new Blob([combined], { type: 'audio/mp3' });
                            const audioUrl = URL.createObjectURL(blob);
                            console.log('[Speech] Xunfei TTS success');
                            resolve(audioUrl);
                        }
                    } catch (e) {
                        console.error('[Speech] TTS parse error:', e);
                        ws.close();
                        reject(e);
                    }
                };

                ws.onerror = (e) => {
                    console.error('[Speech] TTS WebSocket error');
                    reject(new Error('TTS WebSocket连接失败'));
                };

                ws.onclose = () => {
                    // 如果还没resolve，说明出错了
                };

                // 超时处理
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                        ws.close();
                        reject(new Error('TTS超时'));
                    }
                }, 15000);
            } catch (e) {
                reject(e);
            }
        });
    }

    // ============ 音频播放 ============
    _playAudio(audioUrl, text, playbackId) {
        return new Promise((resolve, reject) => {
            let settled = false;
            this.currentAudio = new Audio(audioUrl);
            this.words = text.split(/\s+/);

            this.currentAudio.onended = () => {
                if (settled) return;
                settled = true;
                this.isSpeaking = false;
                this.currentWordIndex = -1;
                if (this.onWordHighlight) this.onWordHighlight(-1);
                resolve();
            };

            this.currentAudio.onerror = (e) => {
                if (settled) return;
                settled = true;
                this.isSpeaking = false;
                console.error('[Speech] Audio play error:', e);
                this._playWithWebSpeech(text, this.currentSpeed).then(resolve).catch(reject);
            };

            this.currentAudio.onplay = () => {
                this.isSpeaking = true;
                this._startWordHighlight();
            };

            this.currentAudio.play().catch(e => {
                if (settled) return;
                settled = true;
                console.error('[Speech] play() rejected:', e.message);
                this._playWithWebSpeech(text, this.currentSpeed).then(resolve).catch(reject);
            });
        });
    }

    // ============ Web Speech API 降级 ============
    _playWithWebSpeech(text, speed) {
        return new Promise((resolve, reject) => {
            if (!('speechSynthesis' in window)) {
                reject(new Error('浏览器不支持语音合成'));
                return;
            }

            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                const onVoicesLoaded = () => {
                    speechSynthesis.onvoiceschanged = null;
                    this._doPlayWithWebSpeech(text, speed, resolve, reject);
                };
                speechSynthesis.onvoiceschanged = onVoicesLoaded;
                setTimeout(() => {
                    if (speechSynthesis.getVoices().length === 0) {
                        speechSynthesis.onvoiceschanged = null;
                        this._doPlayWithWebSpeech(text, speed, resolve, reject);
                    }
                }, 1000);
            } else {
                this._doPlayWithWebSpeech(text, speed, resolve, reject);
            }
        });
    }

    _doPlayWithWebSpeech(text, speed, resolve, reject) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = speed;
        utterance.pitch = 1;

        const voices = speechSynthesis.getVoices();
        const enVoice = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
        if (enVoice) {
            utterance.voice = enVoice;
        }

        this.isSpeaking = true;

        utterance.onend = () => {
            this.isSpeaking = false;
            resolve();
        };

        utterance.onerror = (e) => {
            this.isSpeaking = false;
            if (e.error !== 'canceled' && e.error !== 'interrupted') {
                reject(new Error('语音播放出错: ' + e.error));
            } else {
                resolve();
            }
        };

        try {
            speechSynthesis.speak(utterance);
            this.currentAudio = { _isWebSpeech: true, utterance };
        } catch (e) {
            this.isSpeaking = false;
            reject(new Error('语音播放被阻止: ' + e.message));
        }
    }

    _startWordHighlight() {
        if (!this.currentAudio || this.currentAudio._isWebSpeech) return;

        const waitForDuration = () => {
            if (this.currentAudio && this.currentAudio.duration && isFinite(this.currentAudio.duration)) {
                const totalDuration = this.currentAudio.duration;
                const wordDuration = totalDuration / this.words.length;
                let idx = 0;

                const highlight = () => {
                    if (!this.isSpeaking || idx >= this.words.length) return;
                    this.currentWordIndex = idx;
                    if (this.onWordHighlight) this.onWordHighlight(idx);
                    idx++;
                    this._highlightTimer = setTimeout(highlight, wordDuration * 1000);
                };

                this._highlightTimer = setTimeout(highlight, 200);
            } else {
                setTimeout(waitForDuration, 100);
            }
        };

        waitForDuration();
    }

    stop() {
        if (this.currentAudio) {
            if (this.currentAudio._isWebSpeech) {
                speechSynthesis.cancel();
            } else {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                this.currentAudio.onended = null;
                this.currentAudio.onerror = null;
                this.currentAudio.onplay = null;
                this.currentAudio.src = '';
                this.currentAudio.load();
            }
            this.currentAudio = null;
        }
        speechSynthesis.cancel();
        this.isSpeaking = false;
        this.currentWordIndex = -1;
        this._playbackId++;
        clearTimeout(this._highlightTimer);
        if (this.onWordHighlight) this.onWordHighlight(-1);
    }

    startRecognition(onResult, onEnd, onError, options = {}) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (onError) onError(new Error('浏览器不支持语音识别，请使用Chrome浏览器'));
            return null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = options.interimResults !== undefined ? options.interimResults : true;
        recognition.continuous = options.continuous || false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += transcript;
                else interim += transcript;
            }
            if (onResult) onResult({ interim, final });
        };

        recognition.onend = () => { if (onEnd) onEnd(); };

        recognition.onerror = (event) => {
            if (event.error === 'aborted' || event.error === 'no-speech') return;
            if (onError) onError(new Error(this._recognitionErrorMsg(event.error)));
        };

        try {
            recognition.start();
        } catch (e) {
            if (onError) onError(new Error('语音识别启动失败，请刷新页面重试'));
            return null;
        }

        return recognition;
    }

    _recognitionErrorMsg(error) {
        const msgs = {
            'no-speech': '未检测到语音输入，请靠近麦克风再试一次',
            'audio-capture': '未找到麦克风，请检查设备',
            'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许',
            'network': '语音识别需要网络连接，请检查网络后重试',
            'aborted': '语音识别被中断',
            'service-not-allowed': '语音识别服务不可用，请使用Chrome浏览器'
        };
        return msgs[error] || `语音识别错误: ${error}`;
    }
}

window.SpeechManager = SpeechManager;
