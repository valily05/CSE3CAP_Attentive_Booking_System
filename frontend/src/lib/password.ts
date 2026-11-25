export function passwordChecks(value: string) {
 const length = [...value].length >= 8;
 const symbol = /[\p{P}\p{S}]/u.test(value);
 const maximum = new TextEncoder().encode(value).length <= 72;
 return { length, symbol, maximum, valid: length && maximum };
}
