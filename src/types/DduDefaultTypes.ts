import { DduSetSymbol } from "./DduEnums";
import { DduConstructorOptions } from "./DduInterface";

const dduDefaultConstructorOptions: DduConstructorOptions = {
  dduSetSymbol: DduSetSymbol.DDU,
  usePowerOfTwo: true,
  requiredLength: 8,
  bitLength: 3,
  useBuildErrorReturn: false,
};

export {
    dduDefaultConstructorOptions
}