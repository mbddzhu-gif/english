const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const CONFIG = {
    proxyUrl: isLocal ? 'http://localhost:3456' : window.location.origin,
    isLocal: isLocal
};

window.APP_CONFIG = CONFIG;
