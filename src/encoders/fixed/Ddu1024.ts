import { DduConstructorOptions, dduDefaultConstructorOptions, DduSetSymbol } from "types";
import { FixedLengthDdu } from "../../base/FixedLengthDdu";
import { getCharSet } from "charSets";

export class Ddu1024 extends FixedLengthDdu {
  constructor(dduChar?: string[], paddingChar?: string, dduOptions?: DduConstructorOptions) {
    let dduCharDefault: string[];
    let paddingCharDefault: string;
    let requiredLength: number;
    let bitLength: number;

    try
    {
      if (dduChar)
        {
          if (paddingChar)
          {
            const dduCharLength = dduOptions?.requiredLength ?? dduChar?.length;
            if (dduCharLength < dduChar?.length)
            {
              throw Error(`dduChar must be at least your Selected Set Length ${dduCharLength} characters long`);
            }
            dduCharDefault = dduChar;
            paddingCharDefault = paddingChar;
            requiredLength = dduCharLength;
            bitLength = 10;
          }
          else
          {
            throw Error("paddingChar is required when dduChar is provided");
          }
        }
        else if (dduOptions?.dduChar)
        {
          if (dduOptions?.paddingChar)
          {

          }
          else
          {
            throw Error("paddingChar is required when dduOptions.dduChar is provided");
          }
        }
        else
        {
          const fixedCharSet = getCharSet(dduOptions?.dduSetSymbol ?? DduSetSymbol.DDU);
          if (fixedCharSet)
          {
            dduCharDefault = fixedCharSet.charSet;
            paddingCharDefault = fixedCharSet.paddingChar;
            requiredLength = fixedCharSet.maxRequiredLength;
            bitLength = fixedCharSet.bitLength;
          }
          else
          {
            throw Error(`CharSet with symbol ${dduOptions?.dduSetSymbol ?? DduSetSymbol.DDU} not found`);
          }
        }
    
    }
    catch (error)
    {
      if (dduOptions?.useBuildErrorReturn ?? false)
      {
        throw error;
      }
      else
      {
        const fixedCharSet = getCharSet(dduOptions?.dduSetSymbol ?? DduSetSymbol.DDU);
        if (fixedCharSet)
        {
          dduCharDefault = fixedCharSet.charSet;
          paddingCharDefault = fixedCharSet.paddingChar;
          requiredLength = fixedCharSet.maxRequiredLength;
          bitLength = fixedCharSet.bitLength;
        }
        else
        {
          throw Error(`CharSet with symbol ${dduOptions?.dduSetSymbol ?? DduSetSymbol.DDU} not found`);
        }
      }

      super(
        dduCharDefault,
        paddingCharDefault,
        requiredLength,
        bitLength,
        dduCharDefault,
        paddingCharDefault
      );
    }
  }
}

