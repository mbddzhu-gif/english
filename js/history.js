class HistoryManager {
    constructor() {
        this.STORAGE_KEY = 'english_learning_history';
        this.MAX_RECORDS = 50;
    }

    saveRecord(record) {
        const records = this.getAllRecords();
        record.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        record.createdAt = new Date().toISOString();
        records.unshift(record);
        if (records.length > this.MAX_RECORDS) {
            records.splice(this.MAX_RECORDS);
        }
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
            return record.id;
        } catch (e) {
            console.error('[History] Save failed:', e);
            if (e.name === 'QuotaExceededError') {
                while (records.length > 10) {
                    records.pop();
                }
                try {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
                    return record.id;
                } catch (e2) {
                    console.error('[History] Retry save failed:', e2);
                }
            }
            return null;
        }
    }

    getAllRecords() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('[History] Load failed:', e);
            return [];
        }
    }

    getRecordById(id) {
        return this.getAllRecords().find(r => r.id === id) || null;
    }

    deleteRecord(id) {
        const records = this.getAllRecords().filter(r => r.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    }

    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
    }

    searchRecords(query) {
        if (!query) return this.getAllRecords();
        const q = query.toLowerCase();
        return this.getAllRecords().filter(r =>
            (r.subject && r.subject.toLowerCase().includes(q)) ||
            (r.category && r.category.toLowerCase().includes(q))
        );
    }

    createRecord(subject, category, imageUrl, phrases, dialogue, errorReport) {
        return {
            subject: subject,
            category: category,
            imageUrl: imageUrl,
            phrases: phrases || [],
            dialogue: dialogue || [],
            errorReport: errorReport || null,
            phraseCount: phrases ? phrases.length : 0,
            dialogueTurns: dialogue ? dialogue.length : 0
        };
    }
}

window.HistoryManager = HistoryManager;
