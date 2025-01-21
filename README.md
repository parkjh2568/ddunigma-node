## ddunigma-node

#### Code Author [i3ls](https://github.com/i3l3) [gunu3371](https://github.com/gunu3371)
#### [Author Repo](https://github.com/i3l3/ddunigma)

```js
import { Ddu64 } from 'ddunigma-node'

const ddu64 = new Ddu64();

const answer = "뜌땨어 고수가 될거야!"
const encoded = ddu64.encode(Buffer.from(answer, 'utf-8'));
console.log(encoded);
const decoded = ddu64.decode(encoded).toString('utf-8');
console.log(decoded);
```