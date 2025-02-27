## ddunigma-node

### Overview

Node.js implementation of [ddunigma](https://github.com/i3l3/ddunigma) (Python original)

### Credits

- Original Python Implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

### Usage

- Use Basic
```js
import { Ddu64 } from "@ddunigma/node";

const ddu64 = new Ddu64(); //default encode utf-8

const answer = "뜌땨어 고수가 될거야!";

const encoded = ddu64.encode(answer);
console.log(encoded);
//뜌.뜌이뜌.뜌땨뜌?뜌이뜌땨뜌야뜌.뜌이뜌.뜌땨뜌이뜌?뜌!뜌뜌뜌.뜌우뜌땨뜌땨뜌우뜌이뜌?뜌야뜌땨뜌뜌뜌땨뜌?뜌!뜌이뜌?뜌우뜌!뜌뜌뜌땨뜌?뜌?뜌이뜌땨뜌뜌뜌야뜌?뜌땨뜌?뜌!뜌이뜌?뜌뜌뜌야뜌뜌뜌뜌뜌이뜌뜌뜌우뜌!뜌우뜌야뜌야뜌땨뜌이뜌뜌뜌우뜌!뜌이뜌!뜌야뜌우뜌우뜌뜌뜌우뜌!뜌야뜌야뜌!뜌우뜌우뜌?뜌뜌뜌야뜌땨
const decoded = ddu64.decode(encoded);
console.log(decoded);
//뜌땨어 고수가 될거야!

//Encoding Shorter
const encodedShorter = ddu64.encode(answer, { usePowerOfTwo: true });
console.log(encodedShorter);
//.이.땨?이땨야.이.땨이?!뜌.우땨땨우이?야땨뜌땨?!이?우!뜌땨??이땨뜌야?땨?!이?뜌야뜌뜌이뜌우!우야야땨이뜌우!이!야우우뜌우!야야!우우?뜌야땨
const decodedShorter = ddu64.decode(encodedShorter, { usePowerOfTwo: true });
console.log(decodedShorter);
//뜌땨어 고수가 될거야!
```

- Use Custom Encoding CharSet
```js
import { Ddu64 } from "@ddunigma/node";
const koreanChars = [
  // 뜌 계열
  "뜌", "뜍", "뜎", "뜏", "뜐", "뜑", "뜒", "뜓", "뜔", "뜕", "뜖", "뜗", "뜘", "뜙", "뜚",
  "뜛", "뜜", "뜝", "뜞", "뜟", "뜠", "뜡", "뜢", "뜣", "뜤", "뜥", "뜦", "뜧", "뜨", "뜩",
  "뜪", "뜫", "뜬", "뜭", "뜮", "뜯", "뜰", "뜱", "뜲", "뜳", "뜴", "뜵", "뜶", "뜷", "뜸",
  "뜹", "뜺", "뜻", "뜼", "뜽", "뜾", "뜿",
  // 땨 계열
  "땨", "땩", "땪", "땫", "땬", "땭", "땮", "땯", "땰", "땱", "땲", "땳", "땴", "땵", "땶",
  "땷", "땸", "땹", "땺", "땻", "땼", "땽", "땾", "땿", "떀", "떁", "떂", "떃", "떄", "떅",
  "떆", "떇", "떈", "떉", "떊", "떋", "떌", "떍", "떎", "떏", "떐", "떑", "떒", "떓", "떔",
  "떕", "떖", "떗", "떘", "떙", "떚", "떛",
  // 우 계열
  "우", "욱", "욲", "욳", "운", "울", "욶", "욷", "움", "웁", "웂", "웃", "웄", "웅", "웆",
  "웇", "워", "웍", "웎", "웏", "원", "월", "웒", "웓", "월", "웕", "웖", "웗", "웘", "웙",
  "웚", "웛", "위", "윅", "윆", "윇", "윈", "윉", "윊", "윋", "윌", "윍", "윎", "윏", "윐",
  "윑", "윒", "윓", "윔", "윕", "윖", 
  // 따 계열
  "따", "딱", "딲", "딳", "딴", "딵", "딶", "딷", "딸", "딹", "딺", "딻", "딼", "딽", "딾",
  "딿", "땀", "땁", "땂", "땃", "땄", "땅", "땆", "땇", "땈", "땉", "땊", "땋", "때", "땍",
  "땎", "땏", "때", "땑", "땒", "땓", "땔", "땕", "땖", "땗", "땘", "땙", "땚", "땛", "땜",
  "땝", "땞", "땟", "땠", "땡", "땢",
  // 야 계열
  "야", "약", "얂", "얃", "얄", "얅", "얆", "얇", "얈", "얉", "얊", "얋", "얌", "얍", "얎",
  "얏", "양", "양", "얒", "얓", "얔", "얕", "얖", "얗", "얘", "얙", "얚", "얛", "얜", "얝",
  "얞", "얟", "얠", "얡", "얢", "얣", "얤", "얥", "얦", "얧", "얨", "얩", "얪", "얫", "얬",
  "얭", "얮", "얯", "얰", "얱"
];

const ddu64 = new Ddu64(koreanChars,'뭐');

const answer = "안녕하세요";
const encoded = ddu64.encode(answer);
console.log(encoded);
//뜌얞뜌윑뜌위뜌얝뜌웙뜌윑뜌얟뜌윑뜌윔뜌얞뜌웘뜌땍뜌얞뜌윖뜌윐
const decoded = ddu64.decode(encoded);
console.log(decoded);
//안녕하세요

//Encoding Shorter
const encodedShorter = ddu64.encode(answer, { usePowerOfTwo: true });
console.log(encodedShorter);
//얞윑위얝웙윑얟윑윔얞웘땍얞윖윐
const decodedShorter = ddu64.decode(encodedShorter, { usePowerOfTwo: true });
console.log(decodedShorter);
//안녕하세요
```
