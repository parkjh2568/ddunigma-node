function generateCharList(count) {
  const urlSafeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  
  // 첫 글자 후보 
  const firstChars = urlSafeChars.split('').filter(c => c !== 'E' && c !== 'l' && c !== 'y');
  
  // 둘째 글자 후보
  const secondChars = urlSafeChars.split('').filter(c => c !== 'E' && c !== 'l' && c !== 'y');
  
  console.log(`첫 글자 가능한 개수: ${firstChars.length}`);
  console.log(`둘째 글자 가능한 개수: ${secondChars.length}`);
  console.log(`최대 조합 가능한 개수: ${firstChars.length * secondChars.length}`);
  
  // 최대 가능 개수 확인
  const maxPossible = firstChars.length * secondChars.length;
  if (count > maxPossible) {
    throw new Error(`요청한 개수(${count})가 가능한 최대 조합(${maxPossible})을 초과합니다.`);
  }
  
  // 모든 가능한 조합 생성
  const allCombinations = [];
  for (const first of firstChars) {
    for (const second of secondChars) {
      allCombinations.push(first + second);
    }
  }
  
  // Fisher-Yates 셔플 알고리즘으로 무작위 섞기
  for (let i = allCombinations.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCombinations[i], allCombinations[j]] = [allCombinations[j], allCombinations[i]];
  }
  
  // 요청한 개수만큼 선택하되, 연결 시 중간 문자열이 겹치지 않도록 필터링
  const result = [];
  const usedSet = new Set();
  const blockedMiddleStrings = new Set(); // 중간 문자열로 생성될 수 있는 것들을 저장
  
  for (const combination of allCombinations) {
    if (result.length >= count) break;
    
    // 현재 combination이 이미 차단된 중간 문자열인지 확인
    if (blockedMiddleStrings.has(combination)) {
      continue;
    }
    
    // 이미 선택된 문자열들과 연결했을 때 중간에 생성되는 문자열 확인
    let isValid = true;
    const newMiddleStrings = [];
    
    for (const existing of result) {
      // existing + combination을 연결했을 때 중간 문자열
      const middleStr1 = existing[1] + combination[0];
      
      // combination + existing을 연결했을 때 중간 문자열
      const middleStr2 = combination[1] + existing[0];
      
      // 중간 문자열이 이미 선택된 문자열이거나 현재 추가하려는 문자열과 같은지 확인
      if (usedSet.has(middleStr1) || middleStr1 === combination) {
        isValid = false;
        break;
      }
      if (usedSet.has(middleStr2) || middleStr2 === combination) {
        isValid = false;
        break;
      }
      
      // 나중에 추가될 수 없는 중간 문자열들을 수집
      newMiddleStrings.push(middleStr1, middleStr2);
    }
    
    if (isValid) {
      result.push(combination);
      usedSet.add(combination);
      
      // 새로 생성된 중간 문자열들을 차단 목록에 추가
      for (const middleStr of newMiddleStrings) {
        blockedMiddleStrings.add(middleStr);
      }
    }
  }
  
  if (result.length < count) {
    console.log(`\n경고: 조건을 만족하는 문자열을 ${count}개 생성할 수 없습니다.`);
    console.log(`생성 가능한 최대 개수: ${result.length}개\n`);
  }
  
  return result;
}

function printCharList(count) {
  const charList = generateCharList(count);
  
  console.log(`생성된 문자 배열 (총 ${charList.length}개):`);
  console.log('[');
  
  // 한 줄에 8개씩 출력
  for (let i = 0; i < charList.length; i += 8) {
    const chunk = charList.slice(i, i + 8);
    const formattedChunk = chunk.map(s => `  '${s}'`).join(', ');
    
    // 마지막 줄이 아니면 콤마 추가
    if (i + 8 < charList.length) {
      console.log(formattedChunk + ',');
    } else {
      console.log(formattedChunk);
    }
  }
  
  console.log(']');
}

// 사용 예시
const requestedCount = process.argv[2] ? parseInt(process.argv[2]) : 128;

try {
  printCharList(requestedCount);
} catch (error) {
  console.error('오류:', error.message);
}

// # 기본 (128개)
// node createCharList.js

// # 원하는 개수 지정
// node createCharList.js 128
// node createCharList.js 512
// node createCharList.js 1024