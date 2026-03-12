// CRC32 table for building zip archives without external deps
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let c = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

export function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

function dosDateTime(ts = Date.now()) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const secs = Math.floor(d.getSeconds() / 2);
  const dosTime = (hours << 11) | (mins << 5) | secs;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

export function buildZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const { dosTime, dosDate } = dosDateTime(entry.modTime || Date.now());
    const crc = crc32(data);
    const compSize = data.length;
    const uncompSize = data.length;
    const localHeader = new Uint8Array(30);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (0 = store)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, compSize, true);
    view.setUint32(22, uncompSize, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length

    localParts.push(localHeader, nameBytes, data);
    const localHeaderSize = localHeader.length + nameBytes.length;

    const centralHeader = new Uint8Array(46);
    const cview = new DataView(centralHeader.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true); // version made by
    cview.setUint16(6, 20, true); // version needed
    cview.setUint16(8, 0, true); // flags
    cview.setUint16(10, 0, true); // compression
    cview.setUint16(12, dosTime, true);
    cview.setUint16(14, dosDate, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, compSize, true);
    cview.setUint32(24, uncompSize, true);
    cview.setUint16(28, nameBytes.length, true);
    cview.setUint16(30, 0, true); // extra len
    cview.setUint16(32, 0, true); // comment len
    cview.setUint16(34, 0, true); // disk number
    cview.setUint16(36, 0, true); // internal attrs
    cview.setUint32(38, 0, true); // external attrs
    cview.setUint32(42, offset, true); // local header offset

    centralParts.push(centralHeader, nameBytes);
    offset += localHeaderSize + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  const eview = new DataView(eocd.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(4, 0, true); // disk num
  eview.setUint16(6, 0, true); // start disk
  eview.setUint16(8, entries.length, true);
  eview.setUint16(10, entries.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, centralOffset, true);
  eview.setUint16(20, 0, true); // comment len

  const totalSize = offset + centralSize + eocd.length;
  const zip = new Uint8Array(totalSize);
  let cursor = 0;
  localParts.forEach((part) => {
    zip.set(part, cursor);
    cursor += part.length;
  });
  centralParts.forEach((part) => {
    zip.set(part, cursor);
    cursor += part.length;
  });
  zip.set(eocd, cursor);
  return zip;
}

