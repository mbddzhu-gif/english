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
        this._fallbackAttempted = false;
    }

    async playPhrase(text, speed = 1.0) {
        this.stop();
        const playbackId = this._playbackId;
        this.currentSpeed = speed;

        console.log('[Speech] playPhrase start:', text, 'speed:', speed, 'playbackId:', playbackId);

        try {
            const result = await this.api.textToSpeech(text, { speed });
            if (playbackId !== this._playbackId) {
                console.log('[Speech] playPhrase cancelled (stale)');
                return;
            }
            console.log('[Speech] TTS success, audioUrl length:', result.audioUrl?.length);

            if (!result.audioUrl) {
                throw new Error('TTS返回空音频URL');
            }

            this._fallbackAttempted = false;
            this.currentAudio = new Audio(result.audioUrl);
            this.words = text.split(/\s+/);

            return new Promise((resolve, reject) => {
                let settled = false;

                this.currentAudio.onended = () => {
                    if (settled) return;
                    settled = true;
                    this.isSpeaking = false;
                    this.currentWordIndex = -1;
                    if (this.onWordHighlight) this.onWordHighlight(-1);
                    console.log('[Speech] playPhrase ended');
                    resolve();
                };

                this.currentAudio.onerror = (e) => {
                    if (settled) return;
                    settled = true;
                    this.isSpeaking = false;
                    console.error('[Speech] Audio play error:', e);
                    if (!this._fallbackAttempted) {
                        this._fallbackAttempted = true;
                        console.log('[Speech] Audio error, falling back to WebSpeech');
                        this._playWithWebSpeech(text, speed).then(resolve).catch(reject);
                    } else {
                        reject(new Error('音频播放失败'));
                    }
                };

                this.currentAudio.onplay = () => {
                    this.isSpeaking = true;
                    this._startWordHighlight();
                    console.log('[Speech] Audio started playing');
                };

                this.currentAudio.play().catch(e => {
                    if (settled) return;
                    settled = true;
                    console.error('[Speech] play() rejected:', e.message);
                    if (!this._fallbackAttempted) {
                        this._fallbackAttempted = true;
                        console.log('[Speech] play() rejected, falling back to WebSpeech');
                        this._playWithWebSpeech(text, speed).then(resolve).catch(() => {
                            reject(new Error('播放被阻止：' + e.message));
                        });
                    } else {
                        reject(new Error('播放被阻止：' + e.message));
                    }
                });
            });
        } catch (error) {
            console.warn('[Speech] TTS failed, falling back to WebSpeech:', error.message);
            if (playbackId !== this._playbackId) return;
            return this._playWithWebSpeech(text, speed);
        }
    }

    async playWord(word) {
        this.stop();
        const playbackId = this._playbackId;

        console.log('[Speech] playWord start:', word, 'playbackId:', playbackId);

        try {
            const result = await this.api.textToSpeech(word, { speed: 0.8 });
            if (playbackId !== this._playbackId) return;
            console.log('[Speech] TTS word success');

            if (!result.audioUrl) {
                throw new Error('TTS返回空音频URL');
            }

            this._fallbackAttempted = false;
            this.currentAudio = new Audio(result.audioUrl);

            return new Promise((resolve, reject) => {
                let settled = false;

                this.currentAudio.onended = () => {
                    if (settled) return;
                    settled = true;
                    this.isSpeaking = false;
                    resolve();
                };

                this.currentAudio.onerror = () => {
                    if (settled) return;
                    settled = true;
                    this.isSpeaking = false;
                    if (!this._fallbackAttempted) {
                        this._fallbackAttempted = true;
                        console.error('[Speech] Word audio error, falling back to WebSpeech');
                        this._playWithWebSpeech(word, 0.8).then(resolve).catch(reject);
                    } else {
                        reject(new Error('播放失败'));
                    }
                };

                this.currentAudio.onplay = () => {
                    console.log('[Speech] Word audio playing');
                };

                this.currentAudio.play().catch(e => {
                    if (settled) return;
                    settled = true;
                    console.error('[Speech] Word play() rejected:', e.message);
                    if (!this._fallbackAttempted) {
                        this._fallbackAttempted = true;
                        console.log('[Speech] Word play rejected, falling back to WebSpeech');
                        this._playWithWebSpeech(word, 0.8).then(resolve).catch(reject);
                    } else {
                        reject(new Error('播放被阻止：' + e.message));
                    }
                });
            });
        } catch (error) {
            console.warn('[Speech] TTS word failed, falling back to WebSpeech:', error.message);
            if (playbackId !== this._playbackId) return;
            return this._playWithWebSpeech(word, 0.8);
        }
    }

    _playWithWebSpeech(text, speed) {
        return new Promise((resolve, reject) => {
            if (!('speechSynthesis' in window)) {
                reject(new Error('浏览器不支持语音合成'));
                return;
            }

            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                console.log('[Speech] Waiting for speech synthesis voices to load...');
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
            console.log('[Speech] Using voice:', enVoice.name);
        }

        this.isSpeaking = true;

        utterance.onend = () => {
            this.isSpeaking = false;
            console.log('[Speech] WebSpeech ended');
            resolve();
        };

        utterance.onerror = (e) => {
            this.isSpeaking = false;
            console.error('[Speech] WebSpeech error:', e.error);
            if (e.error !== 'canceled') reject(new Error('语音播放出错: ' + e.error));
            else resolve();
        };

        try {
            console.log('[Speech] Speaking with WebSpeech:', text);
            speechSynthesis.speak(utterance);
            this.currentAudio = { _isWebSpeech: true, utterance };
        } catch (e) {
            this.isSpeaking = false;
            console.error('[Speech] WebSpeech speak failed:', e.message);
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
        this._fallbackAttempted = false;
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
