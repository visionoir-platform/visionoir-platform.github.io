/** Uncompressed AIFF and FLAC verbatim subframes with streamable checksums. */
const tag = (b, n, s) => {
  for (let i = 0; i < s.length; i++) b[n + i] = s.charCodeAt(i);
};
export function aiffHeader({ channels, bits, sampleRate, frames }) {
  const bytes = frames * channels * (bits / 8);
  if (bytes > 0xffffffff - 64) throw Error('export.riffLimit');
  const b = new Uint8Array(54),
    v = new DataView(b.buffer);
  tag(b, 0, 'FORM');
  v.setUint32(4, bytes + (bytes % 2) + 46);
  tag(b, 8, 'AIFFCOMM');
  v.setUint32(16, 18);
  v.setUint16(20, channels);
  v.setUint32(22, frames);
  v.setUint16(26, bits);
  const power = Math.floor(Math.log2(sampleRate));
  v.setUint16(28, 16383 + power);
  v.setBigUint64(30, BigInt(sampleRate) << BigInt(63 - power));
  tag(b, 38, 'SSND');
  v.setUint32(42, bytes + 8);
  return b;
}
export function bigPCM(data, bits) {
  const size = bits / 8;
  for (let i = 0; i < data.length; i += size) {
    const x = data[i];
    data[i] = data[i + size - 1];
    data[i + size - 1] = x;
  }
  return data;
}
export function flacHeader({ channels, bits, sampleRate, frames }) {
  const b = new Uint8Array(42),
    v = new DataView(b.buffer);
  tag(b, 0, 'fLaC');
  b[4] = 128;
  b[7] = 34;
  v.setUint16(8, 16);
  v.setUint16(10, 8192);
  v.setBigUint64(
    18,
    (BigInt(sampleRate) << 44n) |
      (BigInt(channels - 1) << 41n) |
      (BigInt(bits - 1) << 36n) |
      BigInt(frames),
  );
  return b;
}
function utf8Integer(n) {
  if (n < 128) return [n];
  let length = 2;
  while (n >= 2 ** (5 * length + 1)) length++;
  const bytes = Array(length);
  for (let i = length - 1; i > 0; i--) {
    bytes[i] = 128 + (n % 64);
    n = Math.floor(n / 64);
  }
  bytes[0] = ((255 << (8 - length)) & 255) | n;
  return bytes;
}
const table8 = Uint8Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n << 1) ^ (n & 128 ? 7 : 0);
  return n & 255;
});
const table16 = Uint16Array.from({ length: 256 }, (_, n) => {
  n <<= 8;
  for (let k = 0; k < 8; k++) n = (n << 1) ^ (n & 32768 ? 0x8005 : 0);
  return n & 65535;
});
export function flacFrame(pcm, bits, channels, size, pos) {
  const num = utf8Integer(pos),
    header = [
      255,
      249,
      112,
      ((channels - 1) << 4) | (bits === 16 ? 8 : 12),
      ...num,
      (size - 1) >> 8,
      (size - 1) & 255,
    ];
  let check = 0;
  for (const byte of header) check = table8[check ^ byte];
  header.push(check);
  const output = new Uint8Array(header.length + channels + pcm.length + 2);
  output.set(header);
  const width = bits / 8;
  let k = header.length;
  for (let c = 0; c < channels; c++) {
    output[k++] = 2;
    for (let n = 0; n < size; n++) {
      const src = (n * channels + c) * width;
      for (let j = width - 1; j >= 0; j--) output[k++] = pcm[src + j];
    }
  }
  let crc = 0;
  for (let i = 0; i < k; i++) crc = ((crc << 8) & 65535) ^ table16[(crc >> 8) ^ output[i]];
  output[k++] = crc >> 8;
  output[k] = crc;
  return output;
}
