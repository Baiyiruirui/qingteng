import 'dotenv/config'

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

type Check = {
  name: string
  required: boolean
  validate: (value: string) => boolean
  hint: string
}

type Result = {
  check: string
  status: 'PASS' | 'WARN' | 'FAIL'
  detail: string
}

const checks: Check[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    validate: value => /^postgres(ql)?:\/\//.test(value),
    hint: 'Neon PostgreSQL connection string',
  },
  {
    name: 'JWT_SECRET',
    required: true,
    validate: value => value.length >= 32,
    hint: 'at least 32 characters',
  },
  {
    name: 'DEEPSEEK_API_KEY',
    required: true,
    validate: value => value.startsWith('sk-') && value.length >= 20,
    hint: 'DeepSeek API key',
  },
  {
    name: 'UPSTASH_REDIS_REST_URL',
    required: true,
    validate: value => value.startsWith('https://'),
    hint: 'HTTPS Upstash REST URL',
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    required: true,
    validate: value => value.length >= 20,
    hint: 'Upstash REST token',
  },
  {
    name: 'SILICONFLOW_API_KEY',
    required: true,
    validate: value => value.length >= 20,
    hint: 'SiliconFlow embedding key',
  },
  {
    name: 'LANGFUSE_PUBLIC_KEY',
    required: true,
    validate: value => value.length >= 12,
    hint: 'Langfuse public key',
  },
  {
    name: 'LANGFUSE_SECRET_KEY',
    required: true,
    validate: value => value.length >= 12,
    hint: 'Langfuse secret key',
  },
  {
    name: 'TENCENT_SECRET_ID',
    required: true,
    validate: value => value.length >= 16,
    hint: 'Tencent Cloud SecretId',
  },
  {
    name: 'TENCENT_SECRET_KEY',
    required: true,
    validate: value => value.length >= 16,
    hint: 'Tencent Cloud SecretKey',
  },
  {
    name: 'TENCENT_ASR_REGION',
    required: true,
    validate: value => /^ap-[a-z0-9-]+$/.test(value),
    hint: 'Tencent ASR region, e.g. ap-guangzhou',
  },
  {
    name: 'QT_ADMIN_USER_IDS',
    required: false,
    validate: value => value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .every(item => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(item)),
    hint: 'optional comma-separated user UUIDs for internal tools',
  },
]

function isPlaceholder(value: string) {
  return /(?:xxx|changeme|replace-me|user:pass)/i.test(value)
}

function checkEnvironment(): Result[] {
  const results: Result[] = checks.map(check => {
    const value = process.env[check.name]?.trim() ?? ''
    if (!value) {
      return {
        check: `env:${check.name}`,
        status: check.required ? 'FAIL' : 'WARN',
        detail: check.required ? `missing; expected ${check.hint}` : 'not configured; internal tools stay disabled',
      }
    }
    if (isPlaceholder(value) || !check.validate(value)) {
      return {
        check: `env:${check.name}`,
        status: check.required ? 'FAIL' : 'WARN',
        detail: `invalid or placeholder; expected ${check.hint}`,
      }
    }
    return { check: `env:${check.name}`, status: 'PASS', detail: 'configured' }
  })

  results.push({
    check: 'runtime:tls-certificate-validation',
    status: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? 'WARN' : 'PASS',
    detail: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      ? 'NODE_TLS_REJECT_UNAUTHORIZED=0 in this process; HTTPS certificate checks are disabled'
      : 'enabled',
  })

  return results
}

function gitOutput(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function checkTrackedSecrets(): Result[] {
  const files = gitOutput(['ls-files', '-z']).split('\0').filter(Boolean)
  const findings = new Set<string>()
  const patterns = [
    { label: 'API key literal', regex: /\b(?:sk-(?!xxx\b)[A-Za-z0-9_-]{20,}|AKID[A-Za-z0-9]{13,})\b/g },
    { label: 'credentialed PostgreSQL URL', regex: /postgres(?:ql)?:\/\/[^:\s]+:([^@\s]+)@/g },
  ]

  for (const file of files) {
    let content: string
    try {
      if (file === 'pnpm-lock.yaml' || statSync(file).size > 2_000_000) continue
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0
      for (const match of content.matchAll(pattern.regex)) {
        if (pattern.label === 'credentialed PostgreSQL URL') {
          const password = match[1] ?? ''
          if (/^(?:pass|password|xxx)$/i.test(password)) continue
        }
        findings.add(`${file} (${pattern.label})`)
      }
    }
  }

  const envHistory = gitOutput([
    'log',
    '--all',
    '--format=%H',
    '--',
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
  ]).trim()

  return [
    {
      check: 'git:tracked-secret-patterns',
      status: findings.size === 0 ? 'PASS' : 'FAIL',
      detail: findings.size === 0 ? 'no likely secret literals found' : [...findings].join(', '),
    },
    {
      check: 'git:env-history',
      status: envHistory ? 'FAIL' : 'PASS',
      detail: envHistory ? 'an environment file exists in git history' : 'no tracked environment-file history',
    },
  ]
}

function checkRouteCoverage(): Result[] {
  const expectations: Array<{ file: string; tokens: string[] }> = [
    { file: 'src/app/api/auth/login/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/auth/register/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/chat/route.ts', tokens: ['checkRateLimits', 'parseUiMessages'] },
    { file: 'src/app/api/chat/opening/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/conversations/route.ts', tokens: ['getSession'] },
    { file: 'src/app/api/session/immersion/chat/route.ts', tokens: ['checkRateLimits', 'parseUiMessages'] },
    { file: 'src/app/api/session/immersion/opening/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/quiz/judge/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/recite/judge/route.ts', tokens: ['checkRateLimits', 'estimateBase64Bytes'] },
    { file: 'src/app/api/recite/standard/route.ts', tokens: ['getSession', 'checkRateLimits'] },
    { file: 'src/app/api/memories/route.ts', tokens: ['getSession'] },
    { file: 'src/app/api/memories/[id]/route.ts', tokens: ['getSession', 'checkRateLimits'] },
    { file: 'src/app/api/poems/search/route.ts', tokens: ['checkRateLimits'] },
    { file: 'src/app/api/quiz/generate/route.ts', tokens: ['canUseInternalTools'] },
    { file: 'src/app/api/quiz/list/route.ts', tokens: ['canUseInternalTools'] },
    { file: 'src/app/(app)/quiz-test/page.tsx', tokens: ['canUseInternalTools'] },
  ]

  return expectations.map(({ file, tokens }) => {
    const content = readFileSync(file, 'utf8')
    const missing = tokens.filter(token => !content.includes(token))
    return {
      check: `route:${file}`,
      status: missing.length === 0 ? 'PASS' : 'FAIL',
      detail: missing.length === 0 ? 'guarded' : `missing ${missing.join(', ')}`,
    }
  })
}

const results = [
  ...checkEnvironment(),
  ...checkTrackedSecrets(),
  ...checkRouteCoverage(),
]

console.table(results)

const failures = results.filter(result => result.status === 'FAIL')
const warnings = results.filter(result => result.status === 'WARN')
console.log(`Security readiness: ${results.length - failures.length}/${results.length} checks passed, ${warnings.length} warning(s).`)

if (failures.length > 0) process.exit(1)
