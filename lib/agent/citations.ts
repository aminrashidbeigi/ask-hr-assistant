/** All citation numbers in a text: "[1]", "[2][3]" and "[1, 2]" are all understood. */
export function parseCitationNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)) {
    for (const part of m[1].split(/[,;]/)) out.push(Number(part.trim()));
  }
  return out;
}
