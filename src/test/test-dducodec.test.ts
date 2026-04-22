import { Readable } from "stream";
import { describe, expect, it } from "vitest";
import {
  Ddu64,
  DduCodec,
  DduCompatibilityError,
  DduSetSymbol,
  createEncodeStream,
} from "../index.js";

async function collectEncoded(stream: NodeJS.ReadWriteStream, input: Buffer | string): Promise<string> {
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    Readable.from([typeof input === "string" ? Buffer.from(input) : input])
      .pipe(stream)
      .on("data", (chunk: Buffer | string) => chunks.push(chunk.toString()))
      .on("end", resolve)
      .on("error", reject);
  });
  return chunks.join("");
}

async function collectDecoded(
  stream: NodeJS.ReadWriteStream,
  input: string
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    Readable.from([Buffer.from(input)])
      .pipe(stream)
      .on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      .on("end", resolve)
      .on("error", reject);
  });
  return Buffer.concat(chunks);
}

describe("DduCodec", () => {
  it("should be available from the package root and round-trip DDU3 payloads", () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const encoded = codec.encode("hello codec");

    expect(encoded).toContain("DDU3;");
    expect(codec.decode(encoded)).toBe("hello codec");
    expect(codec.inspect("hello codec").wireFormat).toBe("DDU3");
    expect(codec.getCodecInfo().wireFormat.block).toBe("DDU3");
    expect(codec.getCodecInfo().wireFormat.stream).toBe("DDS3");
  });

  it("should decode legacy urlSafe payloads in explicit mode", () => {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");

    const legacy = new Ddu64(charset, "=", {
      urlSafe: true,
      throwOnError: true,
    });
    const codec = new DduCodec({
      charset,
      padding: "=",
      defaults: { urlSafe: true },
    });

    const encoded = legacy.encode("legacy url safe payload");

    expect(codec.decode(encoded)).toBe("legacy url safe payload");
  });

  it('should reject legacy payloads when legacyDecode is "off"', () => {
    const legacy = new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.ONECHARSET,
      throwOnError: true,
    });
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      compatibility: { legacyDecode: "off" },
    });

    const encoded = legacy.encode("legacy payload");

    expect(() => codec.decode(encoded)).toThrow(DduCompatibilityError);
    expect(() => codec.decode(encoded)).toThrow(/legacyDecode="off"/);
  });

  it("should emit native DDS3 stream payloads and decode them back", async () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: {
        compression: {
          enabled: true,
          algorithm: "deflate",
          level: 6,
        },
        encryptionKey: "secret-key",
      },
    });

    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from("stream payload ".repeat(2048))])
        .pipe(codec.createEncodeStream())
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const encoded = encodedChunks.join("");
    const pad = codec.getCodecInfo().paddingChar;

    expect(encoded.startsWith(`${pad}DDS3D1${pad}`)).toBe(true);

    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encoded)])
        .pipe(codec.createDecodeStream())
        .on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(chunks).toString("utf-8")).toBe("stream payload ".repeat(2048));
  });

  it("should keep legacy stream decode fallback when policy allows it", async () => {
    const legacy = new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.ONECHARSET,
      compress: true,
      compressionAlgorithm: "brotli",
      throwOnError: true,
    });
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      compatibility: { legacyDecode: "explicit" },
    });

    const encodedChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from("legacy stream payload ".repeat(1024))])
        .pipe(createEncodeStream(legacy))
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""))])
        .pipe(codec.createDecodeStream())
        .on("data", (chunk: Buffer) => decodedChunks.push(Buffer.from(chunk)))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).toString("utf-8")).toBe(
      "legacy stream payload ".repeat(1024)
    );
  });

  it('should reject legacy stream payloads when stream legacyDecode is "off"', async () => {
    const legacy = new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.ONECHARSET,
      throwOnError: true,
    });
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      compatibility: { legacyDecode: "off" },
    });

    const encodedChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from("legacy stream payload")])
        .pipe(createEncodeStream(legacy))
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    await expect(
      new Promise<void>((resolve, reject) => {
        Readable.from([Buffer.from(encodedChunks.join(""))])
          .pipe(codec.createDecodeStream())
          .on("data", () => {})
          .on("end", resolve)
          .on("error", reject);
      })
    ).rejects.toThrow(/legacyDecode="off"/);
  });

  it("should reject malformed DDU3 block compression metadata", () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const encoded = codec.encode("bad footer");
    const malformed = encoded.replace(";N;0;", ";X;0;");

    expect(() => codec.decode(malformed)).toThrow(/Invalid DDU3 compression code/);
  });

  it("should reject malformed DDU3 checksum metadata", () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: { checksum: true },
    });

    const encoded = codec.encode("checksum payload");
    const malformed = encoded.replace(/crc32:[0-9a-f]{8}/i, "crc32:nothex");

    expect(() => codec.decode(malformed)).toThrow(/Invalid DDU3 checksum field/);
  });

  it("should reject tampered DDU3 checksum values", () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: { checksum: true },
    });

    const encoded = codec.encode("tamper me");
    const tampered = encoded.replace(/([0-9a-f])$/i, (last) => (last.toLowerCase() === "0" ? "1" : "0"));

    expect(() => codec.decode(tampered)).toThrow(/Checksum mismatch/);
  });

  it("should reject encrypted DDU3 payloads when the decode key is missing", () => {
    const encodeCodec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: { encryptionKey: "secret-key" },
    });
    const decodeCodec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const encoded = encodeCodec.encode("encrypted payload");

    expect(() => decodeCodec.decode(encoded)).toThrow(/requires encryptionKey/);
  });

  it("should enforce DDU3 decompression limits", () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: {
        compression: {
          enabled: true,
          algorithm: "brotli",
          level: 11,
        },
      },
      limits: {
        maxDecompressedBytes: 64,
      },
    });

    const encoded = codec.encode("limit test payload ".repeat(200));

    expect(() => codec.decode(encoded)).toThrow(/exceeds limit/i);
  });

  it("should reject malformed DDS3 stream compression metadata", async () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const encoded = await collectEncoded(codec.createEncodeStream(), "stream metadata");
    const malformed = encoded.replace("DDS3N0", "DDS3X0");

    await expect(collectDecoded(codec.createDecodeStream(), malformed)).rejects.toThrow(
      /Invalid DDS3 compression code/
    );
  });

  it("should reject incomplete DDS3 headers", async () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const incomplete = `${codec.getCodecInfo().paddingChar}DDS3`;

    await expect(collectDecoded(codec.createDecodeStream(), incomplete)).rejects.toThrow(
      /Incomplete DDS3 header/
    );
  });

  it("should reject encrypted DDS3 streams when the decode key is missing", async () => {
    const encodeCodec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: { encryptionKey: "secret-key" },
    });
    const decodeCodec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
    });

    const encoded = await collectEncoded(encodeCodec.createEncodeStream(), "secret stream payload");

    await expect(collectDecoded(decodeCodec.createDecodeStream(), encoded)).rejects.toThrow(
      /requires encryptionKey/
    );
  });

  it("should enforce DDS3 decompression limits", async () => {
    const codec = new DduCodec({
      preset: DduSetSymbol.ONECHARSET,
      defaults: {
        compression: {
          enabled: true,
          algorithm: "brotli",
          level: 11,
        },
      },
      limits: {
        maxDecompressedBytes: 64,
      },
    });

    const encoded = await collectEncoded(codec.createEncodeStream(), "stream limit payload ".repeat(200));

    await expect(collectDecoded(codec.createDecodeStream(), encoded)).rejects.toThrow(
      /exceeds limit/i
    );
  });
});
