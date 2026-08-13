/**
 * Minimal ZIP writer (STORE method, no compression).
 *
 * Exists so the math-sdk export can come out as a real folder tree without
 * pulling in a compression dependency — these are a handful of small text
 * files, so storing them uncompressed costs nothing.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time as used in the zip headers. */
function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/**
 * @param {Record<string,string|Uint8Array|ArrayBuffer>} files path -> contents
 * @returns {Blob} a zip archive
 */
export function createZip(files) {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(new Date());
  const entries = [];
  const chunks = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(path);
    const dataBytes = content instanceof Uint8Array
      ? content
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : encoder.encode(String(content));
    const crc = crc32(dataBytes);

    const header = new ArrayBuffer(30);
    const h = new DataView(header);
    h.setUint32(0, 0x04034b50, true);   // local file header signature
    h.setUint16(4, 20, true);           // version needed
    h.setUint16(6, 0x0800, true);       // flags: UTF-8 filename
    h.setUint16(8, 0, true);            // method: store
    h.setUint16(10, time, true);
    h.setUint16(12, day, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, dataBytes.length, true);
    h.setUint32(22, dataBytes.length, true);
    h.setUint16(26, nameBytes.length, true);
    h.setUint16(28, 0, true);           // extra length

    chunks.push(new Uint8Array(header), nameBytes, dataBytes);
    entries.push({ nameBytes, crc, size: dataBytes.length, offset });
    offset += 30 + nameBytes.length + dataBytes.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const header = new ArrayBuffer(46);
    const h = new DataView(header);
    h.setUint32(0, 0x02014b50, true);   // central directory signature
    h.setUint16(4, 20, true);           // version made by
    h.setUint16(6, 20, true);           // version needed
    h.setUint16(8, 0x0800, true);       // flags: UTF-8 filename
    h.setUint16(10, 0, true);           // method: store
    h.setUint16(12, time, true);
    h.setUint16(14, day, true);
    h.setUint32(16, e.crc, true);
    h.setUint32(20, e.size, true);
    h.setUint32(24, e.size, true);
    h.setUint16(28, e.nameBytes.length, true);
    h.setUint16(30, 0, true);           // extra length
    h.setUint16(32, 0, true);           // comment length
    h.setUint16(34, 0, true);           // disk number start
    h.setUint16(36, 0, true);           // internal attributes
    h.setUint32(38, 0, true);           // external attributes
    h.setUint32(42, e.offset, true);    // local header offset

    chunks.push(new Uint8Array(header), e.nameBytes);
    offset += 46 + e.nameBytes.length;
  }

  const eocd = new ArrayBuffer(22);
  const v = new DataView(eocd);
  v.setUint32(0, 0x06054b50, true);     // end of central directory signature
  v.setUint16(4, 0, true);              // this disk
  v.setUint16(6, 0, true);              // disk with central directory
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, offset - cdStart, true);
  v.setUint32(16, cdStart, true);
  v.setUint16(20, 0, true);             // comment length
  chunks.push(new Uint8Array(eocd));

  return new Blob(chunks, { type: 'application/zip' });
}
