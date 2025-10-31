import { Ddu64, DduSetSymbol } from "../index.js";

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
}

yaho();