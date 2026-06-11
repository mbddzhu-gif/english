class PhraseManager {
    constructor(api) {
        this.api = api;
        this.currentPhrases = [];
        this.currentWord = null;
    }

    async generatePhrases(identificationResult) {
        this.currentWord = identificationResult;
        const phrases = await this.api.generatePhrases(
            identificationResult.english,
            identificationResult.category,
            identificationResult.description
        );
        this.currentPhrases = phrases;
        return phrases;
    }

    renderPhrases(container) {
        if (!container) return;
        container.innerHTML = '';

        this.currentPhrases.forEach((phrase, index) => {
            const item = document.createElement('div');
            item.className = 'phrase-item';
            item.innerHTML = `
                <div class="phrase-number">${index + 1}</div>
                <div class="phrase-text">
                    <div class="phrase-english">${phrase.english}</div>
                    <div class="phrase-translation">${phrase.chinese}</div>
                </div>
                <button class="phrase-play" data-index="${index}" title="播放">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
            `;
            container.appendChild(item);
        });
    }

    getPhrase(index) {
        return this.currentPhrases[index] || null;
    }

    getFirstPhrase() {
        return this.currentPhrases.length > 0 ? this.currentPhrases[0] : null;
    }
}

window.PhraseManager = PhraseManager;
