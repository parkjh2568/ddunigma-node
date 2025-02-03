export class Ddu64 {
  private dduChar: string[];
  private paddingChar: string;
  private dduCharKr: string[];
  private paddingCharKr: string;

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, i + length);
    }
  }

  constructor(dduChar?: string[], paddingChar?: string) {
    const dduCharKr = ["뜌", "땨", "이", "우", "야", "!", "?", "."];
    const paddingCharKr = "뭐";
    if (!dduChar) {
      dduChar = dduCharKr;
    }
    if (!paddingChar) {
      paddingChar = paddingCharKr;
    }
    this.dduChar = dduChar;
    this.dduCharKr = dduCharKr;
    this.paddingChar = paddingChar;
    this.paddingCharKr = paddingCharKr;
  }

  private getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  private createEncoded(
    input: Buffer,
    bitLength: number
  ): { encoded: string[]; padding: number } {
    let encodedBin = "";
    for (const byte of input) {
      const charRaw = byte.toString(2);
      encodedBin += "0".repeat(8 - charRaw.length) + charRaw;
    }
    const encoded: string[] = [];
    for (const chunk of this.splitString(encodedBin, bitLength)) {
      encoded.push(chunk);
    }
    const padding = bitLength - encoded[encoded.length - 1].length;
    encoded[encoded.length - 1] =
      encoded[encoded.length - 1] + "0".repeat(padding);

    return { encoded, padding };
  }

  encode(input: Buffer, option: string = "default"): string {
    const selectedDduSet = option === "KR" ? this.dduCharKr : this.dduChar;
    const selectedPadding =
      option === "KR" ? this.paddingCharKr : this.paddingChar;
    const selectedDduLength = selectedDduSet.length;
    const bitLength = this.getBitLength(selectedDduLength);
    const { encoded, padding } = this.createEncoded(input, bitLength);
    let result = "";
    for (const char of encoded) {
      const charInt = parseInt(char, 2);
      result +=
        selectedDduSet[Math.floor(charInt / selectedDduLength)] +
        selectedDduSet[charInt % selectedDduLength];
    }
    result += selectedPadding.repeat(Math.floor(padding / 2));
    return result;
  }

  encode64(input: Buffer, option = "default") {
    const selectedDduSet = option === "KR" ? this.dduCharKr : this.dduChar;
    const selectedPadding =
      option === "KR" ? this.paddingCharKr : this.paddingChar;
    const selectedDduLength = selectedDduSet.length;
    const bitLength = this.getBitLength(selectedDduLength);
    const { encoded, padding } = this.createEncoded(input, bitLength);
    let result = "";
    for (const char of encoded) {
      const charInt = parseInt(char, 2);
      result += selectedDduSet[charInt];
    }
    result += selectedPadding.repeat(Math.floor(padding / 2));
    return result;
  }

  decode(input: string, option: string = "default"): Buffer {
    const selectedDduSet = option === "KR" ? this.dduCharKr : this.dduChar;
    const selectedPadding =
      option === "KR" ? this.paddingCharKr : this.paddingChar;
    const selectedDduLength = selectedDduSet.length;
    const bitLength = this.getBitLength(selectedDduLength);

    // 패딩 문자 제거
    const paddingCount = (input.match(new RegExp(selectedPadding, "g")) || [])
      .length;
    input = input.replace(new RegExp(selectedPadding, "g"), "");

    let decodedBin = "";
    for (const chunk of this.splitString(input, 2)) {
      const firstIndex = selectedDduSet.indexOf(chunk[0]);
      const secondIndex = selectedDduSet.indexOf(chunk[1]);
      if (firstIndex === -1 || secondIndex === -1) continue;

      const value = firstIndex * selectedDduLength + secondIndex;
      let char = value.toString(2);
      char = "0".repeat(bitLength - char.length) + char;
      decodedBin += char;
    }

    // 패딩 비트 제거
    const paddingBits = paddingCount * 2;
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }

    const decoded: number[] = [];
    for (const chunk of this.splitString(decodedBin, 8)) {
      if (chunk.length === 8) {
        decoded.push(parseInt(chunk, 2));
      }
    }

    return Buffer.from(decoded);
  }

  decode64(input: string, option = "default") {
    const selectedDduSet = option === "KR" ? this.dduCharKr : this.dduChar;
    const selectedPadding =
      option === "KR" ? this.paddingCharKr : this.paddingChar;
    const selectedDduLength = selectedDduSet.length;
    const bitLength = this.getBitLength(selectedDduLength);

    // 패딩 문자 제거
    const paddingCount = (input.match(new RegExp(selectedPadding, "g")) || [])
      .length;
    input = input.replace(new RegExp(selectedPadding, "g"), "");

    let decodedBin = "";
    for (const chunk of this.splitString(input, 1)) {
      const firstIndex = selectedDduSet.indexOf(chunk[0]);
      if (firstIndex === -1) continue;
      const value = firstIndex;
      let char = value.toString(2);
      char = "0".repeat(bitLength - char.length) + char;
      decodedBin += char;
    }
    // 패딩 비트 제거
    const paddingBits = paddingCount * 2;
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }
    const decoded = [];
    for (const chunk of this.splitString(decodedBin, 8)) {
      if (chunk.length === 8) {
        decoded.push(parseInt(chunk, 2));
      }
    }
    return Buffer.from(decoded);
  }
}
