
export function exhaustiveError(_: never, msg: string) {
  return new Error(msg);
}
