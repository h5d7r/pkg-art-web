(function (root) {
  "use strict";
  const table = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let i = 0; i < 8; i++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    if (!files.length) throw new Error("There are no images to download.");
    const records = [],
      directory = [];
    let offset = 0,
      directorySize = 0;
    for (const file of files) {
      const name = new TextEncoder().encode(file.name),
        data = file.bytes,
        crc = crc32(data);
      const local = new Uint8Array(30 + name.length),
        l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x800, true);
      l.setUint16(12, 0x21, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length),
        c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x800, true);
      c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true);
      c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.set(name, 46);
      records.push(local, data);
      directory.push(central);
      directorySize += central.length;
      offset += local.length + data.length;
    }
    const end = new Uint8Array(22),
      e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true);
    e.setUint32(16, offset, true);
    return new Blob([...records, ...directory, end], {
      type: "application/zip",
    });
  }
  if (typeof module === "object" && module.exports)
    module.exports = { zip, crc32 };
  else root.PKGZip = { zip };
})(globalThis);
