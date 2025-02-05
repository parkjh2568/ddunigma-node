## ddunigma-node

### Overview
Node.js implementation of [ddunigma](https://github.com/i3l3/ddunigma) (Python original)

### Credits
- Original Python Implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

### Usage
```js
import { Ddu64 } from 'ddunigma-node'

const ddu64 = new Ddu64();

const answer = "뜌땨어 고수가 될거야!"
const encoded = ddu64.encode(answer);
console.log(encoded);
const decoded = ddu64.decode(encoded);
console.log(decoded);
```