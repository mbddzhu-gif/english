class AuthManager {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.user = JSON.parse(localStorage.getItem('auth_user') || 'null');
        this.config = window.APP_CONFIG || {};
        this.proxyUrl = this.config.proxyUrl || '';
    }

    isLoggedIn() {
        return !!this.token;
    }

    getUser() {
        return this.user;
    }

    async login(phone, password) {
        const response = await fetch(`${this.proxyUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '登录失败');
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        return data;
    }

    async register(phone, nickname, password) {
        const response = await fetch(`${this.proxyUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, nickname, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '注册失败');
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        return data;
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    }

    getAuthHeaders() {
        if (!this.token) return {};
        return { 'Authorization': `Bearer ${this.token}` };
    }

    async logUsage(actionType, subject, detail) {
        if (!this.token) return;
        try {
            await fetch(`${this.proxyUrl}/api/usage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ action_type: actionType, subject, detail })
            });
        } catch (e) {
            console.warn('Usage log failed:', e.message);
        }
    }
}

window.authManager = new AuthManager();
