import { Ddu64 } from "..";

const ddu64 = new Ddu64(["D", "d", "U", "u", "T", "t", "A", "a"], "응");

const answer = "안녕 나 안보고싶었어?";
const encoded = ddu64.encode64(answer);
console.log(encoded);
const decoded = ddu64.decode64(encoded);
console.log(decoded);

console.log("=-==");
const encoded_eng = ddu64.encode(answer, "KR");
console.log(encoded_eng);

const decoded_eng = ddu64.decode(encoded_eng, "KR");
console.log(decoded_eng);

console.log("=-==");
const ddu64_other = new Ddu64(
  ["오", "징", "어", "무", "야", "호","랑","나","너","누","눈"],
  "즁"
);

const answer2 =
  "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?";
const encoded2 = ddu64_other.encode(answer2);
console.log(encoded2);
const decoded2 = ddu64_other.decode(encoded2);
console.log(decoded2);
