import { CharSetConfig, DduSetSymbol } from "./core/types";

const dduCharSet: CharSetConfig = {
  symbol: DduSetSymbol.DDU,
  charSet: ["뜌", "땨", "이", "우", "야", "듀", "댜", "뎨"],
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ", "ㅈ", "ㅇ", "ㅅ", "ㅆ"],
  maxRequiredLength: 64,
  bitLength: 6,
  paddingChar: "뭐",
  useRepeatPadding: true,
};

const dduCharSetV1: CharSetConfig = {
  symbol: DduSetSymbol.DDU_V1,
  charSet: ["뜌", "땨", "이", "우", "야", "!", "?", "."],
  maxRequiredLength: 8,
  bitLength: 6,
  paddingChar: "뭐",
  useRepeatPadding: true,
  usePowerOfTwo: false,
  encodingProfile: {
    bitLength: 6,
    usePowerOfTwo: false,
    bitsPerPadChar: 2,
  },
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
  bitLength: 6,
};

export function getCharSet(symbol: DduSetSymbol): CharSetConfig | undefined {
  switch (symbol) {
    case DduSetSymbol.DDU:
      return dduCharSet;
    case DduSetSymbol.DDU_V1:
      return dduCharSetV1;
    case DduSetSymbol.ONECHARSET:
      return oneCharSet;
    default:
      return undefined;
  }
}
