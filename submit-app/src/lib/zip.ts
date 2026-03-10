const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let j = 0; j < 8; j += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function msDosDateTime(inputDate: Date): { date: number; time: number } {
  const year = Math.max(1980, inputDate.getUTCFullYear());
  const month = inputDate.getUTCMonth() + 1;
  const day = inputDate.getUTCDate();
  const hour = inputDate.getUTCHours();
  const minute = inputDate.getUTCMinutes();
  const second = Math.floor(inputDate.getUTCSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hour << 11) | (minute << 5) | second,
  };
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
  modifiedAt?: Date;
};

export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectoryChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filename = encoder.encode(entry.name);
    const payload = entry.data;
    const crc = crc32(payload);
    const { date, time } = msDosDateTime(entry.modifiedAt ?? new Date());

    const localHeader = new Uint8Array(30 + filename.length);
    writeUInt32LE(localHeader, 0, 0x04034b50);
    writeUInt16LE(localHeader, 4, 20);
    writeUInt16LE(localHeader, 6, 0);
    writeUInt16LE(localHeader, 8, 0);
    writeUInt16LE(localHeader, 10, time);
    writeUInt16LE(localHeader, 12, date);
    writeUInt32LE(localHeader, 14, crc);
    writeUInt32LE(localHeader, 18, payload.length);
    writeUInt32LE(localHeader, 22, payload.length);
    writeUInt16LE(localHeader, 26, filename.length);
    writeUInt16LE(localHeader, 28, 0);
    localHeader.set(filename, 30);

    chunks.push(localHeader, payload);

    const centralHeader = new Uint8Array(46 + filename.length);
    writeUInt32LE(centralHeader, 0, 0x02014b50);
    writeUInt16LE(centralHeader, 4, 20);
    writeUInt16LE(centralHeader, 6, 20);
    writeUInt16LE(centralHeader, 8, 0);
    writeUInt16LE(centralHeader, 10, 0);
    writeUInt16LE(centralHeader, 12, time);
    writeUInt16LE(centralHeader, 14, date);
    writeUInt32LE(centralHeader, 16, crc);
    writeUInt32LE(centralHeader, 20, payload.length);
    writeUInt32LE(centralHeader, 24, payload.length);
    writeUInt16LE(centralHeader, 28, filename.length);
    writeUInt16LE(centralHeader, 30, 0);
    writeUInt16LE(centralHeader, 32, 0);
    writeUInt16LE(centralHeader, 34, 0);
    writeUInt16LE(centralHeader, 36, 0);
    writeUInt32LE(centralHeader, 38, 0);
    writeUInt32LE(centralHeader, 42, offset);
    centralHeader.set(filename, 46);
    centralDirectoryChunks.push(centralHeader);

    offset += localHeader.length + payload.length;
  }

  let centralSize = 0;
  for (const chunk of centralDirectoryChunks) {
    centralSize += chunk.length;
    chunks.push(chunk);
  }

  const end = new Uint8Array(22);
  writeUInt32LE(end, 0, 0x06054b50);
  writeUInt16LE(end, 4, 0);
  writeUInt16LE(end, 6, 0);
  writeUInt16LE(end, 8, entries.length);
  writeUInt16LE(end, 10, entries.length);
  writeUInt32LE(end, 12, centralSize);
  writeUInt32LE(end, 16, offset);
  writeUInt16LE(end, 20, 0);
  chunks.push(end);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }

  return archive;
}
