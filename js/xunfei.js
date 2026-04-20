class XunfeiSpeech {
    constructor() {
        this.proxyUrl = window.APP_CONFIG?.proxyUrl || '';
        this.appId = '2aa0879e';
        this.iseWs = null;
        this.iseResultParts = [];
        this.iatWs = null;
        this.iatResult = '';
    }

    async _getAuthUrl(type) {
        console.log('正在获取讯飞认证URL...');
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(`${this.proxyUrl}/api/xunfei/auth-${type}`, { signal: controller.signal }).finally(() => clearTimeout(timer));
            if (!response.ok) {
                throw new Error(`获取认证失败: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('获取认证URL成功:', data.url);
            return data.url;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                throw new Error('获取认证超时，请稍后重试');
            }
            console.error('获取认证URL失败:', error);
            throw error;
        }
    }

    async startIAT(onResult, onEnd, onError) {
        try {
            const url = await this._getAuthUrl('iat');
            this.iatResult = '';
            this.iatWs = new WebSocket(url);

            return new Promise((resolve) => {
                this.iatWs.onopen = () => {
                    console.log('[XunfeiIAT] Connected');
                    resolve(true);
                };

                this.iatWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.code !== 0) {
                            console.error('[XunfeiIAT] Error:', data.code, data.message);
                            if (onError) onError(new Error(data.message || `IAT错误(${data.code})`));
                            return;
                        }
                        const parsed = this._parseIATResult(data);
                        if (parsed) {
                            this.iatResult = parsed.fullText || this.iatResult;
                            if (onResult) onResult(parsed);
                        }
                        if (data.data && data.data.status === 2) {
                            console.log('[XunfeiIAT] Final result:', this.iatResult);
                            if (onEnd) onEnd(this.iatResult);
                        }
                    } catch (e) {
                        console.error('[XunfeiIAT] Parse error:', e);
                    }
                };

                this.iatWs.onerror = () => {
                    console.error('[XunfeiIAT] WebSocket error');
                    if (onError) onError(new Error('语音识别连接失败'));
                    resolve(false);
                };

                this.iatWs.onclose = () => {
                    console.log('[XunfeiIAT] Closed');
                    this.iatWs = null;
                };

                setTimeout(() => resolve(false), 5000);
            });
        } catch (e) {
            console.error('[XunfeiIAT] Start failed:', e);
            if (onError) onError(e);
            return false;
        }
    }

    sendIATFirstFrame() {
        if (!this.iatWs || this.iatWs.readyState !== WebSocket.OPEN) return;
        const frame = {
            common: { app_id: this.appId },
            business: {
                language: 'en',
                domain: 'iat',
                accent: 'en_us',
                vad_eos: 3000,
                dwa: 'wpgs'
            },
            data: {
                status: 0,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: ''
            }
        };
        this.iatWs.send(JSON.stringify(frame));
    }

    sendIATAudio(audioBase64, status) {
        if (!this.iatWs || this.iatWs.readyState !== WebSocket.OPEN) return;
        const frame = {
            data: {
                status: status,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: audioBase64
            }
        };
        this.iatWs.send(JSON.stringify(frame));
    }

    stopIAT() {
        if (this.iatWs && this.iatWs.readyState === WebSocket.OPEN) {
            this.sendIATAudio('', 2);
            setTimeout(() => {
                if (this.iatWs) {
                    this.iatWs.close();
                    this.iatWs = null;
                }
            }, 1000);
        } else {
            this.iatWs = null;
        }
    }

    _parseIATResult(data) {
        if (!data.data || !data.data.result) return null;
        const result = data.data.result;
        const ws = result.ws;
        if (!ws) return null;

        let text = '';
        for (const w of ws) {
            for (const cw of w.cw) {
                text += cw.w;
            }
        }

        const pgs = result.pgs;
        if (pgs === 'apd') {
            this.iatResult += text;
        } else if (pgs === 'rpl') {
            const rg = result.rg;
            if (rg && rg[0] !== undefined && rg[1] !== undefined) {
                const before = this.iatResult.substring(0, rg[0]);
                this.iatResult = before + text;
            } else {
                this.iatResult = text;
            }
        } else {
            this.iatResult = text;
        }

        return {
            text: text,
            fullText: this.iatResult,
            isFinal: data.data.status === 2
        };
    }

    startRecording() {
        console.log('开始录音...');
        return new Promise((resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                reject(new Error('浏览器不支持录音功能'));
                return;
            }

            let mediaStream = null;
            let audioCtx = null;
            let processor = null;
            let pcmBuffers = [];
            let recording = true;

            navigator.mediaDevices.getUserMedia({
                audio: { 
                    channelCount: 1, 
                    echoCancellation: true, 
                    noiseSuppression: true 
                }
            }).then(stream => {
                mediaStream = stream;
                console.log('麦克风权限获取成功');

                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioCtx.state === 'suspended') {
                        audioCtx.resume();
                    }
                    console.log('AudioContext创建成功，采样率:', audioCtx.sampleRate);

                    const source = audioCtx.createMediaStreamSource(stream);
                    processor = audioCtx.createScriptProcessor(4096, 1, 1);

                    const silentGain = audioCtx.createGain();
                    silentGain.gain.value = 0;
                    source.connect(processor);
                    processor.connect(silentGain);
                    silentGain.connect(audioCtx.destination);

                    const nativeRate = audioCtx.sampleRate;

                    processor.onaudioprocess = (e) => {
                        if (!recording) return;
                        const inputData = e.inputBuffer.getChannelData(0);
                        const resampled = XunfeiSpeech.resampleBuffer(inputData, nativeRate, 16000);
                        const int16Data = XunfeiSpeech.float32ToInt16(resampled);
                        pcmBuffers.push(new Int16Array(int16Data));

                        const outputData = e.outputBuffer.getChannelData(0);
                        for (let i = 0; i < outputData.length; i++) {
                            outputData[i] = 0;
                        }
                    };

                    resolve({
                        stop: () => {
                            return new Promise((stopResolve, stopReject) => {
                                try {
                                    console.log('停止录音...');
                                    recording = false;

                                    if (processor) {
                                        processor.disconnect();
                                    }
                                    if (audioCtx) {
                                        audioCtx.close();
                                    }
                                    if (mediaStream) {
                                        mediaStream.getTracks().forEach(t => t.stop());
                                    }

                                    console.log('录音停止成功，PCM数据长度:', pcmBuffers.length);

                                    const mergedPcm = new Int16Array(
                                        pcmBuffers.reduce((acc, arr) => acc + arr.length, 0)
                                    );
                                    let offset = 0;
                                    for (const arr of pcmBuffers) {
                                        mergedPcm.set(arr, offset);
                                        offset += arr.length;
                                    }

                                    const wavBlob = XunfeiSpeech.createWavBlob(mergedPcm, 16000);
                                    console.log('WAV文件创建成功，大小:', wavBlob.size, 'bytes');

                                    stopResolve({
                                        pcmData: mergedPcm,
                                        wavBlob: wavBlob,
                                        sampleRate: 16000
                                    });
                                } catch (error) {
                                    console.error('停止录音失败:', error);
                                    stopReject(error);
                                }
                            });
                        }
                    });
                } catch (error) {
                    console.error('录音初始化失败:', error);
                    if (mediaStream) {
                        mediaStream.getTracks().forEach(t => t.stop());
                    }
                    reject(error);
                }
            }).catch(error => {
                console.error('获取麦克风权限失败:', error);
                reject(error);
            });
        });
    }

    blobToBase64(blob) {
        console.log('将WAV文件转为Base64...');
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                console.log('Base64转换成功，长度:', base64.length);
                resolve(base64);
            };
            reader.onerror = (error) => {
                console.error('Base64转换失败:', error);
                reject(error);
            };
            reader.readAsDataURL(blob);
        });
    }

    async evaluateISE(referenceText, audioBase64) {
        console.log('开始语音评测...');
        console.log('评测文本:', referenceText);
        console.log('音频Base64长度:', audioBase64.length);

        return new Promise(async (resolve, reject) => {
            try {
                const url = await this._getAuthUrl('ise');
                console.log('ISE连接URL:', url);

                this.iseResultParts = [];
                this.iseWs = new WebSocket(url);

                let resolved = false;

                const doResolve = (val) => {
                    if (!resolved) {
                        resolved = true;
                        resolve(val);
                    }
                };

                const doReject = (err) => {
                    if (!resolved) {
                        resolved = true;
                        reject(err);
                    }
                };

                this.iseWs.onopen = () => {
                    console.log('[ISE] WebSocket连接成功');
                    
                    const textWithBom = '\uFEFF' + referenceText;
                    const firstFrame = {
                        common: {
                            app_id: this.appId
                        },
                        business: {
                            category: 'read_sentence',
                            rstcd: 'utf8',
                            group: 'pupil',
                            sub: 'ise',
                            ent: 'en_vip',
                            tte: 'utf-8',
                            cmd: 'ssb',
                            auf: 'audio/L16;rate=16000',
                            aus: 1,
                            aue: 'raw',
                            text: textWithBom,
                            ttp_skip: true,
                            ise_unite: '1',
                            rst: 'entirety',
                            extra_ability: 'multi_dimension'
                        },
                        data: {
                            status: 0,
                            data: ''
                        }
                    };

                    console.log('[ISE] 发送第一帧(ssb)，文本:', referenceText);
                    this.iseWs.send(JSON.stringify(firstFrame));

                    setTimeout(() => {
                        this._sendISEAudio(audioBase64);
                    }, 500);
                };

                this.iseWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('[ISE] 收到消息，code:', data.code, 'status:', data.data?.status, 'data长度:', data.data?.data?.length || 0);

                        if (data.code !== 0) {
                            console.error('[ISE] API错误:', data.code, data.message);
                            doReject(new Error(`ISE错误(${data.code}): ${data.message}`));
                            this.iseWs.close();
                            return;
                        }

                        if (data.data && data.data.data) {
                            this.iseResultParts.push(data.data.data);
                            console.log('[ISE] 结果片段累计:', this.iseResultParts.length, '总长度:', this.iseResultParts.join('').length);
                        }

                        if (data.data && data.data.status === 2) {
                            console.log('[ISE] 收到最终结果，片段数:', this.iseResultParts.length);
                            const fullResult = this.iseResultParts.join('');
                            const parsed = this._parseISEResult(fullResult);
                            console.log('[ISE] 评测结果:', JSON.stringify(parsed));
                            doResolve(parsed);
                            this.iseWs.close();
                        }
                    } catch (e) {
                        console.error('[ISE] 解析消息失败:', e);
                        doReject(e);
                    }
                };

                this.iseWs.onerror = (error) => {
                    console.error('[ISE] WebSocket错误:', error);
                    doReject(new Error('语音评测连接失败'));
                };

                this.iseWs.onclose = (event) => {
                    console.log('[ISE] WebSocket关闭，code:', event.code, 'reason:', event.reason);
                    this.iseWs = null;
                    
                    if (!resolved) {
                        if (this.iseResultParts.length > 0) {
                            console.log('[ISE] 连接关闭但有部分结果，尝试解析');
                            const fullResult = this.iseResultParts.join('');
                            const parsed = this._parseISEResult(fullResult);
                            doResolve(parsed);
                        } else {
                            doReject(new Error('语音评测连接关闭，未收到结果'));
                        }
                    }
                };

                setTimeout(() => {
                    if (!resolved) {
                        console.error('ISE评测超时');
                        doReject(new Error('语音评测超时'));
                        if (this.iseWs) {
                            this.iseWs.close();
                        }
                    }
                }, 30000);
            } catch (e) {
                console.error('评测过程错误:', e);
                reject(e);
            }
        });
    }

    async _sendISEAudio(audioBase64) {
        if (!this.iseWs || this.iseWs.readyState !== WebSocket.OPEN) {
            console.error('[ISE] WebSocket未连接，无法发送音频');
            return;
        }

        console.log('[ISE] 开始发送音频数据...');
        const chunkSize = 2560;
        const totalChunks = Math.ceil(audioBase64.length / chunkSize);
        console.log('[ISE] 音频总块数:', totalChunks, 'Base64总长度:', audioBase64.length);

        for (let i = 0; i < totalChunks; i++) {
            if (!this.iseWs || this.iseWs.readyState !== WebSocket.OPEN) {
                console.error('[ISE] WebSocket已断开，停止发送');
                break;
            }

            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, audioBase64.length);
            const chunk = audioBase64.substring(start, end);
            const isLast = i === totalChunks - 1;

            const frame = {
                business: {
                    cmd: 'auw',
                    aus: isLast ? 4 : (i === 0 ? 1 : 2),
                    aue: 'raw'
                },
                data: {
                    status: isLast ? 2 : 1,
                    data: chunk
                }
            };

            this.iseWs.send(JSON.stringify(frame));
            console.log('[ISE] 发送音频块:', i + 1, '/', totalChunks,
                'aus:', frame.business.aus, 'status:', frame.data.status,
                isLast ? '(最后一块)' : '');

            if (!isLast) {
                await new Promise(r => setTimeout(r, 40));
            }
        }

        console.log('[ISE] 音频发送完成');
    }

    _parseISEResult(base64Str) {
        try {
            if (!base64Str || base64Str.length === 0) {
                console.warn('[ISE] 结果为空');
                return null;
            }

            console.log('[ISE] 解析XML结果，Base64长度:', base64Str.length);
            const xmlStr = atob(base64Str);
            console.log('[ISE] XML长度:', xmlStr.length);
            console.log('[ISE] XML前200字符:', xmlStr.substring(0, 200));

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('[ISE] XML解析错误:', parseError.textContent);
                return null;
            }

            let scoreEl = xmlDoc.querySelector('read_chapter');
            if (!scoreEl) {
                scoreEl = xmlDoc.querySelector('read_sentence');
            }
            if (!scoreEl) {
                const recPaper = xmlDoc.querySelector('rec_paper');
                if (recPaper) {
                    scoreEl = recPaper.querySelector('read_chapter') || recPaper.querySelector('read_sentence');
                }
            }

            if (!scoreEl) {
                console.error('[ISE] 无法找到评分元素，XML结构:', xmlStr.substring(0, 500));
                return null;
            }

            const totalScore = parseFloat(scoreEl.getAttribute('total_score') || '0');
            const accuracyScore = parseFloat(scoreEl.getAttribute('accuracy_score') || '0');
            const fluencyScore = parseFloat(scoreEl.getAttribute('fluency_score') || '0');
            const integrityScore = parseFloat(scoreEl.getAttribute('integrity_score') || '0');
            const standardScore = parseFloat(scoreEl.getAttribute('standard_score') || '0');
            const isRejected = scoreEl.getAttribute('is_rejected') === 'true';
            const exceptInfo = scoreEl.getAttribute('except_info') || '';

            console.log('[ISE] 评分 - total:', totalScore, 'accuracy:', accuracyScore,
                'fluency:', fluencyScore, 'integrity:', integrityScore,
                'standard:', standardScore, 'rejected:', isRejected, 'except:', exceptInfo);

            const wordAnalysis = [];
            const wordElements = xmlDoc.querySelectorAll('word');
            wordElements.forEach(wordEl => {
                const content = wordEl.getAttribute('content') || '';
                const dpMessage = parseInt(wordEl.getAttribute('dp_message') || '0');
                const wordScore = parseFloat(wordEl.getAttribute('total_score') || '0');

                let status = 'correct';
                if (dpMessage === 16) status = 'missed';
                else if (dpMessage === 32) status = 'wrong';
                else if (dpMessage === 128) status = 'wrong';
                else if (dpMessage !== 0) status = 'wrong';

                wordAnalysis.push({
                    word: content,
                    status: status,
                    score: wordScore,
                    dpMessage: dpMessage
                });
            });

            return {
                accuracy: Math.round(accuracyScore),
                fluency: Math.round(fluencyScore),
                standard: Math.round(standardScore),
                overall: Math.round(totalScore),
                integrity: Math.round(integrityScore),
                wordAnalysis: wordAnalysis,
                feedback: '',
                isRejected: isRejected,
                exceptInfo: exceptInfo
            };
        } catch (e) {
            console.error('[ISE] 解析结果错误:', e);
            return null;
        }
    }

    static resampleBuffer(float32Array, fromRate, toRate) {
        if (fromRate === toRate) return float32Array;
        const ratio = fromRate / toRate;
        const newLength = Math.round(float32Array.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, float32Array.length - 1);
            const fraction = srcIndex - srcIndexFloor;
            result[i] = float32Array[srcIndexFloor] * (1 - fraction) + float32Array[srcIndexCeil] * fraction;
        }
        return result;
    }

    static float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }

    static int16ArrayToBase64(int16Array) {
        const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
        const chunkSize = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    static createWavBlob(pcmInt16Array, sampleRate) {
        const buffer = new ArrayBuffer(44 + pcmInt16Array.length * 2);
        const view = new DataView(buffer);

        const writeStr = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + pcmInt16Array.length * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, pcmInt16Array.length * 2, true);

        for (let i = 0; i < pcmInt16Array.length; i++) {
            view.setInt16(44 + i * 2, pcmInt16Array[i], true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }
}

window.XunfeiSpeech = XunfeiSpeech;
