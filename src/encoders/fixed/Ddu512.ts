import { FixedLengthDdu } from "../../base/FixedLengthDdu";

export class Ddu512 extends FixedLengthDdu {
  private static readonly DDU_CHAR_DEFAULT: string[] = [
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
  private static readonly PADDING_CHAR_DEFAULT: string = "lE";
  private static readonly REQUIRED_LENGTH: number = 512;
  private static readonly BIT_LENGTH: number = 9; // 512 = 2^9

  constructor(dduChar?: string[], paddingChar?: string) {
    super(
      Ddu512.DDU_CHAR_DEFAULT,
      Ddu512.PADDING_CHAR_DEFAULT,
      Ddu512.REQUIRED_LENGTH,
      Ddu512.BIT_LENGTH,
      dduChar,
      paddingChar
    );
  }
}

