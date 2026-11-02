// Test double for next/headers: a mutable cookie jar + header bag the tests can set.
export const __jar = new Map<string, string>();
export const __headers = new Map<string, string>([['x-forwarded-for', '203.0.113.7'], ['user-agent', 'vitest']]);
export async function cookies() {
  return {
    get: (n: string) => (__jar.has(n) ? { name: n, value: __jar.get(n)! } : undefined),
    set: (n: string, v: string) => void __jar.set(n, v),
    delete: (n: string | { name: string }) => void __jar.delete(typeof n === 'string' ? n : n.name),
  };
}
export async function headers() {
  return { get: (n: string) => __headers.get(n.toLowerCase()) ?? null };
}
