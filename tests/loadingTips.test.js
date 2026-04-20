const test = require('node:test');
const assert = require('node:assert/strict');

const { createPicker, tips } = require('../constants/loadingTips');

test('loading tips: 100 calls include all tips and no repeats > 3', () => {
  const picker = createPicker();
  const seen = new Set();
  let last = null;
  let repeat = 0;

  for (let i = 0; i < 100; i++) {
    const { text } = picker.next();
    assert.ok(tips.includes(text));
    seen.add(text);
    if (text === last) repeat++;
    else {
      last = text;
      repeat = 1;
    }
    assert.ok(repeat <= 3);
  }

  assert.equal(seen.size, tips.length);
});

