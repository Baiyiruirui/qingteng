export function safeReturnTo(value: string | null | undefined, fallback = '/poems') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

export function withReturnTo(path: string, returnTo: string) {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
