## ddunigma-node

### [원작자 레포](https://github.com/i3l3/ddunigma)

```js
import { Ddu64 } from 'ddunigma-node'

const ddu64 = new Ddu64();

const answer = "뜌땨어 고수가 될거야!"
const encoded = ddu64.encode(Buffer.from(answer, 'utf-8'));
console.log(encoded);
const decoded = ddu64.decode(encoded).toString('utf-8');
console.log(decoded);
```