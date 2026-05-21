import { CharSetConfig, DduSetSymbol } from "../types";

const dduCharSet: CharSetConfig = {
  symbol: DduSetSymbol.DDU,
  charSet: ["뜌", "땨", "이", "우", "야", "!", "?", "."],
  maxRequiredLength: 8,
  bitLength: 3, // 8 = 2^3
  paddingChar: "뭐",
};

const oneCharSet: CharSetConfig = {
  symbol: DduSetSymbol.ONECHARSET,
  charSet: [
    "A",
    "s",
    "q",
    "r",
    "0",
    "z",
    "3",
    "t",
    "y",
    "1",
    "5",
    "2",
    "4",
    "E",
    "B",
    "C",
    "Q",
    "F",
    "R",
    "T",
    "U",
    "W",
    "V",
    "X",
    "Y",
    "Z",
    "b",
    "a",
    "c",
    "d",
    "D",
    "G",
    "L",
    "H",
    "I",
    "-",
    "J",
    "K",
    "M",
    "O",
    "N",
    "f",
    "e",
    "h",
    "g",
    "P",
    "i",
    "S",
    "k",
    "l",
    "m",
    "u",
    "j",
    "v",
    "n",
    "o",
    "p",
    "9",
    "w",
    "6",
    "7",
    "8",
    "x",
    "_",
  ],
  paddingChar: "=",
  maxRequiredLength: 64,
  bitLength: 6, // 64 = 2^6
};

const ALL_SYMBOLS: readonly DduSetSymbol[] = [
  DduSetSymbol.DDU,
  DduSetSymbol.ONECHARSET,
] as const;

/**
 * 심볼에 해당하는 charset 설정을 반환합니다.
 * @param symbol - charset 심볼
 * @returns CharSetConfig 또는 undefined
 */
export function getCharSet(symbol: DduSetSymbol): CharSetConfig | undefined {
  switch (symbol) {
    case DduSetSymbol.DDU:
      return dduCharSet;
    case DduSetSymbol.ONECHARSET:
      return oneCharSet;
    default:
      return undefined;
  }
}

/**
 * 모든 사용 가능한 charset 심볼 목록을 반환합니다.
 * @returns DduSetSymbol 배열
 */
export function getAllSymbols(): DduSetSymbol[] {
  return [...ALL_SYMBOLS];
}

/**
 * 해당 심볼의 charset이 존재하는지 확인합니다.
 * @param symbol - 확인할 charset 심볼
 * @returns 존재 여부
 */
export function hasCharSet(symbol: DduSetSymbol): boolean {
  switch (symbol) {
    case DduSetSymbol.DDU:
    case DduSetSymbol.ONECHARSET:
      return true;
    default:
      return false;
  }
}
