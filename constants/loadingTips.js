const tips = [
  '麦包正在努力发酵，请稍等...',
  '麦包的AI大脑正在高速运转，火花四溅中...',
  '正在呼叫麦包的英语专家团，请稍候片刻。',
  '麦包AI 正在通过深度视觉模型识别物体...',
  '正在调取麦包AI 核心词库，匹配最佳翻译...',
  '新知识即将开启，请稍候...',
  '麦包AI 正在处理您的学习请求...',
  '正在为您连接 AI学习中心...'
];

function getCrypto() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) return globalThis.crypto;
  try {
    const nodeCrypto = require('crypto');
    if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.getRandomValues) return nodeCrypto.webcrypto;
  } catch (e) {}
  return null;
}

function randomInt(maxExclusive) {
  const c = getCrypto();
  if (!c) return Math.floor(Math.random() * maxExclusive);
  const buf = new Uint32Array(1);
  c.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function createPicker() {
  let bag = [];
  let lastIndex = -1;
  let repeatCount = 0;

  const refill = () => {
    bag = tips.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
  };

  const next = () => {
    if (bag.length === 0) refill();
    let idx = bag.shift();
    let guard = 0;
    while (idx === lastIndex && repeatCount >= 3 && guard < 10) {
      bag.push(idx);
      if (bag.length === 0) refill();
      idx = bag.shift();
      guard++;
    }

    if (idx === lastIndex) repeatCount++;
    else {
      lastIndex = idx;
      repeatCount = 1;
    }

    return { index: idx, text: tips[idx] };
  };

  return { next };
}

const LoadingTips = { tips, createPicker };

if (typeof window !== 'undefined') {
  window.LoadingTips = LoadingTips;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoadingTips;
}

