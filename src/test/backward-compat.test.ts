/**
 * 구버전 호환성 테스트.
 *
 * 이전 버전에서 생성된 인코딩 결과가 현재 버전에서도
 * 동일하게 인코딩/디코딩되는지 검증합니다.
 */

import { describe, it, expect } from "vitest";
// 6.0: 압축/체크섬 하위호환 벡터는 secure 진입점의 Ddu64Secure로 검증.
import { Ddu64Secure as Ddu64Node } from "../Ddu64Secure.js";
import { DduSetSymbol } from "../core/types.js";
import compatVectors from "./fixtures/compat-vectors.json";

describe("구버전 호환성 테스트", () => {
  // ─── 기본 테스트 ───────────────────────────────────────────────────────────

  describe("기본 인코딩/디코딩", () => {
    it("기본 DDU 프리셋 - 안녕하세요12 (커스텀 charset)", () => {
      // 구버전: 한글 종성 결합으로 생성된 큰 charset
      // 이 테스트는 디코딩 호환성만 검증 (charset이 동적 생성이므로)
      const koreanChars =
        "뜌,뜍,뜎,뜏,뜐,뜑,뜒,뜓,뜔,뜕,뜖,뜗,뜘,뜙,뜚,뜛,뜜,뜝,뜞,뜟,뜠,뜡,뜢,뜣,뜤,뜥,뜦,뜧,뜨,뜩,뜪,뜫,뜬,뜭,뜮,뜯,뜰,뜱,뜲,뜳,뜴,뜵,뜶,뜷,뜸,뜹,뜺,뜻,뜼,뜽,뜾,뜿,땨,땩,땪,땫,땬,땭,땮,땯,땰,땱,땲,땳,땴,땵,땶,땷,땸,땹,땺,땻,땼,땽,땾,땿,떀,떁,떂,떃,떄,떅,떆,떇,떈,떉,떊,떋,떌,떍,떎,떏,떐,떑,떒,떓,떔,떕,떖,떗,떘,떙,떚,떛,우,욱,욲,욳,운,울,욶,욷,움,웁,웂,웃,웄,웅,웆,웇,워,웍,웎,웏,원,월,웒,웓,월,웕,웖,웗,웘,웙,웚,웛,위,윅,윆,윇,윈,윉,윊,윋,윌,윍,윎,윏,윐,윑,윒,윓,윔,윕,윖,따,딱,딲,딳,딴,딵,딶,딷,딸,딹,딺,딻,딼,딽,딾,딿,땀,땁,땂,땃,땄,땅,땆,땇,땈,땉,땊,땋,때,땍,땎,땏,때,땑,땒,땓,땔,땕,땖,땗,땘,땙,땚,땛,땜,땝,땞,땟,땠,땡,땢,야,약,얂,얃,얄,얅,얆,얇,얈,얉,얊,얋,얌,얍,얎,얏,양,양,얒,얓,얔,얕,얖,얗,얘,얙,얚,얛,얜,얝,얞,얟,얠,얡,얢,얣,얤,얥,얦,얧,얨,얩,얪,얫,얬,얭,얮,얯,얰,얱".split(
          ",",
        );
      const encoder = new Ddu64Node(koreanChars, "뭐", { throwOnError: false });

      const encoded = encoder.encode("안녕하세요12");
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe("안녕하세요12");

      // 구버전 인코딩 결과로 디코딩 가능한지 확인
      const legacyEncoded = "뜌얡뜌윒뜌윅뜌얠뜌웚뜌윒뜌얢뜌윒뜌윕뜌얡뜌웙뜌땎뜌얡뜌따뜌윑뜌뜽뜌뜾";
      const legacyDecoded = encoder.decode(legacyEncoded);
      expect(legacyDecoded).toBe("안녕하세요12");
    });

    it("4문자 charset (우따야야) - usePowerOfTwo", () => {
      // "우따야야"는 중복("야") charset → 5.0 기본 throwOnError:true에선 throw하므로
      // 레거시 dedup 동작 검증을 위해 throwOnError:false로 명시.
      const encoder = new Ddu64Node("우따야야", "뭐", { usePowerOfTwo: true, throwOnError: false });

      const input = "안녕하세요";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);

      // 구버전 인코딩 결과 디코딩
      const legacyEncoded =
        "따우우야따우우우우야우따우따우따우야우우우야우우따우우야우야따우우야우우우따우따우야우따우따우따따우우야따우우따우야우따우따우따우야우따우야우우따우우야따우우우우야우우우따우우우야따우우야우우따우우야따우우우우야우따우야우야우야우따우따우우";
      const legacyDecoded = encoder.decode(legacyEncoded);
      expect(legacyDecoded).toBe(input);
    });

    it("4문자 charset (우따야야) - compress 라운드트립", () => {
      const encoder = new Ddu64Node("우따야야", "뭐", { usePowerOfTwo: true, throwOnError: false });

      const input = "안녕하세요".repeat(14);
      // 압축 인코딩 → 디코딩 라운드트립 검증
      // 참고: 압축 결과는 zlib 버전에 따라 달라질 수 있으므로
      // 구버전 바이너리 호환 대신 라운드트립만 검증
      const encoded = encoder.encode(input, { compress: true });
      expect(encoded).toContain("ELYSIA");

      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });
  });

  // ─── 프리셋 테스트 ─────────────────────────────────────────────────────────

  describe("프리셋 호환성", () => {
    it("DDU_V1 프리셋 - 안녕하세요", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU_V1,
      });

      const legacyEncoded = ".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe("안녕하세요");

      // 현재 버전도 동일하게 인코딩하는지
      const currentEncoded = encoder.encode("안녕하세요");
      expect(currentEncoded).toBe(legacyEncoded);
    });

    it("DDU_V1 프리셋 - 6비트 쌍 인코딩 프로필 유지", () => {
      const encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });
      const info = encoder.getCharSetInfo();

      expect(info.charSet).toEqual(["뜌", "땨", "이", "우", "야", "!", "?", "."]);
      expect(info.bitLength).toBe(6);
      expect(info.usePowerOfTwo).toBe(false);
      expect(encoder.encode(new Uint8Array([65]))).toBe("이뜌이뜌뭐뭐");
    });

    it("DDU_V1 프리셋 - 바이너리 패딩 경계 fixture", () => {
      const encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });
      const vectors: [number[], string][] = [
        [[0], "뜌뜌뜌뜌뭐뭐"],
        [[0, 255], "뜌뜌땨..야뭐"],
        [[0, 255, 170], "뜌뜌땨..?!이"],
      ];

      for (const [bytes, expected] of vectors) {
        const input = new Uint8Array(bytes);
        const encoded = encoder.encode(input);
        expect(encoded).toBe(expected);
        expect(Array.from(encoder.decodeToUint8Array(encoded))).toEqual(bytes);
      }
    });

    it("DDU_V1 프리셋 - 압축 마커 라운드트립", () => {
      const encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });
      const input = "A".repeat(1000);
      const encoded = encoder.encode(input, { compress: true });

      expect(encoded).toContain("ELYSIA");
      expect(encoder.decode(encoded, { compress: true })).toBe(input);
    });

    it("ONECHARSET 프리셋 - Hello World!", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.ONECHARSET,
      });

      const legacyEncoded = "R3Wga37LWn8ma3QH";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe("Hello World!");

      const currentEncoded = encoder.encode("Hello World!");
      expect(currentEncoded).toBe(legacyEncoded);
    });

    it("기본 DDU 프리셋 - 안녕하세요 (useRepeatPadding)", () => {
      const encoder = new Ddu64Node();

      const legacyEncoded = "뎯땩잇땨뎪뎨잇잉뎯욱잇우뎯땨읶뎨뎯땩듂잊";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe("안녕하세요");

      const currentEncoded = encoder.encode("안녕하세요");
      expect(currentEncoded).toBe(legacyEncoded);
    });

    it("기본 DDU 프리셋 - 반복 문자열 (압축 없음)", () => {
      const encoder = new Ddu64Node();
      const input = "안녕하세요".repeat(14);

      // 구버전 인코딩 결과의 시작 부분 확인
      const legacyStart = "뎯땩잇땨뎪뎨잇잉뎯욱잇우뎯땨읶뎨뎯땩듂잊";
      const currentEncoded = encoder.encode(input);

      // 반복 패턴이므로 시작 부분이 동일해야 함
      expect(currentEncoded.startsWith(legacyStart)).toBe(true);

      // 라운드트립
      const decoded = encoder.decode(currentEncoded);
      expect(decoded).toBe(input);
    });
  });

  // ─── 크로스 플랫폼 호환 벡터 ────────────────────────────────────────
  // src/test/fixtures/compat-vectors.json
  // 63개 엣지 케이스 (다국어, 이모지, 제어문자, 패딩 경계 등)이 들어있습니다.

  describe("크로스 플랫폼 호환 벡터", () => {
    const v2Encoder = new Ddu64Node();
    const v1Encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });

    describe("V2 (DDU)", () => {
      for (const vec of compatVectors) {
        it(`[${vec.name}] 인코딩 일치`, () => {
          expect(v2Encoder.encode(vec.input)).toBe(vec.v2);
        });

        it(`[${vec.name}] 디코딩 라운드트립`, () => {
          expect(v2Encoder.decode(vec.v2)).toBe(vec.input);
        });
      }
    });

    describe("V1 (DDU_V1)", () => {
      for (const vec of compatVectors) {
        it(`[${vec.name}] 인코딩 일치`, () => {
          expect(v1Encoder.encode(vec.input)).toBe(vec.v1);
        });

        it(`[${vec.name}] 디코딩 라운드트립`, () => {
          expect(v1Encoder.decode(vec.v1)).toBe(vec.input);
        });
      }
    });
  });

  describe("V1/V2 async 호환성 가드", () => {
    const asyncVectors = compatVectors.slice(0, 8);

    it("V2 기본 생성자는 기존 벡터를 async로도 디코딩", async () => {
      const encoder = new Ddu64Node();

      for (const vec of asyncVectors) {
        await expect(encoder.decodeAsync(vec.v2)).resolves.toBe(vec.input);
        await expect(encoder.encodeAsync(vec.input)).resolves.toBe(vec.v2);
      }
    });

    it("V1 DDU_V1 생성자는 기존 벡터를 async로도 디코딩", async () => {
      const encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });

      for (const vec of asyncVectors) {
        await expect(encoder.decodeAsync(vec.v1)).resolves.toBe(vec.input);
        await expect(encoder.encodeAsync(vec.input)).resolves.toBe(vec.v1);
      }
    });
  });

  // ─── 고급 기능 호환성 ──────────────────────────────────────────────────────

  describe("고급 기능 호환성", () => {
    it("체크섬 - 디코딩 호환", () => {
      const encoder = new Ddu64Node();

      const legacyEncoded =
        "뎪뎨댯댜뎯땩댯댲뎯우읶댜땨땻듓듖듕땻듂댞듖땻댞뜢듖읶뜓듕약우댣듖앾듂읻듕앾듇야뭐CHKe603e028";
      const decoded = encoder.decode(legacyEncoded, { checksum: true });
      expect(decoded).toBe("데이터 무결성 테스트");
    });

    it("체크섬 - CRC 값 유지 (5.0 마커는 CK로 변경, plaintext CRC 동일)", () => {
      const encoder = new Ddu64Node();

      const currentEncoded = encoder.encode("데이터 무결성 테스트", { checksum: true });
      // 5.0: 마커가 CHK → CK[scope]로 변경됨. 평문 CRC 값은 동일(plain 데이터라 output==plaintext)
      expect(currentEncoded).toMatch(/CK[PO]e603e028/);
      expect(currentEncoded).toContain("e603e028");

      const decoded = encoder.decode(currentEncoded, { checksum: true });
      expect(decoded).toBe("데이터 무결성 테스트");
    });

    it("청크 분할 - 디코딩 호환", () => {
      const encoder = new Ddu64Node();

      const input = "청크 분할 테스트 문자열입니다. 긴 문자열을 나눠서 인코딩합니다.";
      const encoded = encoder.encode(input, { chunkSize: 20, chunkSeparator: "\n" });
      expect(encoded).toContain("\n");

      const decoded = encoder.decode(encoded, { chunkSeparator: "\n" });
      expect(decoded).toBe(input);
    });

    it("압축 (deflate) - 디코딩 호환", () => {
      const encoder = new Ddu64Node();

      const input = "안녕하세요".repeat(20);
      const encoded = encoder.encode(input, { compress: true, compressionAlgorithm: "deflate" });

      // ELYSIA 마커가 있어야 함
      expect(encoded).toContain("ELYSIA");

      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("압축 (brotli) - 디코딩 호환", () => {
      const encoder = new Ddu64Node();

      const input = "안녕하세요".repeat(20);
      const encoded = encoder.encode(input, { compress: true, compressionAlgorithm: "brotli" });

      // GRISEO 마커가 있어야 함
      expect(encoded).toContain("GRISEO");

      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("암호화 - 라운드트립", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "my-secret-key-123",
      });

      const input = "비밀 메시지입니다";
      const encoded = encoder.encode(input);

      // ENC 마커가 있어야 함
      expect(encoded).toContain("ENC");
      expect(encoded).toContain("ENCV4");

      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("암호화 - V4 푸터 변조를 AES-GCM AAD로 거부", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "my-secret-key-123",
      });
      const encoded = encoder.encode("비밀 메시지입니다");
      const tampered = encoded.replace("ENCV4", "ENCV3");

      expect(() => encoder.decode(tampered)).toThrow();
    });

    it("암호화+압축 - V4 압축 마커 변조를 AES-GCM AAD로 거부", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "my-secret-key-123",
      });
      const encoded = encoder.encode("A".repeat(1000), {
        compress: true,
        compressionAlgorithm: "deflate",
      });
      expect(encoded).toContain("ELYSIAENCV4");

      const tampered = encoded.replace("ELYSIAENCV4", "GRISEOENCV4");
      expect(() => encoder.decode(tampered)).toThrow();
    });

    it("암호화 - 구버전 V3 encrypted fixture 디코딩 호환 (sha256 명시)", () => {
      // 5.0 기본 키 파생은 pbkdf2. 4.x sha256으로 암호화된 레거시 데이터를 디코딩하려면
      // keyDerivation:{ algorithm:"sha256" }를 명시해야 한다(키 파생은 와이어에 자기기술 불가).
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "legacy-v3-key",
        keyDerivation: { algorithm: "sha256" },
      });
      const legacyV3Encoded =
        "땩땼땾뜎댲뎼이댰욷댰땼읶듓댜뜟댝얏듇듔땼댞뜍웄욷얒뎯얏뎪듁듁웆뜢뜟듔익뎪땨읻욷뜠듀뎼뜟듀욲땻욲뎼댝댜뜍얐듕듇뎯뜌잇뜍읻뜍얏땪땻댱뜢웅양읻댜뜌뭐ENCV34";

      expect(encoder.decode(legacyV3Encoded)).toBe("legacy encrypted payload");
      expect(encoder.encode("legacy encrypted payload")).toContain("ENCV4");
    });

    it("URL-Safe - 인코딩/디코딩 호환", () => {
      const encoder = new Ddu64Node(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
        { urlSafe: true },
      );

      const input = "URL 안전 인코딩 테스트";
      const legacyEncoded = "VVJMIOyViOyghCDsnbjsvZTrlKkg7YWM7Iqk7Yq4";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe(input);

      const currentEncoded = encoder.encode(input);
      expect(currentEncoded).toBe(legacyEncoded);
    });

    it("커스텀 종성결합 charset - 인코딩/디코딩 호환", () => {
      const encoder = new Ddu64Node(["가", "나", "다", "라", "마", "바", "사", "아"], "뭐", {
        codaChar: ["", "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ"],
      });

      const input = "종성 결합 테스트";
      const legacyEncoded = "안낚낚갈안나닦삭나남밖삮받남삼달밖닦간발막라산받맊밖단발맊반마뭐";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe(input);

      const currentEncoded = encoder.encode(input);
      expect(currentEncoded).toBe(legacyEncoded);
    });
  });

  // ─── 이모지/혼합 문자 호환성 ───────────────────────────────────────────────

  describe("이모지/혼합 문자 호환성", () => {
    it("영문+숫자+특수문자+한글+이모지 혼합", () => {
      const encoder = new Ddu64Node();

      const input = "Hello 123 !@# 안녕 🎉";
      const legacyEncoded =
        "읶뜟잉듖욷뜟뎾야땾읻땨댣땨뜎뜡뜌땨댞뜓듖양우얃듇약욱잊야뎾땩뎻땻앾이뭐뭐";
      const decoded = encoder.decode(legacyEncoded);
      expect(decoded).toBe(input);

      const currentEncoded = encoder.encode(input);
      expect(currentEncoded).toBe(legacyEncoded);
    });
  });

  // ─── 생성자 오버로드 호환성 ─────────────────────────────────────────────────

  describe("생성자 오버로드 호환성", () => {
    it("new Ddu64({ options }) 형태가 new Ddu64(undefined, undefined, { options })와 동일", () => {
      const oldStyle = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU_V1,
      });
      const newStyle = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });

      const input = "안녕하세요";
      expect(newStyle.encode(input)).toBe(oldStyle.encode(input));
      expect(newStyle.decode(oldStyle.encode(input))).toBe(input);
    });

    it("new Ddu64({ options }) - DDU 기본 프리셋과 동일", () => {
      const defaultEncoder = new Ddu64Node();
      const optionsEncoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU });

      const input = "테스트 데이터";
      expect(optionsEncoder.encode(input)).toBe(defaultEncoder.encode(input));
    });

    it("new Ddu64({ options }) - compress 옵션", () => {
      const encoder = new Ddu64Node({ compress: true });

      const input = "A".repeat(100);
      const encoded = encoder.encode(input);
      expect(encoded).toContain("ELYSIA");
      expect(encoder.decode(encoded)).toBe(input);
    });

    it("new Ddu64({ options }) - 과거 인코딩 데이터 디코딩 가능", () => {
      const encoder = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });

      const legacyEncoded = ".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야";
      expect(encoder.decode(legacyEncoded)).toBe("안녕하세요");
    });

    it("기존 charset 직접 지정 방식은 여전히 동작", () => {
      const encoder = new Ddu64Node(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
      );

      const input = "Hello World!";
      const encoded = encoder.encode(input);
      expect(encoder.decode(encoded)).toBe(input);
    });

    it("charset + options 조합도 여전히 동작", () => {
      const encoder = new Ddu64Node(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
        { urlSafe: true },
      );

      const input = "test";
      const encoded = encoder.encode(input);
      // URL-safe이므로 +/= 대신 -_. 사용
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoder.decode(encoded)).toBe(input);
    });
  });

  // ─── 통계 호환성 ───────────────────────────────────────────────────────────

  describe("통계 호환성", () => {
    it("getStats 결과가 구버전과 동일한 구조", () => {
      const encoder = new Ddu64Node();
      const input = "안녕하세요".repeat(10);

      const stats = encoder.getStats(input, { compress: true });

      expect(stats.originalSize).toBe(150);
      expect(stats.charsetSize).toBe(64);
      expect(stats.bitLength).toBe(6);
      expect(stats.compressionRatio).toBeDefined();
      expect(stats.compressionRatio!).toBeLessThan(1);
      expect(stats.expansionRatio).toBeDefined();
    });
  });
});
