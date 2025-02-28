import { Ddu64 } from "..";
const koreanChars = [
  // 기본 자음+모음 조합
  "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
  "개", "내", "대", "래", "매", "배", "새", "애", "재", "채", "캐", "태", "패", "해",
  "고", "노", "도", "로", "모", "보", "소", "오", "조", "초", "코", "토", "포", "호",
  "구", "누", "두", "루", "무", "부", "수", "우", "주", "추", "쿠", "투", "푸", "후",
  "그", "느", "드", "르", "므", "브", "스", "으", "즈", "츠", "크", "트", "프", "흐",
  "기", "니", "디", "리", "미", "비", "시", "이", "지", "치", "키", "티", "피", "히",
  "게", "네", "데", "레", "메", "베", "세", "에", "제", "체", "케", "테", "페", "헤",
  "겨", "녀", "더", "려", "며", "벼", "셔", "여", "져", "쳐", "켜", "텨", "펴", "혀",
  "교", "뇨", "됴", "료", "묘", "뵤", "쇼", "요", "죠", "쵸", "쿄", "툐", "표", "효",
  "규", "뉴", "듀", "류", "뮤", "뷰", "슈", "유", "쥬", "츄", "큐", "튜", "퓨", "휴",
  // 받침 있는 조합
  "각", "낙", "닥", "락", "막", "박", "삭", "악", "작", "착", "칵", "탁", "팍", "학",
  "갑", "납", "답", "랍", "맙", "밥", "삽", "압", "잡", "찹", "캅", "탑", "팝", "합",
  "곡", "녹", "독", "록", "목", "복", "속", "옥", "족", "촉", "콕", "톡", "폭", "혹",
  "국", "눅", "둑", "룩", "묵", "북", "숙", "욱", "죽", "축", "쿡", "툭", "푹", "훅",
  "극", "늑", "득", "륵", "믁", "븍", "슥", "윽", "즉", "츰", "큭", "특", "픅", "흑",
  "금", "늠", "듬", "름", "뭄", "붐", "숨", "음", "줌", "춤", "큼", "틈", "품", "흠",
  "갈", "날", "달", "랄", "말", "발", "살", "알", "잘", "찰", "칼", "탈", "팔", "할",
  "감", "남", "담", "람", "맘", "밤", "샘", "암", "잠", "참", "캄", "탐", "팜", "함",
  "건", "넌", "던", "런", '먼'
];//129

const ddu64 = new Ddu64(["D", "d", "U", "u", "T", "t", "A", "a"], "응");

const answer = "안녕 나 안보고싶었어?12";
const encoded = ddu64.encode(answer, {usePowerOfTwo : true});
console.log(encoded);
const decoded = ddu64.decode(encoded , {usePowerOfTwo : true});
console.log(decoded);

console.log("=-==");
const encoded_eng = ddu64.encode(answer, {dduSetSymbol : "KR"});
console.log(encoded_eng);

const decoded_eng = ddu64.decode(encoded_eng, {dduSetSymbol : "KR"});
console.log(decoded_eng);

console.log("=-==");
const ddu64_other = new Ddu64(
  koreanChars,
  "즁"
);

const answer2 =
  "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
  const encoded2 = ddu64_other.encode(answer2, {usePowerOfTwo : true});
  console.log(encoded2);
  const decoded2 = ddu64_other.decode(encoded2, {usePowerOfTwo : true});
  console.log(decoded2);