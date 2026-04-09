import re

with open("src/utils/crypto.ts", "r") as f:
    content = f.read()

# 1. Add import for Transform
content = content.replace(
    'import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";',
    'import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";\nimport { Transform, TransformCallback } from "stream";'
)

# 2. Remove encryptAes256GcmAsync and decryptAes256GcmAsync
pattern_async_aes = re.compile(
    r'/\*\*\n \* AES-256-GCM 비동기 암호화 \(이벤트 루프 양보\)\n \*/\nexport async function encryptAes256GcmAsync.*?\n\}\n\n/\*\*\n \* AES-256-GCM 비동기 복호화 \(이벤트 루프 양보\)\n \*/\nexport async function decryptAes256GcmAsync.*?\n\}\n',
    re.DOTALL
)
content = pattern_async_aes.sub('', content)

# 3. Remove inflateWithLimitAsync
pattern_async_inflate = re.compile(
    r'/\*\*\n \* 비동기로 크기 제한을 적용하여 zlib 압축을 해제합니다\.\n \*/\nexport async function inflateWithLimitAsync.*?\n\}\n',
    re.DOTALL
)
content = pattern_async_inflate.sub('', content)

# 4. Append GcmEncryptStream and GcmDecryptStream classes
streams_code = """
/**
 * AES-256-GCM 스트림 암호화 (Node.js Transform)
 */
export class GcmEncryptStream extends Transform {
  private cipher: ReturnType<typeof createCipheriv>;

  constructor(keyHash: Buffer) {
    super();
    const iv = randomBytes(12);
    this.cipher = createCipheriv("aes-256-gcm", keyHash, iv);
    this.push(iv);
  }

  _transform(chunk: Buffer, enc: BufferEncoding, cb: TransformCallback) {
    const encrypted = this.cipher.update(chunk);
    if (encrypted.length > 0) this.push(encrypted);
    cb();
  }

  _flush(cb: TransformCallback) {
    try {
      const finalBuf = this.cipher.final();
      if (finalBuf.length > 0) this.push(finalBuf);
      this.push(this.cipher.getAuthTag());
      cb();
    } catch (err) {
      cb(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/**
 * AES-256-GCM 스트림 복호화 (Node.js Transform)
 */
export class GcmDecryptStream extends Transform {
  private keyHash: Buffer;
  private iv: Buffer | null = null;
  private decipher: ReturnType<typeof createDecipheriv> | null = null;
  private tail: Buffer = Buffer.alloc(0);

  constructor(keyHash: Buffer) {
    super();
    this.keyHash = keyHash;
  }

  _transform(chunk: Buffer, enc: BufferEncoding, cb: TransformCallback) {
    this.tail = Buffer.concat([this.tail, chunk]);
    
    if (!this.iv && this.tail.length >= 12) {
      this.iv = this.tail.subarray(0, 12);
      this.decipher = createDecipheriv("aes-256-gcm", this.keyHash, this.iv);
      this.tail = this.tail.subarray(12);
    }
    
    if (this.decipher && this.tail.length > 16) {
      const toProcess = this.tail.length - 16;
      const processBuf = this.tail.subarray(0, toProcess);
      this.tail = this.tail.subarray(toProcess);
      
      try {
        const decrypted = this.decipher.update(processBuf);
        if (decrypted.length > 0) this.push(decrypted);
      } catch (err) {
        return cb(err instanceof Error ? err : new Error(String(err)));
      }
    }
    cb();
  }

  _flush(cb: TransformCallback) {
    if (!this.decipher || this.tail.length !== 16) {
      return cb(new Error("[GcmDecryptStream] Invalid encrypted data: too short or no auth tag"));
    }
    
    try {
      this.decipher.setAuthTag(this.tail);
      const finalBuf = this.decipher.final();
      if (finalBuf.length > 0) this.push(finalBuf);
      cb();
    } catch (err) {
      cb(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
"""
content += streams_code

with open("src/utils/crypto.ts", "w") as f:
    f.write(content)
