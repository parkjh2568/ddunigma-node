import { Ddu64, Custom64 } from "..";

const secret =
  "Asqr0z3ty1524EBCQFRTUWVXYZbacdD+GLHIJKMONfehgPiSklmujvnop9w678x/";
const padding = "=";

function encryptDdu64(content: string) {
  const custom64 = new Custom64();
  const encoded = custom64.encode(content, { usePowerOfTwo: true });
  return encoded;
}

function decryptDdu64(content: string) {
  const custom64 = new Custom64();
  const decoded = custom64.decode(content, { usePowerOfTwo: true });
  return decoded;
}

console.log("타운카 너무좋아123");
console.log("");
console.log(encryptDdu64("타운카 너무좋아123"));
console.log("");
console.log(decryptDdu64(encryptDdu64("타운카 너무좋아123")));
