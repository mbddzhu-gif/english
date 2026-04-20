const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const CONFIG = {
    apiHost: 'https://api.minimaxi.com',
    textModel: 'MiniMax-M2.7',
    ttsModel: 'speech-2.8-hd',
    ttsVoice: 'English_Graceful_Lady',
    imageModel: 'image-01',
    proxyUrl: isLocal ? 'http://localhost:3456' : window.location.origin,
    isLocal: isLocal
};

window.APP_CONFIG = CONFIG;
