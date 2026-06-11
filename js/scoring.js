class ScoringEngine {
    constructor() {
        this.recordingStartTime = 0;
        this.recordingDuration = 0;
    }

    startRecordingTimer() {
        this.recordingStartTime = Date.now();
    }

    stopRecordingTimer() {
        this.recordingDuration = (Date.now() - this.recordingStartTime) / 1000;
    }

    calculateBasicScore(referenceText, userText) {
        const refWords = referenceText.toLowerCase().replace(/[.,!?;:'"]/g, '').split(/\s+/);
        const userWords = userText.toLowerCase().replace(/[.,!?;:'"]/g, '').split(/\s+/).filter(w => w.length > 0);

        const alignment = this._alignWords(refWords, userWords);
        const correctCount = alignment.filter(a => a.status === 'correct').length;

        const accuracy = refWords.length > 0 ? Math.round((correctCount / refWords.length) * 100) : 0;

        const idealWPM = 2.5;
        const actualWPM = this.recordingDuration > 0 ? userWords.length / this.recordingDuration : 0;
        const fluencyRatio = Math.min(actualWPM / idealWPM, 1.2);
        const fluency = Math.round(Math.min(fluencyRatio * 100, 100));

        const tone = Math.round(Math.max(50, Math.min(100,
            accuracy * 0.5 + fluency * 0.3 + 20 + (userWords.length > 0 ? Math.min(10, userWords.length * 2) : 0)
        )));

        const overall = Math.round(accuracy * 0.4 + fluency * 0.3 + tone * 0.3);

        return {
            accuracy,
            fluency,
            tone,
            overall,
            wordAnalysis: alignment
        };
    }

    _alignWords(refWords, userWords) {
        const result = [];
        const usedIndices = new Set();

        for (let i = 0; i < refWords.length; i++) {
            const refWord = refWords[i];
            let found = false;

            for (let j = 0; j < userWords.length; j++) {
                if (usedIndices.has(j)) continue;
                if (this._wordsMatch(refWord, userWords[j])) {
                    result.push({ word: refWord, status: 'correct', userWord: userWords[j] });
                    usedIndices.add(j);
                    found = true;
                    break;
                }
            }

            if (!found) {
                let closestMatch = '';
                let closestDist = Infinity;
                for (let j = 0; j < userWords.length; j++) {
                    if (usedIndices.has(j)) continue;
                    const dist = this._levenshtein(refWord, userWords[j]);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestMatch = userWords[j];
                    }
                }

                if (closestDist <= Math.max(2, refWord.length * 0.4) && closestMatch) {
                    const idx = userWords.indexOf(closestMatch);
                    if (idx >= 0 && !usedIndices.has(idx)) {
                        result.push({ word: refWord, status: 'wrong', userWord: closestMatch });
                        usedIndices.add(idx);
                    } else {
                        result.push({ word: refWord, status: 'missed', userWord: '' });
                    }
                } else {
                    result.push({ word: refWord, status: 'missed', userWord: '' });
                }
            }
        }

        return result;
    }

    _wordsMatch(word1, word2) {
        return word1.toLowerCase() === word2.toLowerCase();
    }

    _levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    getFeedback(overall) {
        if (overall >= 90) return '太棒了！你的发音非常标准，继续保持！🌟';
        if (overall >= 75) return '很好！发音不错，再练习几次会更完美！💪';
        if (overall >= 60) return '还不错！多听几遍示范，注意单词的发音细节。👂';
        if (overall >= 40) return '继续加油！建议先听示范朗读，再慢慢跟读。📖';
        return '别灰心！先仔细听几遍示范，然后一个词一个词地练习。🎯';
    }

    getSuggestions(accuracy, fluency, tone, wordAnalysis) {
        const suggestions = [];
        const wrongWords = wordAnalysis.filter(w => w.status === 'wrong' || w.status === 'missed');

        if (accuracy < 70) {
            if (wrongWords.length > 0) {
                const words = wrongWords.map(w => w.word).join(', ');
                suggestions.push(`注意这些词的发音：${words}`);
            }
            suggestions.push('尝试放慢语速，确保每个词都读清楚');
        }

        if (fluency < 70) {
            suggestions.push('多听几遍示范朗读，培养语感');
            suggestions.push('可以先逐词练习，再尝试连贯朗读');
        }

        if (tone < 70) {
            suggestions.push('注意句子的升降调，疑问句句末上扬');
            suggestions.push('模仿示范朗读的节奏和语调');
        }

        return suggestions.length > 0 ? suggestions : ['你的发音已经很好了，继续保持！'];
    }
}

window.ScoringEngine = ScoringEngine;
