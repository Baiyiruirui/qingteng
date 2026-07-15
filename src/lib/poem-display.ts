export function normalizeDynasty(value: string | null | undefined) {
  const dynasty = value?.trim()
  if (!dynasty) return null
  return dynasty.toLowerCase() === 'tang' ? '唐' : dynasty
}
