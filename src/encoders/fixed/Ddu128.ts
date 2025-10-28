import { FixedLengthDdu } from "../../base/FixedLengthDdu";

export class Ddu128 extends FixedLengthDdu {
  private static readonly DDU_CHAR_DEFAULT: string[] = [
    'Z9',   '25',   'Dk',   '86',   'un',   'cb',   'V1',   'Bf',
    'uc',   '7A',   'FL',   'Wm',   'CL',   'XA',   '3K',   'W3',
    '0h',   'RV',   'TI',   'Ze',   'dC',   'CG',   'FN',   'PC',
    'W8',   '5s',   '8L',   'If',   'tz',   'J-',   'WU',   'dk',
    'tC',   'VS',   'Hi',   'BF',   'W-',   'co',   'pm',   'Hb',
    'gp',   'TO',   'MY',   'Bs',   'Vj',   '4x',   'Ye',   'dx',
    'A1',   'tH',   'kv',   'us',   '_Y',   'kU',   '3m',   'a1',
    'gw',   'rp',   'k6',   'g1',   'Yn',   'IL',   'Yb',   'rI',
    '_6',   'dK',   'ZL',   'uJ',   'Z6',   'TK',   'xj',   'DI',
    'XZ',   'tQ',   'zK',   'Be',   'wQ',   'a3',   'd5',   'M9',
    'TS',   'W1',   '_9',   'Ds',   'Bx',   'Om',   '0v',   'DU',
    'Hs',   '7K',   'dN',   'Ff',   'kn',   'JL',   'p6',   'MA',
    'TH',   '3f',   'Fe',   'Te',   'rZ',   'rz',   'Jv',   'X3',
    't0',   'R5',   'OU',   'Ws',   'Ch',   'zN',   'rU',   'Tx',
    'VU',   'qq',   'WZ',   'F9',   'ph',   'uC',   'Fh',   'dG',
    '4w',   'tw',   'Zn',   'M-',   'cK',   '4o',   'wU',   '7n'
  ];
  private static readonly PADDING_CHAR_DEFAULT: string = "El";
  private static readonly REQUIRED_LENGTH: number = 128;
  private static readonly BIT_LENGTH: number = 7; // 128 = 2^7

  constructor(dduChar?: string[], paddingChar?: string) {
    super(
      Ddu128.DDU_CHAR_DEFAULT,
      Ddu128.PADDING_CHAR_DEFAULT,
      Ddu128.REQUIRED_LENGTH,
      Ddu128.BIT_LENGTH,
      dduChar,
      paddingChar
    );
  }
}

