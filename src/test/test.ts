import { Ddu64, DduSetSymbol } from "../index.js";

const koreanChars = [
  // 뜌 계열
  "뜌",
  "뜍",
  "뜎",
  "뜏",
  "뜐",
  "뜑",
  "뜒",
  "뜓",
  "뜔",
  "뜕",
  "뜖",
  "뜗",
  "뜘",
  "뜙",
  "뜚",
  "뜛",
  "뜜",
  "뜝",
  "뜞",
  "뜟",
  "뜠",
  "뜡",
  "뜢",
  "뜣",
  "뜤",
  "뜥",
  "뜦",
  "뜧",
  "뜨",
  "뜩",
  "뜪",
  "뜫",
  "뜬",
  "뜭",
  "뜮",
  "뜯",
  "뜰",
  "뜱",
  "뜲",
  "뜳",
  "뜴",
  "뜵",
  "뜶",
  "뜷",
  "뜸",
  "뜹",
  "뜺",
  "뜻",
  "뜼",
  "뜽",
  "뜾",
  "뜿",

  // 땨 계열
  "땨",
  "땩",
  "땪",
  "땫",
  "땬",
  "땭",
  "땮",
  "땯",
  "땰",
  "땱",
  "땲",
  "땳",
  "땴",
  "땵",
  "땶",
  "땷",
  "땸",
  "땹",
  "땺",
  "땻",
  "땼",
  "땽",
  "땾",
  "땿",
  "떀",
  "떁",
  "떂",
  "떃",
  "떄",
  "떅",
  "떆",
  "떇",
  "떈",
  "떉",
  "떊",
  "떋",
  "떌",
  "떍",
  "떎",
  "떏",
  "떐",
  "떑",
  "떒",
  "떓",
  "떔",
  "떕",
  "떖",
  "떗",
  "떘",
  "떙",
  "떚",
  "떛",

  // 우 계열
  "우",
  "욱",
  "욲",
  "욳",
  "운",
  "울",
  "욶",
  "욷",
  "움",
  "웁",
  "웂",
  "웃",
  "웄",
  "웅",
  "웆",
  "웇",
  "워",
  "웍",
  "웎",
  "웏",
  "원",
  "월",
  "웒",
  "웓",
  "월",
  "웕",
  "웖",
  "웗",
  "웘",
  "웙",
  "웚",
  "웛",
  "위",
  "윅",
  "윆",
  "윇",
  "윈",
  "윉",
  "윊",
  "윋",
  "윌",
  "윍",
  "윎",
  "윏",
  "윐",
  "윑",
  "윒",
  "윓",
  "윔",
  "윕",
  "윖",

  // 따 계열
  "따",
  "딱",
  "딲",
  "딳",
  "딴",
  "딵",
  "딶",
  "딷",
  "딸",
  "딹",
  "딺",
  "딻",
  "딼",
  "딽",
  "딾",
  "딿",
  "땀",
  "땁",
  "땂",
  "땃",
  "땄",
  "땅",
  "땆",
  "땇",
  "땈",
  "땉",
  "땊",
  "땋",
  "때",
  "땍",
  "땎",
  "땏",
  "때",
  "땑",
  "땒",
  "땓",
  "땔",
  "땕",
  "땖",
  "땗",
  "땘",
  "땙",
  "땚",
  "땛",
  "땜",
  "땝",
  "땞",
  "땟",
  "땠",
  "땡",
  "땢",

  // 야 계열
  "야",
  "약",
  "얂",
  "얃",
  "얄",
  "얅",
  "얆",
  "얇",
  "얈",
  "얉",
  "얊",
  "얋",
  "얌",
  "얍",
  "얎",
  "얏",
  "양",
  "양",
  "얒",
  "얓",
  "얔",
  "얕",
  "얖",
  "얗",
  "얘",
  "얙",
  "얚",
  "얛",
  "얜",
  "얝",
  "얞",
  "얟",
  "얠",
  "얡",
  "얢",
  "얣",
  "얤",
  "얥",
  "얦",
  "얧",
  "얨",
  "얩",
  "얪",
  "얫",
  "얬",
  "얭",
  "얮",
  "얯",
  "얰",
  "얱",
];

