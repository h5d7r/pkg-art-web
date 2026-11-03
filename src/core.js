/* Bounded PS4 PKG reads. No package data is uploaded. */
(function (root) {
  "use strict";
  const HEADER_SIZE = 0x80;
  const MAX_ENTRY_COUNT = 65536;
  const MAX_IMAGE_SIZE = 32 * 1024 * 1024;
  const MAX_PREFIX = 32 * 1024 * 1024;
  const ARTWORK = Object.freeze([
    { id: 0x1200, kind: "icon0", name: "icon0.png", role: "Package icon" },
    { id: 0x1220, kind: "pic0", name: "pic0.png", role: "Background image" },
    { id: 0x1006, kind: "pic1", name: "pic1.png", role: "Splash image" },
  ]);
  const decoder = new TextDecoder();
  function checkAbort(signal) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  }
  function checkSpan(offset, length, size = null) {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length <= 0 ||
      !Number.isSafeInteger(offset + length) ||
      (size !== null && offset + length > size)
    ) {
      throw new Error(
        "The package is incomplete or contains an invalid file offset. Choose a complete PKG file.",
      );
    }
  }
  function string(bytes) {
    const end = bytes.indexOf(0);
    return decoder.decode(end < 0 ? bytes : bytes.subarray(0, end));
  }
  class LocalReader {
    constructor(file, signal) {
      this.file = file;
      this.signal = signal;
      this.size = file.size;
      this.bytesRead = 0;
    }
    async read(offset, length) {
      checkAbort(this.signal);
      checkSpan(offset, length, this.size);
      const result = new Uint8Array(
        await this.file.slice(offset, offset + length).arrayBuffer(),
      );
      checkAbort(this.signal);
      if (result.length !== length)
        throw new Error(
          "The selected file could not be read completely. Select it again.",
        );
      this.bytesRead += result.length;
      return result;
    }
  }
  class RemoteReader {
    constructor(url, signal) {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error(
          "Enter a direct HTTP or HTTPS download link without embedded login details.",
        );
      }
      this.url = parsed.href;
      this.signal = signal;
      this.size = null;
      this.bytesRead = 0;
      this.mode = null;
      this.validator = null;
      this.prefix = null;
    }
    async read(offset, length) {
      checkAbort(this.signal);
      checkSpan(offset, length, this.size);
      if (this.prefix && offset + length <= this.prefix.length)
        return this.prefix.slice(offset, offset + length);
      if (this.mode === "prefix") {
        throw new Error(
          "This host does not support range requests and the artwork lies outside the safe preview limit. Download the PKG and use Local file.",
        );
      }
      const controller = new AbortController();
      const abort = () => controller.abort(this.signal.reason);
      this.signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(
        () =>
          controller.abort(
            new DOMException(
              "The host took too long to respond. Try again or use a local file.",
              "TimeoutError",
            ),
          ),
        30000,
      );
      try {
        const headers = { Range: `bytes=${offset}-${offset + length - 1}` };
        const response = await fetch(this.url, {
          headers,
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok)
          throw new Error(
            `The host returned HTTP ${response.status}. Check the link or choose a local file.`,
          );
        if (![200, 206].includes(response.status))
          throw new Error(
            "The host did not return a usable file response. Use a direct PKG link.",
          );
        const validator =
          response.headers.get("ETag") || response.headers.get("Last-Modified");
        if (this.validator && validator && this.validator !== validator)
          throw new Error(
            "The remote file changed during loading. Load the package again.",
          );
        if (validator) this.validator = validator;
        if (!response.body)
          throw new Error(
            "This browser cannot stream the remote file. Download it and use Local file.",
          );
        if (response.status === 206) {
          const range = response.headers.get("Content-Range");
          if (!range)
            throw new Error(
              "The host must expose its Content-Range header for safe browser reads. Download the PKG and use Local file.",
            );
          const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(range);
          if (
            !match ||
            Number(match[1]) !== offset ||
            Number(match[2]) !== offset + length - 1
          ) {
            throw new Error(
              "The host returned the wrong part of the file. Download it and use Local file.",
            );
          }
          if (match[3] !== "*") {
            const size = Number(match[3]);
            if (
              !Number.isSafeInteger(size) ||
              size <= Number(match[2]) ||
              (this.size !== null && size !== this.size)
            ) {
              throw new Error(
                "The remote file has an invalid or changing size. Try a different link.",
              );
            }
            this.size = size;
          }
          this.mode = "range";
          return await this.readBody(response.body, length, true);
        }
        if (this.mode === "range")
          throw new Error(
            "The host stopped honoring range requests. Download the PKG and use Local file.",
          );
        const totalHeader = response.headers.get("Content-Length");
        if (
          totalHeader &&
          Number.isSafeInteger(Number(totalHeader)) &&
          Number(totalHeader) > 0
        )
          this.size = Number(totalHeader);
        checkSpan(offset, length, this.size);
        if (offset + length > MAX_PREFIX)
          throw new Error(
            "The host ignores range requests. Download the PKG and use Local file.",
          );
        const target =
          this.size === null ? MAX_PREFIX : Math.min(this.size, MAX_PREFIX);
        this.prefix = await this.readBody(response.body, target, false);
        this.mode = "prefix";
        if (offset + length > this.prefix.length)
          throw new Error(
            "The remote PKG file is incomplete. Choose another link.",
          );
        return this.prefix.slice(offset, offset + length);
      } catch (error) {
        if (this.signal?.aborted)
          throw new DOMException("Cancelled", "AbortError");
        if (controller.signal.aborted) throw controller.signal.reason;
        if (error instanceof TypeError)
          throw new Error(
            "Could not access the link. The host may block browser access (CORS), require login, or be offline. Download the PKG and use Local file.",
          );
        throw error;
      } finally {
        controller.abort();
        clearTimeout(timer);
        this.signal?.removeEventListener("abort", abort);
      }
    }
    async readBody(body, limit, exact) {
      const reader = body.getReader();
      const chunks = [];
      let received = 0;
      try {
        while (received < limit) {
          checkAbort(this.signal);
          const { done, value } = await reader.read();
          if (done) break;
          this.bytesRead += value.byteLength;
          if (exact && received + value.byteLength > limit)
            throw new Error(
              "The host sent more data than requested. Use a local PKG file.",
            );
          const chunk = value.subarray(0, limit - received);
          chunks.push(chunk);
          received += chunk.byteLength;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (exact && received !== limit)
        throw new Error(
          "The remote file response was cut short. Try loading again.",
        );
      const result = new Uint8Array(received);
      let position = 0;
      for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
      }
      return result;
    }
  }
  function parseHeader(bytes) {
    if (bytes.length < HEADER_SIZE)
      throw new Error(
        "The package header is incomplete. Choose a complete PS4 PKG file.",
      );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== 0x7f434e54) {
      throw new Error(
        "This is not a supported PS4 PKG file. Choose a PS4 .pkg package, rather than a PS3/PS5 package or download page.",
      );
    }
    const count = view.getUint32(0x10),
      tableOffset = view.getUint32(0x18);
    if (!count || count > MAX_ENTRY_COUNT || tableOffset < HEADER_SIZE)
      throw new Error("The package file table is invalid or unsupported.");
    return {
      count,
      tableOffset,
      contentId: string(bytes.subarray(0x40, 0x70)),
    };
  }
  function parseEntries(bytes, count, size) {
    if (bytes.length !== count * 32)
      throw new Error("The package file table is incomplete.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      entries = new Map();
    for (let i = 0; i < count; i++) {
      const p = i * 32,
        id = view.getUint32(p);
      if (entries.has(id))
        throw new Error("The package contains duplicate file entries.");
      const offset = view.getUint32(p + 16),
        length = view.getUint32(p + 20);
      entries.set(id, { id, offset, length });
    }
    return entries;
  }
  function pngInfo(bytes) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (
      bytes.length < 33 ||
      !signature.every((v, i) => bytes[i] === v) ||
      string(bytes.subarray(12, 16)) !== "IHDR"
    ) {
      throw new Error("Artwork is encrypted or is not a readable PNG.");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16),
      height = view.getUint32(20);
    if (
      !width ||
      !height ||
      width > 16384 ||
      height > 16384 ||
      width * height > 40_000_000
    ) {
      throw new Error("Artwork dimensions exceed the safe preview limit.");
    }
    return { width, height };
  }
  function parseSfo(bytes) {
    const info = {};
    if (bytes.length < 20) return info;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (v.getUint32(0, true) !== 0x46535000) return info;
    const keys = v.getUint32(8, true),
      values = v.getUint32(12, true),
      count = v.getUint32(16, true);
    if (count > 4096 || 20 + count * 16 > bytes.length) return info;
    for (let i = 0; i < count; i++) {
      const p = 20 + i * 16,
        keyOffset = keys + v.getUint16(p, true);
      const length = v.getUint32(p + 4, true),
        dataOffset = values + v.getUint32(p + 12, true);
      if (
        keyOffset >= bytes.length ||
        dataOffset + length > bytes.length ||
        length > 4096
      )
        continue;
      const key = string(
        bytes.subarray(keyOffset, Math.min(keyOffset + 128, bytes.length)),
      );
      if (
        ["TITLE", "TITLE_ID", "APP_VER", "CATEGORY"].includes(key) &&
        v.getUint16(p + 2, true) === 0x0204
      )
        info[key] = string(bytes.subarray(dataOffset, dataOffset + length));
    }
    return info;
  }
  async function extract(reader, { signal, onProgress = () => {} } = {}) {
    checkAbort(signal);
    onProgress(5, "Reading package header…");
    const header = parseHeader(await reader.read(0, HEADER_SIZE));
    checkSpan(header.tableOffset, header.count * 32, reader.size);
    onProgress(15, "Reading artwork file entries…");
    const entries = parseEntries(
      await reader.read(header.tableOffset, header.count * 32),
      header.count,
      reader.size,
    );
    const metadata = {};
    const sfo = entries.get(0x1000);
    if (sfo && sfo.length > 0 && sfo.length <= 2 * 1024 * 1024) {
      try {
        Object.assign(
          metadata,
          parseSfo(await reader.read(sfo.offset, sfo.length)),
        );
      } catch (e) {
        if (e.name === "AbortError" || e.name === "TimeoutError") throw e;
      }
    }
    const images = [];
    for (let index = 0; index < ARTWORK.length; index++) {
      checkAbort(signal);
      const art = ARTWORK[index],
        entry = entries.get(art.id);
      onProgress(25 + index * 24, `Reading ${art.name}…`);
      if (!entry || entry.length === 0) {
        images.push({ ...art, state: "missing" });
        continue;
      }
      try {
        if (entry.length > MAX_IMAGE_SIZE)
          throw new Error("Artwork exceeds the 32 MiB safe image limit.");
        checkSpan(entry.offset, entry.length, reader.size);
        const bytes = await reader.read(entry.offset, entry.length);
        images.push({ ...art, ...pngInfo(bytes), bytes, state: "ready" });
      } catch (error) {
        if (error.name === "AbortError" || error.name === "TimeoutError")
          throw error;
        images.push({ ...art, state: "error", error: error.message });
      }
    }
    checkAbort(signal);
    onProgress(100, "Artwork ready.");
    return {
      ...header,
      metadata,
      images,
      size: reader.size,
      bytesRead: reader.bytesRead,
    };
  }
  const api = {
    ARTWORK,
    LocalReader,
    RemoteReader,
    parseHeader,
    parseEntries,
    parseSfo,
    pngInfo,
    extract,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PKGArt = api;
})(globalThis);
