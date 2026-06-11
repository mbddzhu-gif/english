const fs = require('fs');
const path = require('path');

function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signature)) throw new Error('Not a PNG file');
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR') throw new Error('Invalid PNG (missing IHDR)');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

const file = path.join(__dirname, '..', 'assets', 'maibao-logo.png');
const { width, height } = readPngSize(file);
process.stdout.write(`assets/maibao-logo.png: ${width}x${height}\n`);
if (width !== height) process.exitCode = 1;

