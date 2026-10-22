// Reproducible, locally generated alert tone; no external audio/licence dependency.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rate = 16000;
const duration = 2.4;
const count = Math.round(rate * duration);
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const t = i / rate;
  const beat = t % 1.2;
  const start = beat < 0.28 ? 0 : beat >= 0.38 && beat < 0.66 ? 0.38 : -1;
  let value = 0;
  if (start >= 0) {
    const elapsed = beat - start;
    const fade = Math.min(1, elapsed / 0.025, (0.28 - elapsed) / 0.025);
    value = 0.23 * Math.max(0, fade) * Math.sin(2 * Math.PI * (start === 0 ? 620 : 820) * t);
  }
  wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}
const directory = new URL('../public/audio/', import.meta.url);
mkdirSync(fileURLToPath(directory), { recursive: true });
writeFileSync(new URL('sos-alert.wav', directory), wav);
console.log(`Generated sos-alert.wav: ${wav.length} bytes, mono PCM16, ${duration}s`);
