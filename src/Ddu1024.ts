export class Ddu1024 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly charLength: number;
  // 1024개의 2글자 URL-safe 문자열 (앞글자: E,l,y 제외 / 뒷글자: s,i,a 제외)
  private readonly dduCharDefault: string[] = [
    'Ok',   '-d',   'b4',   'mF',   'pP',   'vL',   'eA',   '87',
    '2j',   'G8',   'Bj',   'PR',   'eI',   'a6',   'pQ',   'eZ',
    'qv',   '3j',   'h6',   '-2',   '1I',   'tc',   'qa',   'OX',
    '5z',   'vn',   'p1',   'OL',   'XC',   'N8',   'qW',   'hH',
    '-C',   '_o',   'BQ',   '54',   'O7',   'BT',   '-7',   '8c',
    'gs',   'MC',   'kz',   'hx',   'Jt',   'ZL',   'Po',   'ZI',
    'VU',   'M2',   'sg',   'Xr',   'YR',   'T4',   'J0',   'J4',
    'KW',   'ho',   'hI',   'Bw',   'd9',   'iU',   'eC',   'Sm',
    'V4',   'fd',   'mz',   'Ac',   'KT',   'Gw',   '3r',   'K2',
    'pi',   '_Y',   'ax',   'Ho',   'OQ',   'J7',   'b8',   'OA',
    'Oz',   'bv',   'pA',   'pt',   'ZU',   'mU',   'A6',   'kc',
    'KV',   'hA',   'vR',   'B6',   'fY',   'wz',   'i7',   'Ou',
    'ic',   '_U',   '-F',   'TL',   'WL',   'T6',   '14',   '_9',
    'Kj',   'Nj',   'HU',   '-1',   '3m',   '5L',   'tR',   'wj',
    '0L',   'DH',   'hn',   'ed',   'S8',   'q1',   'Di',   '8r',
    'kR',   'Nt',   'iz',   'uI',   '-6',   'Ma',   'k6',   'Yx',
    'qR',   'e1',   'ft',   'OI',   '3a',   'SR',   'bR',   'G9',
    'Pj',   'eu',   '5F',   'ur',   'h9',   'q9',   'M6',   '2r',
    'fL',   'i9',   'ij',   'Yz',   'S5',   'Hn',   'eW',   'DU',
    '0o',   'Ar',   'MH',   'BY',   'GU',   'bd',   '_R',   'dx',
    '-I',   'kQ',   'ei',   'M8',   'ir',   'pZ',   '8U',   'Dn',
    'e2',   'Az',   'D7',   '09',   'fv',   'vF',   'f7',   'JW',
    'hc',   'tC',   'P6',   '1U',   'D2',   'to',   'H9',   'pX',
    'Nm',   'Kd',   'e9',   '_2',   'dI',   '3n',   'vQ',   '_7',
    'MU',   'MA',   'Mj',   'Zr',   'K0',   'eF',   'SV',   'Hj',
    'ar',   'NW',   'wC',   'Vr',   'H4',   '35',   '5x',   'NF',
    'u9',   '3W',   'S6',   'Nr',   'eU',   'px',   'O5',   '-V',
    'NC',   'GQ',   'K6',   'Nd',   'KZ',   'bc',   '3F',   'N6',
    'dn',   'wF',   'dC',   'Jw',   '34',   '04',   '1Q',   'v6',
    'JX',   'bI',   'm9',   '38',   'Z7',   'Gc',   'N4',   'pu',
    'Su',   'hj',   '2x',   'kF',   'B5',   'Mc',   'BU',   'qC',
    '3o',   '-U',   'Gv',   'Gu',   'Gj',   'ex',   'in',   'wL',
    'OU',   'w6',   'Kk',   'ko',   'Sx',   'h0',   'BL',   'DT',
    'tQ',   'Aj',   'Xj',   'p4',   'fI',   'Xo',   'Xx',   'Z4',
    'P4',   'MV',   '0U',   'bt',   'hY',   '2F',   'qF',   'TR',
    'ew',   '5U',   'h8',   '1F',   'DZ',   'v9',   'GT',   'OC',
    'Px',   'B0',   '-w',   '3V',   'vz',   'e0',   'qY',   'Ao',
    'ek',   'JL',   'NU',   'uc',   'OY',   'Jm',   'po',   'Xz',
    '3I',   'Bd',   'mo',   'pr',   'bA',   'uF',   'hV',   '1L',
    'Du',   'KY',   'BF',   '1r',   '8j',   '_I',   'AI',   'uL',
    '_T',   'u7',   '0j',   '-T',   'Jn',   'SU',   'A7',   'pT',
    'PF',   'vI',   'HF',   'Jc',   'JC',   '_x',   '3P',   'T9',
    't6',   'Zz',   'GH',   'hW',   'q8',   'a7',   'ha',   'Nn',
    'qd',   '2c',   'qj',   't9',   'e8',   'TU',   'bj',   'Sw',
    'O2',   'YL',   'MZ',   'hm',   '31',   'b6',   'KL',   '_v',
    'Mw',   'Bc',   'T7',   'DC',   'G4',   'BZ',   'Mt',   '2n',
    'J2',   'fu',   'AU',   'Tr',   'tz',   'Dr',   'SX',   '_j',
    'qV',   '_d',   'h5',   '_V',   'tU',   'iF',   'uj',   'Bn',
    'fn',   'pm',   'bw',   'XF',   'Hz',   '3H',   'YQ',   'pV',
    'pU',   '-u',   '5j',   'wQ',   'fP',   '5r',   '-0',   'PC',
    'K8',   'bu',   'SL',   'm6',   'e7',   'hP',   'Wn',   'O9',
    'uU',   '-Q',   'w9',   'NH',   '1R',   'Oc',   '3C',   'u4',
    'bo',   'bZ',   'Kv',   'GZ',   'Ka',   'pI',   'BA',   'KR',
    't4',   'Mu',   'vC',   'hv',   '-k',   'pL',   'vU',   '8Q',
    'd7',   'ux',   'tF',   '0I',   'e5',   'W7',   'ST',   'bU',
    'Ju',   'Bv',   'pw',   'et',   'B2',   'O0',   'qA',   '3L',
    'SI',   'O8',   'Oa',   'qm',   'Gk',   'aI',   '3d',   'G7',
    'dz',   'uC',   'aj',   'Jj',   '_6',   'Xn',   'VI',   'fz',
    'SQ',   'P9',   'p9',   'em',   '8I',   'Wj',   'dr',   'p7',
    'q5',   'hd',   'qt',   '36',   'io',   'vr',   'GY',   '-5',
    'TC',   'hT',   '24',   'pn',   'i6',   'SW',   'ZR',   'JA',
    'J5',   'MT',   'fC',   'JH',   'YU',   'Bk',   'ev',   'H6',
    'GV',   '8x',   'bH',   '2Q',   'TF',   'Kx',   'vc',   'Gn',
    'Ko',   'aU',   '_5',   'TI',   'Jr',   'Od',   '1c',   '_L',
    'A9',   'K7',   '0R',   'fA',   'DF',   'Ba',   'd4',   'SF',
    'Da',   '-i',   '16',   'hR',   'KF',   'b7',   '3x',   'Nv',
    'KI',   'vj',   'Zc',   'fU',   'eR',   'tL',   'Ga',   'Vz',
    'p6',   'Dj',   'GP',   'qi',   'Tc',   '57',   'fV',   'h7',
    'M7',   'BP',   'eH',   '3X',   'fT',   'Y9',   '30',   'XQ',
    'hi',   '39',   'Ja',   'NQ',   'AC',   'qk',   '_i',   'qL',
    'Gi',   '-A',   'MP',   'qQ',   '0r',   'TQ',   'hZ',   'Jo',
    '2z',   'J9',   'ZC',   'aF',   'Dm',   'Gr',   'Yj',   '_r',
    'AF',   'Mv',   'AR',   'JQ',   'er',   'Gz',   'An',   'p5',
    'hr',   'Bz',   'Zx',   'Jd',   'G6',   'pH',   'bi',   'SH',
    '29',   'bn',   'fQ',   'PU',   'SA',   '59',   'St',   '_X',
    'M1',   'pz',   'fr',   'Mk',   'OH',   'bQ',   'YF',   'bx',
    '_1',   'bT',   'mc',   'h2',   'eo',   '_C',   'D5',   'Bm',
    'KP',   'ea',   'en',   '84',   'DY',   'Ax',   'Mm',   '3R',
    'K9',   'PQ',   'N5',   'f4',   'OV',   'pj',   '1C',   'GR',
    'wc',   'bY',   'VC',   'Si',   'Zn',   'OW',   'DI',   '-j',
    'N0',   'mQ',   'Or',   'q4',   'O1',   'S1',   'eY',   'Ki',
    'DP',   'aC',   'NY',   'iC',   'pR',   'S4',   'KA',   'BV',
    '0c',   'SZ',   'Mr',   'NA',   '3T',   'f1',   'uz',   'XU',
    '-P',   'B4',   'ht',   'VL',   'Yc',   'WQ',   'ac',   'eT',
    'Vo',   'wI',   'iQ',   '_8',   '8C',   'hX',   'WF',   'WC',
    'N7',   'qT',   'N2',   'Bi',   'bm',   '-r',   'D8',   'dU',
    'G0',   'dc',   '2L',   'p2',   'O4',   'v4',   'vx',   'eX',
    'fo',   'ao',   'Wr',   'W4',   'V9',   'Sz',   'XL',   'eV',
    'ba',   '5c',   'SC',   'f6',   '-m',   'aQ',   '5o',   'Pr',
    'fR',   'Sk',   'fi',   'qU',   'JP',   'Jk',   'Na',   'qw',
    'Ox',   'qo',   'W9',   '5C',   'b0',   'N1',   '-v',   '-R',
    'N9',   'wU',   'wo',   'an',   'tx',   'Kr',   'b5',   'Tx',
    'q6',   'q2',   'J1',   'Gt',   '2C',   'BX',   '_a',   'SP',
    'JY',   'Br',   'KH',   'MF',   'AQ',   't7',   'OF',   'Mz',
    'B9',   'HI',   'hk',   'VQ',   'S2',   'f5',   '-n',   'Xc',
    'i4',   'Kt',   '0Q',   'D0',   'Oj',   'PI',   'BH',   'Kc',
    'dj',   'DR',   '3u',   'qz',   'OT',   'Nw',   'Sd',   'K4',
    '1o',   '2R',   'qP',   'bV',   'NV',   'Zj',   'kL',   'k7',
    '_c',   'Bt',   'mR',   'mC',   'kU',   'HR',   'J8',   'Gm',
    'B7',   'e6',   '1z',   '3Q',   'NZ',   'Bu',   '0x',   'Dt',
    'WR',   'BW',   'ZF',   'ix',   'q7',   '1j',   'XI',   'DA',
    'VR',   '56',   'V7',   'iL',   '5n',   'Md',   'vo',   'pa',
    'Y4',   'YI',   '8R',   'Dk',   'pk',   'fk',   'fc',   '_t',
    'Z6',   '-4',   'Y6',   '_Q',   '3t',   '0n',   'f9',   'az',
    'fm',   'hu',   'Z9',   '_4',   '-c',   'f2',   '5Q',   'DW',
    'D9',   'JI',   'JF',   '5I',   'No',   '17',   'AL',   'Nk',
    'Ji',   'Ow',   'iI',   'Mx',   'mr',   '_m',   'f8',   'mL',
    'D1',   '_z',   'Dd',   'WU',   'HC',   '-Z',   'K1',   'Zo',
    'NR',   'GX',   'D6',   'So',   'V6',   'd6',   'fX',   'qH',
    'Ot',   'MI',   '3w',   'iR',   'HL',   'ec',   'JU',   'm7',
    'wr',   'PL',   'G5',   'S0',   '-x',   'NX',   'kj',   'W6',
    '-8',   'ZQ',   'hU',   'GL',   'kC',   '26',   'fx',   '-X',
    'JV',   'B1',   'fH',   'eP',   'OZ',   'pW',   'OP',   '_u',
    'JT',   '2o',   '3Y',   'NI',   'Sn',   'Sr',   'b9',   'SY',
    'DQ',   'm4',   '1n',   'BI',   'hL',   'M0',   'Oo',   '3k',
    'ez',   '3A',   'wR',   'bW',   'K5',   'kr',   'NL',   'a9',
    '-Y',   'bk',   'Dz',   'qX',   'KQ',   'b2',   'Yo',   'hw',
    '3v',   'k9',   'v7',   '5R',   'do',   'GW',   'fW',   '19',
    '_n',   'Sa',   'p8',   'S9',   'MY',   '-a',   'qI',   '8o',
    'dQ',   'h4',   'Nc',   'Dx',   'qZ',   'Gd',   '3Z',   'pc',
    'Sc',   '3U',   'e4',   'Do',   'XR',   'MQ',   'Wz',   '-o',
    'a4',   'KX',   'A4',   'pv',   'On',   '86',   'kn',   'OR',
    'tr',   'Y7',   'YC',   'Om',   'Mi',   'Jx',   'Nu',   'u6',
    '8F',   'fF',   'Jz',   'fa',   'bP',   '-9',   'Ku',   '0F',
    '_F',   'f0',   'M5',   'Hr',   '3z',   'VF',   'w7',   'pY',
    'Dc',   'kI',   'Vj',   '-t',   'ML',   'wx',   '0z',   'Nz',
    'D4',   '3c',   'bX',   '0C',   'Tz',   'Bx',   'HQ',   'pd',
    '2I',   'w4',   '8n',   'hz',   'Yr',   '3i',   'hC',   'dL'
  ];
  private readonly paddingCharDefault: string = "ly"; // 앞글자=E(제외됨), 뒷글자=s(제외됨)
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

    // 유효성 검사: 최소 1024개 이상의 문자 필요
    if (sourceChar.length < 1024) {
      throw new Error(`Ddu1024 requires at least 1024 characters in the character set. Provided: ${sourceChar.length}`);
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

    // 앞에서부터 정확히 1024개만 사용
    this.dduChar = sourceChar.slice(0, 1024);
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
    const bitLength = 10; // 1024 = 2^10
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

    // 각 10비트 청크를 charLength 글자 문자열로 변환
    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      resultString += dduSet[charInt];
    }

    // 패딩 비트 정보를 padChar + 패딩비트수(0-9) 형태로 추가
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
      dduBinary += charIndex.toString(2).padStart(10, "0");
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(encoding);
  }
}
