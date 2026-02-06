import { DduSetSymbol } from "./DduEnums";

export interface CharSetConfig {
  /** charset 식별 심볼 */
  symbol: DduSetSymbol;
  /** 인코딩에 사용할 문자 배열 */
  charSet: string[];
  /** 최대 필요 문자 수 */
  maxRequiredLength: number;
  /** 비트 길이 (log2) */
  bitLength: number;
  /** 패딩 문자 */
  paddingChar: string;
}

/** 진행률 콜백 정보 */
export interface DduProgressInfo {
  /** 현재 처리된 바이트 수 (근사값) */
  processedBytes: number;
  /** 전체 바이트 수 */
  totalBytes: number;
  /** 진행률 (0-100, 단계별 근사값) */
  percent: number;
  /** 현재 처리 단계 */
  stage?: "start" | "encrypt" | "compress" | "encode" | "decode" | "decompress" | "checksum" | "decrypt" | "done";
}

/** 인코딩 통계 정보 */
export interface DduEncodeStats {
  /** 원본 데이터 크기 (바이트) */
  originalSize: number;
  /** 인코딩된 문자열 길이 */
  encodedSize: number;
  /** 압축된 크기 (압축 사용시) */
  compressedSize?: number;
  /** 압축률 (0-1, 낮을수록 효율적) */
  compressionRatio?: number;
  /** 인코딩 확장 비율 */
  expansionRatio: number;
  /** 사용된 charset 크기 */
  charsetSize: number;
  /** 비트 길이 */
  bitLength: number;
}

export interface DduOptions {
  /** 압축 사용 여부 (zlib deflate) */
  compress?: boolean;
  /** 압축 레벨 (1~9, 기본값: 6). 1=빠름/낮은압축, 9=느림/최대압축 */
  compressionLevel?: number;
  /** 최대 디코딩 바이트 수 (Zip Bomb 방어) */
  maxDecodedBytes?: number;
  /** 최대 압축해제 바이트 수 (Zip Bomb 방어) */
  maxDecompressedBytes?: number;
  /** 체크섬 추가 여부 (CRC32) */
  checksum?: boolean;
  /** 청크 분할 크기 */
  chunkSize?: number;
  /** 청크 구분자 (기본값: '\n') */
  chunkSeparator?: string;
  /** 진행률 콜백 */
  onProgress?: (info: DduProgressInfo) => void;
}

export interface DduConstructorOptions extends DduOptions {
  /** 미리 정의된 charset 심볼 */
  dduSetSymbol?: DduSetSymbol;
  /** 커스텀 charset 문자 배열 또는 문자열 */
  dduChar?: string[] | string;
  /** 패딩 문자 */
  paddingChar?: string;
  /** 필요 문자 수 */
  requiredLength?: number;
  /** 비트 길이 */
  bitLength?: number;
  /** 2의 제곱수 강제 여부 */
  usePowerOfTwo?: boolean;
  /**
   * true이면 초기화 오류 시 throw합니다. false이면 fallback charset으로 대체합니다.
   * @default false
   * @deprecated throwOnError를 사용하세요. 이 옵션은 하위 호환성을 위해 유지됩니다.
   */
  useBuildErrorReturn?: boolean;
  /**
   * true이면 초기화 오류 시 throw합니다. false이면 fallback charset으로 대체합니다.
   * useBuildErrorReturn과 동일한 동작이며, 둘 다 지정 시 throwOnError가 우선합니다.
   * @default false
   */
  throwOnError?: boolean;
  /** Buffer 인코딩 방식 */
  encoding?: BufferEncoding;
  /** URL-Safe 모드 (특수문자를 URL 안전 문자로 변환) */
  urlSafe?: boolean;
  /** 암호화 키 (AES-256-GCM) */
  encryptionKey?: string;
}
