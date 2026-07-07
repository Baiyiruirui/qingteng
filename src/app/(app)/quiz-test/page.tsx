import { redirect } from 'next/navigation'
import { canUseInternalTools } from '@/lib/demo-guard'
import QuizTestClient from './_quiz-test-client'

export default async function QuizTestPage() {
  if (!(await canUseInternalTools())) redirect('/chat')
  return <QuizTestClient />
}
