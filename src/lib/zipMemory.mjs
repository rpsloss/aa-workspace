/** In-memory ZIP (STORE). Never writes entries to disk. */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dt = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dt };
}

function asBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data == null) return Buffer.alloc(0);
  return Buffer.from(String(data), "utf8");
}

/**
 * @param {{ name: string, data: Buffer | string }[]} entries
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of list) {
    const name = String(entry?.name || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || name.endsWith("/")) continue;
    const filename = Buffer.from(name, "utf8");
    const payload = asBuffer(entry.data);
    const crc = crc32(payload);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(filename.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(payload.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, filename, payload);
    centrals.push(central, filename);
    offset += local.length + filename.length + payload.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  const count = list.filter((entry) => {
    const name = String(entry?.name || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return name && !name.endsWith("/");
  }).length;
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, eocd]);
}

function findEocd(buf) {
  const min = 22;
  if (!Buffer.isBuffer(buf) || buf.length < min) return -1;
  const start = Math.max(0, buf.length - min - 0xffff);
  for (let i = buf.length - min; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      const commentLen = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buf.length) return i;
    }
  }
  return -1;
}

export function unzipEntries(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  const out = [];
  let pos = centralOffset;
  const centralEnd = centralOffset + centralSize;
  for (let i = 0; i < count && pos + 46 <= centralEnd; i += 1) {
    if (buf.readUInt32LE(pos) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(pos + 10);
    const compressed = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) {
      out.push({ name, data: Buffer.alloc(0) });
      continue;
    }
    if (localOffset + 30 > buf.length) continue;
    if (buf.readUInt32LE(localOffset) !== LOCAL_SIG) continue;
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtra = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtra;
    const data = buf.subarray(dataStart, dataStart + compressed);
    out.push({ name, data: Buffer.from(data) });
  }
  return out;
}

export function unzipNames(buf) {
  return unzipEntries(buf).map((row) => row.name);
}

export function unzipFile(buf, name) {
  const want = String(name || "");
  const hit = unzipEntries(buf).find((row) => row.name === want);
  return hit ? hit.data : null;
}
