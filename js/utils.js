class Utils {
    static showToast(message, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, duration);
    }

    static logError(step, error, extra = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            step: step,
            errorType: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            online: navigator.onLine,
            url: window.location.href,
            extra: Object.keys(extra).length > 0 ? extra : undefined
        };

        try {
            const logs = JSON.parse(localStorage.getItem('app_error_logs') || '[]');
            logs.push(entry);
            if (logs.length > 200) logs.splice(0, logs.length - 200);
            localStorage.setItem('app_error_logs', JSON.stringify(logs));
        } catch (e) {}

        console.error(`[ErrorLog][${step}]`, entry.errorMessage, extra);
    }

    static getErrorLogs() {
        try {
            return JSON.parse(localStorage.getItem('app_error_logs') || '[]');
        } catch (e) { return []; }
    }

    static clearErrorLogs() {
        localStorage.removeItem('app_error_logs');
    }

    static repairJSON(str) {
        let s = str.trim();
        const jsonBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlockMatch) s = jsonBlockMatch[1].trim();

        try { const p = JSON.parse(s); if (p && typeof p === 'object') return p; } catch (e) {}

        const jsonMatch = s.match(/\{[\s\S]*/);
        if (!jsonMatch) return null;
        s = jsonMatch[0];

        try { const p = JSON.parse(s); if (p && typeof p === 'object') return p; } catch (e) {}

        let repaired = s;
        let openBraces = 0, openBrackets = 0, inString = false, escape = false;
        for (let i = 0; i < repaired.length; i++) {
            const c = repaired[i];
            if (escape) { escape = false; continue; }
            if (c === '\\') { escape = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') openBraces++;
            if (c === '}') openBraces--;
            if (c === '[') openBrackets++;
            if (c === ']') openBrackets--;
        }

        if (inString) repaired += '"';

        const trailingCommaMatch = repaired.match(/,(\s*)$/);
        if (trailingCommaMatch) repaired = repaired.substring(0, repaired.lastIndexOf(','));

        while (openBrackets > 0) { repaired += ']'; openBrackets--; }
        while (openBraces > 0) { repaired += '}'; openBraces--; }

        try { const p = JSON.parse(repaired); if (p && typeof p === 'object') return p; } catch (e) {}

        return null;
    }

    static compressImage(file, maxWidth = 800, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = (maxWidth / width) * height;
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(base64);
                };
                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    static base64ToFile(base64, filename = 'image.jpg') {
        const arr = base64.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) { u8arr[n] = bstr.charCodeAt(n); }
        return new File([u8arr], filename, { type: mime });
    }

    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = Array.from(document.getElementsByTagName('script')).find(s => s.src && s.src.includes(src));
            if (existing && existing.dataset.loaded === 'true') return resolve(true);

            if (existing) {
                existing.addEventListener('load', () => resolve(true), { once: true });
                existing.addEventListener('error', () => reject(new Error('脚本加载失败')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.loaded = 'false';
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve(true);
            };
            script.onerror = () => reject(new Error('脚本加载失败'));
            document.head.appendChild(script);
        });
    }
}

window.Utils = Utils;
