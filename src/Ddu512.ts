export class Ddu512 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly charLength: number;
  // 512개의 2글자 URL-safe 문자열 (A-Z, a-z, 0-9, -, _ 사용)
  private readonly dduCharDefault: string[] = [
    "pb", "H3", "Gs", "1G", "xt", "Tq", "W1", "p0",
    "5D", "Tg", "HZ", "1z", "OG", "9j", "oh", "-y",
    "Jf", "Um", "qz", "AV", "Tr", "Ff", "5f", "gb",
    "G3", "eQ", "5J", "H9", "HR", "vF", "iX", "38",
    "DK", "kA", "Dt", "vP", "cU", "c8", "Kc", "Dk",
    "dG", "hX", "xX", "bD", "Kk", "wD", "av", "UM",
    "DI", "IS", "XD", "yV", "cW", "FG", "fW", "BY",
    "8F", "Sh", "8_", "ZZ", "Km", "iC", "2h", "8h",
    "DM", "dt", "Nf", "Ec", "Yf", "hu", "Ic", "fg",
    "rP", "HM", "oq", "OV", "-w", "g8", "EI", "6E",
    "N6", "XT", "kB", "Mf", "0c", "Ra", "OJ", "8I",
    "QY", "Gt", "BJ", "O1", "mO", "VD", "nK", "i_",
    "Sv", "i4", "e2", "yb", "iq", "hQ", "S0", "1l",
    "7J", "ms", "Z_", "nH", "Ka", "vf", "7d", "yS",
    "kn", "RU", "xb", "jK", "0J", "tG", "Hs", "et",
    "yJ", "K6", "4Y", "sZ", "6e", "f_", "F-", "_r",
    "-e", "cS", "Vb", "zn", "3d", "Px", "5d", "0E",
    "Xk", "aY", "yU", "5w", "mJ", "Be", "SV", "Bc",
    "vG", "h_", "29", "95", "rV", "YW", "-V", "b6",
    "Lh", "xq", "2Z", "X4", "l7", "6L", "lF", "Wh",
    "BN", "E8", "WH", "1e", "oJ", "pt", "ly", "D_",
    "pK", "-8", "aG", "VC", "WF", "sX", "V7", "vL",
    "_Q", "DT", "2Y", "hE", "Bl", "Vu", "_2", "OZ",
    "On", "1A", "ST", "tP", "UN", "_T", "LC", "ur",
    "lR", "Kh", "Ry", "eG", "BM", "9A", "Dz", "PD",
    "Ln", "Mq", "mU", "i3", "o9", "8M", "_z", "gx",
    "QE", "ZO", "SX", "Zu", "Pf", "eu", "69", "wl",
    "-a", "zw", "fs", "Vp", "wU", "8b", "DN", "aR",
    "Ld", "xy", "Vq", "Vf", "ds", "EJ", "1K", "UF",
    "Oz", "7U", "ES", "5k", "qe", "up", "Cg", "Xf",
    "xU", "W5", "wg", "nC", "hO", "N9", "v-", "2l",
    "hk", "CY", "4T", "N-", "XW", "Fo", "Li", "xh",
    "V-", "4N", "cH", "i-", "rb", "GE", "m_", "M0",
    "Xc", "58", "x6", "I5", "JW", "ax", "9K", "FS",
    "6N", "eI", "a_", "Jx", "gd", "q2", "D5", "8o",
    "q1", "F5", "KF", "PQ", "j2", "fm", "fI", "ev",
    "Bs", "3Y", "xr", "Qr", "_d", "vb", "2-", "Fl",
    "-z", "M4", "yX", "zk", "1q", "Ua", "aJ", "20",
    "Ya", "Of", "-A", "nV", "OF", "Lr", "dx", "ue",
    "OA", "XP", "U2", "3J", "15", "QT", "Za", "aB",
    "cM", "Aj", "oT", "4J", "zK", "DX", "2Q", "ka",
    "Q-", "tp", "ym", "KQ", "KI", "Sl", "-o", "3_",
    "9J", "Qn", "NR", "p9", "6u", "s0", "gq", "mS",
    "oF", "JJ", "YG", "tc", "34", "pd", "Rq", "dg",
    "gE", "1y", "_s", "qX", "uU", "oZ", "u8", "tM",
    "GG", "O5", "JE", "79", "qM", "Wf", "m1", "u9",
    "t9", "PL", "zg", "bW", "gV", "Ou", "0w", "gR",
    "X-", "QC", "qr", "4O", "z6", "AO", "QP", "Ze",
    "2d", "3z", "zb", "FJ", "CB", "c6", "M5", "FA",
    "8J", "UR", "8a", "Al", "x9", "63", "Ru", "8q",
    "qQ", "En", "xl", "08", "7_", "r2", "TA", "wA",
    "gF", "C6", "Fg", "iM", "Yo", "Vl", "ps", "Vg",
    "Dv", "tL", "T_", "Y2", "SC", "gY", "u2", "gz",
    "uJ", "Fi", "0i", "Nh", "Ha", "nf", "C0", "N4",
    "SD", "3q", "Mx", "Yh", "cQ", "mo", "gA", "tS",
    "n8", "5_", "SM", "Hh", "ao", "L9", "B3", "pq",
    "nY", "k9", "NX", "Er", "0S", "db", "iV", "_h",
    "2v", "71", "7C", "Gr", "2S", "nD", "6o", "_B",
    "AH", "li", "iy", "xg", "-5", "TE", "X8", "AC",
    "KB", "h9", "mw", "g5", "CC", "vY", "9W", "IY",
    "rB", "8V", "wT", "JD", "QB", "ZR", "Tb", "vd",
    "Da", "v8", "FU", "7R", "xM", "hv", "Rn", "o-",
    "CE", "i0", "7-", "nE", "hH", "qO", "IC", "gg",
    "Y4", "BP", "2c", "xF", "0v", "o7", "M6", "iI",
  ];
  private readonly paddingCharDefault: string = "Rk";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[], paddingChar?: string) {
    // 기본값 설정
    const sourceChar = dduChar || this.dduCharDefault;
    const sourcePadding = paddingChar || this.paddingCharDefault;

    // 유효성 검사: 최소 512개 이상의 문자 필요
    if (sourceChar.length < 512) {
      throw new Error(`Ddu512 requires at least 512 characters in the character set. Provided: ${sourceChar.length}`);
    }

    // 첫 번째 문자의 길이를 기준으로 설정
    this.charLength = sourceChar[0].length;

    // 모든 문자의 길이가 동일한지 검사
    for (let i = 0; i < sourceChar.length; i++) {
      if (sourceChar[i].length !== this.charLength) {
        throw new Error(`All characters must have the same length. Expected: ${this.charLength}, but character at index ${i} ("${sourceChar[i]}") has length ${sourceChar[i].length}`);
      }
    }

    // 패딩 문자 길이 검사
    if (sourcePadding.length !== this.charLength) {
      throw new Error(`Padding character length (${sourcePadding.length}) must match character set length (${this.charLength})`);
    }

    // 중복 검사
    const uniqueChars = new Set(sourceChar);
    if (uniqueChars.size !== sourceChar.length) {
      throw new Error(`Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${sourceChar.length}`);
    }

    // 패딩 문자가 문자셋에 포함되어 있는지 검사
    if (uniqueChars.has(sourcePadding)) {
      throw new Error(`Padding character "${sourcePadding}" cannot be in the character set`);
    }

    // 앞에서부터 정확히 512개만 사용
    this.dduChar = sourceChar.slice(0, 512);
    this.paddingChar = sourcePadding;

    // 룩업 테이블 생성
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.escapeRegExp(this.paddingChar), "g"));
    this.paddingRegex.set("KR", new RegExp(this.escapeRegExp(this.paddingCharDefault), "g"));
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  private getSelectedSets(
    dduSetSymbol: string
  ): {
    dduSet: string[];
    padChar: string;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const isKR = dduSetSymbol === "KR";
    const dduSet = isKR ? this.dduCharDefault : this.dduChar;
    const padChar = isKR ? this.paddingCharDefault : this.paddingChar;

    return {
      dduSet,
      padChar,
      lookupTable: isKR ? this.dduBinaryLookupKr : this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get(isKR ? "KR" : "default")!,
    };
  }

  private bufferToDduBinary(
    input: Buffer
  ): { dduBinary: string[]; padding: number } {
    const encodedBin = input.reduce(
      (acc, byte) => acc + this.binaryLookup[byte],
      ""
    );
    if (encodedBin.length === 0) {
      return { dduBinary: [], padding: 0 };
    }
    const bitLength = 9; // 512 = 2^9
    const dduBinary = Array.from(this.splitString(encodedBin, bitLength));
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;

    if (padding > 0) {
      dduBinary[dduBinary.length - 1] += "0".repeat(padding);
    }

    return { dduBinary, padding };
  }

  private dduBinaryToBuffer(decodedBin: string, paddingBits: number): Buffer {
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }
    const buffer: number[] = [];
    for (let i = 0; i < decodedBin.length; i += 8) {
      buffer.push(parseInt(decodedBin.slice(i, i + 8), 2));
    }

    return Buffer.from(buffer);
  }

  encode(
    input: Buffer | string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
    } = options;
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, encoding) : input;

    const { dduSet, padChar } = this.getSelectedSets(dduSetSymbol);
    const { dduBinary, padding } = this.bufferToDduBinary(bufferInput);

    let resultString = "";

    // 각 9비트 청크를 charLength 글자 문자열로 변환
    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      resultString += dduSet[charInt];
    }

    // 패딩 비트 정보를 padChar + 패딩비트수(0-8) 형태로 추가
    // padding이 0이 아니면 padChar를 추가
    if (padding > 0) {
      resultString += padChar + padding;
    }
    
    return resultString;
  }

  decode(
    input: string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
    } = options;
    const { lookupTable, padChar } = this.getSelectedSets(dduSetSymbol);

    // 패딩 정보 추출
    let paddingBits = 0;
    const padCharIndex = input.indexOf(padChar);
    if (padCharIndex >= 0) {
      // padChar 이후의 숫자가 패딩 비트 수
      const paddingStr = input.substring(padCharIndex + padChar.length);
      paddingBits = parseInt(paddingStr) || 0;
      // 패딩 정보 제거
      input = input.substring(0, padCharIndex);
    }

    let dduBinary = "";

    // charLength 길이만큼 읽어서 디코딩
    for (let i = 0; i < input.length; i += this.charLength) {
      const charChunk = input.slice(i, i + this.charLength);
      const charIndex = lookupTable.get(charChunk);
      if (charIndex === undefined)
        throw new Error(`Invalid character: ${charChunk}`);
      dduBinary += charIndex.toString(2).padStart(9, "0");
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(encoding);
  }
}

