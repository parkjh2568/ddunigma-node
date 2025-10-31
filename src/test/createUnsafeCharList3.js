// E, l 제외한 문자셋: A-Z(E제외), a-z(l제외), 0-9, +, -, _, =
// 3자 문자열 생성
// 제외 조건 없음 (모든 위치에서 사용 가능)

function generateCharList(count) {
    // E, l만 제외한 charset
    const customChars = '456bcdefB789_KLMNOPAxyz0123QRSTUV=WXYZaCDFGHIJqrst-uvwghijkmnop';
    
    // 각 자리 후보 (제외 조건 없음)
    const firstChars = customChars.split('');
    const secondChars = customChars.split('');
    const thirdChars = customChars.split('');
    
    console.log(`첫 글자 가능한 개수: ${firstChars.length}`);
    console.log(`둘째 글자 가능한 개수: ${secondChars.length}`);
    console.log(`셋째 글자 가능한 개수: ${thirdChars.length}`);
    console.log(`최대 조합 가능한 개수: ${firstChars.length * secondChars.length * thirdChars.length}`);
    
    // 최대 가능 개수 확인
    const maxPossible = firstChars.length * secondChars.length * thirdChars.length;
    if (count > maxPossible) {
      throw new Error(`요청한 개수(${count})가 가능한 최대 조합(${maxPossible})을 초과합니다.`);
    }
    
    // 랜덤 생성 방식 (모든 조합을 미리 만들지 않음)
    const result = [];
    const usedSet = new Set();
    const blockedMiddleStrings = new Set();
    
    const maxAttempts = count * 100; // 충분한 시도 횟수
    let attempts = 0;
    
    console.log(`\n생성 중... (목표: ${count}개)\n`);
    
    while (result.length < count && attempts < maxAttempts) {
      attempts++;
      
      // 랜덤 조합 생성
      const first = firstChars[Math.floor(Math.random() * firstChars.length)];
      const second = secondChars[Math.floor(Math.random() * secondChars.length)];
      const third = thirdChars[Math.floor(Math.random() * thirdChars.length)];
      const combination = first + second + third;
      
      // 이미 사용된 조합이면 스킵
      if (usedSet.has(combination)) {
        continue;
      }
      
      if (result.length >= count) break;
      
      // 현재 combination이 이미 차단된 중간 문자열인지 확인
      if (blockedMiddleStrings.has(combination)) {
        continue;
      }
      
      // 이미 선택된 문자열들과 연결했을 때 중간에 생성되는 문자열 확인
      let isValid = true;
      const newMiddleStrings = [];
      
      for (const existing of result) {
        // existing(3자) + combination(3자) 을 연결했을 때 중간 문자열들
        // "ABC" + "DEF" = "ABCDEF" 에서 중간: "BCD", "CDE"
        const middleStr1 = existing[1] + existing[2] + combination[0]; // BCD
        const middleStr2 = existing[2] + combination[0] + combination[1]; // CDE
        
        // combination + existing을 연결했을 때 중간 문자열들
        // "DEF" + "ABC" = "DEFABC" 에서 중간: "EFA", "FAB"
        const middleStr3 = combination[1] + combination[2] + existing[0]; // EFA
        const middleStr4 = combination[2] + existing[0] + existing[1]; // FAB
        
        // 중간 문자열이 이미 선택된 문자열이거나 현재 추가하려는 문자열과 같은지 확인
        const middleStrings = [middleStr1, middleStr2, middleStr3, middleStr4];
        
        for (const middleStr of middleStrings) {
          if (usedSet.has(middleStr) || middleStr === combination) {
            isValid = false;
            break;
          }
        }
        
        if (!isValid) break;
        
        // 나중에 추가될 수 없는 중간 문자열들을 수집
        newMiddleStrings.push(...middleStrings);
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
    
    console.log(`총 시도 횟수: ${attempts}회`);
    console.log(`성공률: ${(result.length / attempts * 100).toFixed(2)}%\n`);
    
    if (result.length < count) {
      console.log(`경고: 조건을 만족하는 문자열을 ${count}개 생성할 수 없습니다.`);
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
  const requestedCount = process.argv[2] ? parseInt(process.argv[2]) : 2048;
  
  try {
    printCharList(requestedCount);
  } catch (error) {
    console.error('오류:', error.message);
  }
  
  // # 기본 (2048개)
  // node createUnsafeCharList3.js
  
  // # 원하는 개수 지정
  // node createUnsafeCharList3.js 1024
  // node createUnsafeCharList3.js 2048
  // node createUnsafeCharList3.js 4096

