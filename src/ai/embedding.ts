import 'server-only'
import { embedText } from './embedding-core'

export async function embed(text: string): Promise<number[]> {
  return embedText(text)
}
