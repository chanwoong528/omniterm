/**
 * 로컬에서만 쓰는 고유 id. 구형 웹뷰(secure context가 아닌 경우 등)에서는
 * crypto.randomUUID가 없을 수 있어 시간+난수로 대체한다.
 */
export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
