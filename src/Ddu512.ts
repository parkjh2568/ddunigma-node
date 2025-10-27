export class Ddu512 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly charLength: number;
  // 512개의 2글자 URL-safe 문자열 (앞글자: E,l,y 제외 / 뒷글자: s,i,a 제외)
  private readonly dduCharDefault: string[] = [
    'ZL',   'IX',   'da',   'Mz',   'nn',   '1z',   '7v',   'XV',
    '1L',   'j0',   'DB',   '2z',   'OQ',   'FT',   'WQ',   'm2',
    'Oc',   'jH',   'Ag',   'sb',   '7Z',   'T9',   '-B',   'ri',
    '2x',   'o9',   'PP',   '4v',   'dT',   'sk',   'cN',   'UL',
    'iV',   'It',   'ib',   'Tf',   'j4',   'cK',   'Wf',   'wD',
    'Au',   'tK',   '16',   '-h',   '1g',   '6b',   'ae',   'ZS',
    'tk',   'mT',   'AU',   'wq',   '5f',   '18',   '_o',   'GK',
    'Ah',   'hQ',   'Cz',   'r6',   'MU',   '-v',   'r4',   'mu',
    'MC',   'U0',   'wu',   'O4',   '6k',   '3B',   '_2',   'F4',
    'OH',   '-W',   'RX',   'U9',   'jQ',   '2k',   '-T',   'De',
    '38',   'UJ',   '6Q',   'Y4',   'Ie',   '_N',   'Ue',   'uJ',
    'iz',   'w6',   'pi',   'dU',   '-K',   'D0',   '5h',   '1X',
    '-b',   'mX',   'WL',   'iQ',   'jx',   'rU',   'Ft',   'jK',
    '19',   'qV',   'mz',   '-z',   'Fa',   '29',   'dZ',   'hx',
    'R3',   'GC',   '7c',   'sX',   'Fh',   'C0',   '5V',   'C8',
    'of',   'RJ',   'Zk',   'cJ',   '-x',   'tN',   '3g',   'X0',
    '3z',   '-2',   'oJ',   'dH',   'qQ',   'r3',   'Mh',   'Dk',
    '6g',   'Wv',   'F9',   '39',   '6B',   'qK',   'dQ',   'ok',
    'pt',   'jB',   'YV',   'Gq',   'DV',   'jC',   '7X',   'Y3',
    'X9',   'Oh',   '5g',   'RH',   'Ub',   'sC',   'ub',   '_h',
    '_k',   'Hb',   'IU',   'cg',   'd8',   'pf',   '58',   'TV',
    'dz',   'OW',   'ik',   'Ff',   'MD',   'Ze',   'rH',   'sL',
    '4N',   '1V',   'MN',   '-N',   'T0',   '_z',   'qS',   'OS',
    '49',   'dt',   '-9',   'XN',   '3Q',   'jV',   'Hf',   'h8',
    'Rv',   'Yo',   'rv',   '_C',   'ag',   'j3',   'mc',   'Dg',
    'DL',   '4x',   '2V',   '5o',   'Rh',   'Fg',   'Dz',   'Aa',
    'Ce',   'aS',   'tL',   'Ac',   '-3',   '7h',   'Oz',   'st',
    'O3',   'TQ',   'RL',   '2b',   'pq',   'we',   '1x',   're',
    '5i',   'cz',   'tb',   'Rb',   'sB',   'IS',   'mo',   '5v',
    'w3',   'dc',   'MX',   'rh',   'ON',   '4J',   'jk',   'hL',
    '1a',   '1U',   'hf',   'uv',   'Ov',   'AX',   'YT',   '5a',
    '6v',   'Re',   '1T',   'rc',   'XK',   'mq',   '-f',   'IV',
    'Ru',   '_H',   'FV',   'jo',   'HL',   'jf',   'OX',   'sK',
    '_g',   '_a',   '7f',   'Ib',   '_x',   's4',   'Xk',   'MQ',
    'pC',   '1Q',   'sT',   'sQ',   'Io',   '4z',   'Rt',   'ph',
    'Gc',   'pV',   'dV',   'hz',   'mg',   '4k',   'Ai',   '6e',
    'dJ',   'wN',   'wx',   'Rf',   'FJ',   'M2',   '5c',   'MH',
    'O8',   'q9',   'w4',   '7k',   '3S',   '1f',   'aJ',   '5D',
    'iS',   'YW',   'if',   'Rc',   'Me',   'G0',   'RK',   '-k',
    'WB',   'ug',   'sN',   '7i',   '-H',   'dN',   '_U',   'Fz',
    'a8',   'cv',   'FS',   'Ik',   'IN',   'Fq',   'oV',   '2J',
    'IL',   'w9',   '-X',   'wv',   'Yk',   'GD',   '7H',   'jt',
    'oL',   'AT',   'w2',   '-e',   'mQ',   '5N',   's9',   'dq',
    'mS',   '-C',   'hg',   'Ya',   'Ou',   'Mv',   'M0',   'FX',
    'jW',   'rS',   'Wz',   'pk',   '2g',   'i9',   'IT',   '6K',
    '5W',   'sa',   'mh',   '3k',   'UN',   'mk',   'qe',   '5L',
    'Ga',   'pN',   'RU',   'ox',   'T8',   's6',   'rk',   'IJ',
    'AW',   '74',   'Oi',   'Wx',   '7B',   'AD',   'G9',   'Tg',
    'tf',   '-c',   '-u',   '6S',   'rK',   'CB',   'YX',   'UV',
    'Uz',   'jZ',   'i8',   'Mc',   'si',   'MV',   'm9',   '53',
    'YJ',   'I0',   '_V',   'GT',   'd9',   'YD',   'sW',   'Cx',
    'wk',   '20',   '28',   '_K',   'di',   'c0',   'AN',   'j9',
    'Ux',   'M6',   'uk',   'Fk',   'iJ',   'Ot',   'dB',   '_0',
    'ob',   'sh',   '7W',   'Ih',   'He',   'Gx',   'Mf',   '4Q',
    'Ic',   '7u',   'pS',   'A0',   '5k',   '40',   'jN',   'R8',
    'cL',   'm4',   'uS',   'RN',   'FC',   'Yx',   '7q',   'rL',
    'wL',   'ix',   'FU',   '3V',   'Ig',   'j2',   'Zv',   'Hz',
    'GL',   't9',   'Tv',   'O9',   'jq',   'Dx',   'R2',   'uV',
    'Zg',   'rC',   'Ii',   '1J',   'I2',   'mK',   '7x',   'wK',
    'AQ',   '-Z',   'qg',   'p9',   'dv',   'u8',   'jL',   '5J',
    'Ug',   'p4',   'Y9',   '-i',   's3',   'Y6',   'RW',   'FB',
    '1h',   'ZK',   'HS',   '-4',   'wJ',   'XS',   'dg',   '_f',
    '78',   'aL',   'Og',   'jh',   'Mg',   'Zz',   '1u',   'UB',
    'pe',   'wZ',   'OZ',   'G3',   'IZ',   'aN',   'HK',   'sH'
  ];
  private readonly paddingCharDefault: string = "lE";
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