function yaho()
{
  console.log("=== Test 1: Non-power-of-two charset (3 chars) ===");
  const encoder = new Ddu64("우따야","뭐");
  console.log("Charset length:", (encoder as any).dduChar.length);
  console.log("Bit length:", (encoder as any).bitLength);
  console.log("usePowerOfTwo:", (encoder as any).usePowerOfTwo);
  
  const encoded = encoder.encode("안녕하세요");
  console.log("Encoded:", encoded);
  const decoded = encoder.decode(encoded);
  console.log("Decoded:", decoded);
  console.log("Match:", decoded === "안녕하세요");
  console.log();
  
  console.log("=== Test 2: Power-of-two charset (4 chars) ===");
  const encoder2 = new Ddu64("우따야아","뭐");
  console.log("Charset length:", (encoder2 as any).dduChar.length);
  console.log("Bit length:", (encoder2 as any).bitLength);
  console.log("usePowerOfTwo:", (encoder2 as any).usePowerOfTwo);
  
  const encoded2 = encoder2.encode("안녕하세요");
  console.log("Encoded:", encoded2);
  const decoded2 = encoder2.decode(encoded2);
  console.log("Decoded:", decoded2);
  console.log("Match:", decoded2 === "안녕하세요");
  console.log();
  
  console.log("=== Test 3: Non-power-of-two with usePowerOfTwo=true ===");
  const encoder3 = new Ddu64("우따야", "뭐", { usePowerOfTwo: true });
  console.log("Charset length:", (encoder3 as any).dduChar.length);
  console.log("Bit length:", (encoder3 as any).bitLength);
  console.log("usePowerOfTwo:", (encoder3 as any).usePowerOfTwo);
  
  const encoded3 = encoder3.encode("안녕하세요");
  console.log("Encoded:", encoded3);
  const decoded3 = encoder3.decode(encoded3);
  console.log("Decoded:", decoded3);
  console.log("Match:", decoded3 === "안녕하세요");
  console.log("usePowerOfTwo:", (encoder3 as any).usePowerOfTwo);
console.log();

  const korEncoder = new Ddu64(koreanChars, "뭐");
  const encodedKor = korEncoder.encode("안녕하세요");
  console.log("Encoded:", encodedKor);
  const decodedKor = korEncoder.decode(encodedKor);
  console.log("Decoded:", decodedKor);
  console.log("Match:", decodedKor === "안녕하세요");
  console.log("usePowerOfTwo:", (korEncoder as any).usePowerOfTwo);
console.log();
  
  const korEncoder2 = new Ddu64(koreanChars, "뭐", { usePowerOfTwo: true });
  const encodedKor2 = korEncoder2.encode("안녕하세요");
  console.log("Encoded:", encodedKor2);
  const decodedKor2 = korEncoder2.decode(encodedKor2);
  console.log("Decoded:", decodedKor2);
  console.log("Match:", decodedKor2 === "안녕하세요");
  console.log("usePowerOfTwo:", (korEncoder2 as any).usePowerOfTwo);
console.log();
    
  const korEncoder3 = new Ddu64(koreanChars, "뭐", { usePowerOfTwo: false });
  const encodedKor3 = korEncoder3.encode("안녕하세요");
  console.log("Encoded:", encodedKor3);
  const decodedKor3 = korEncoder3.decode(encodedKor3);
  console.log("Decoded:", decodedKor3);
  console.log("Match:", decodedKor3 === "안녕하세요");
  console.log("usePowerOfTwo:", (korEncoder3 as any).usePowerOfTwo);
}

yaho();