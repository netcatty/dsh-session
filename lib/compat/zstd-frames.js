// Strict, generation-safe Zstandard concatenated-frame helpers.
//
// DSH session artifacts are concatenated checksummed Zstandard frames (one
// frame per durable batch). Node's zstdDecompressSync decodes only the first
// frame, so the frame boundaries must be computed from each frame header.
// This scanner follows DSH's own layout contract:
//   - magic 0xfd2fb528 (little endian)
//   - reserved frame-header bits must be zero
//   - every block has a 3-byte header, block type 3 is reserved
//   - an optional 4-byte frame checksum follows the last block

import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;

/** Locate complete Zstandard frames; an incomplete final frame is returned
 * separately as `tornStart` and can be ignored by read-only paths. */
export function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('scanZstdFrames expects a Buffer');
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset++);
    if ((descriptor & 0x18) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 0x03;
      const blockSize = blockHeader >>> 3;
      if (blockType === 0x03) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}

/** Decode every complete frame in one concatenated Zstandard artifact. */
export function decompressAllZstdFrames(buffer) {
  const scan = scanZstdFrames(buffer);
  if (scan.frames.length === 0) throw new Error('empty or header-less Zstandard session log');
  const decoded = [];
  for (const frame of scan.frames) {
    decoded.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)));
  }
  return {
    content: Buffer.concat(decoded),
    frameCount: decoded.length,
    torn: scan.tornStart !== undefined,
  };
}

/** Decode only the first complete frame (the header frame DSH writes first). */
export function decompressFirstZstdFrame(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer, 1);
  if (frames.length === 0) {
    throw new Error(tornStart === undefined
      ? 'empty Zstandard session log'
      : 'incomplete Zstandard header frame');
  }
  return zstdDecompressSync(buffer.subarray(frames[0].start, frames[0].end));
}

/** Encode an artifact as the header frame followed by one body frame.
 * Keeping the header alone in the first frame preserves DSH's
 * `readFirstZstdLine` contract and allows cheap header-only listing. */
export function encodeZstdFrames(headerLine, rest) {
  const header = zstdCompressSync(Buffer.from(`${headerLine}\n`, 'utf8'));
  if (rest === '' || rest === undefined) return header;
  const body = zstdCompressSync(Buffer.from(rest, 'utf8'));
  return Buffer.concat([header, body]);
}
