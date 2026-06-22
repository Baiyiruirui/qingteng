import { pgTable, text, integer, timestamp, jsonb, real, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { vector } from 'drizzle-orm/pg-core'

export type PoemLine = {
  lineId: string
  content: string
  imagery?: string[]
  emotion?: string[]
  translation?: string
  translationKeywords?: string[]
  explanation?: string
}

export const poems = pgTable('poems', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  dynasty: text('dynasty'),
  grade: text('grade'),
  textType: text('text_type'),
  themes: jsonb('themes').$type<string[]>(),
  imagery: jsonb('imagery').$type<string[]>(),
  rhetoric: jsonb('rhetoric').$type<string[]>(),
  lines: jsonb('lines').$type<PoemLine[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  poemId: text('poem_id').references(() => poems.id),
  meta: jsonb('meta'),
  score: real('score'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  poemId: text('poem_id').references(() => poems.id),
  mode: text('mode').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const immersionScripts = pgTable('immersion_scripts', {
  poemId: text('poem_id').primaryKey().references(() => poems.id),
  difficulty: text('difficulty').notNull(),
  role: text('role').notNull(),
  scene: text('scene').notNull(),
  teachingGoals: jsonb('teaching_goals').$type<string[]>().notNull(),
  openingMove: text('opening_move').notNull(),
  keyBeats: jsonb('key_beats').$type<string[]>().notNull(),
  exitCondition: text('exit_condition').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const quizBlueprints = pgTable('quiz_blueprints', {
  poemId: text('poem_id').primaryKey().references(() => poems.id),
  points: jsonb('points').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export type BlueprintPoint = {
  id: string
  type: string
  ability: string
  targetLines: string[]
  prompt_hint: string
  answerKey: string
  form: 'fill' | 'appreciate' | 'translate' | 'mcq'
}

export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  poemId: text('poem_id').notNull().references(() => poems.id),
  type: text('type').notNull(), // mcq | fill | translate | appreciate
  stem: text('stem').notNull(),
  options: jsonb('options').$type<string[]>(),
  answer: text('answer').notNull(),
  explanation: text('explanation').notNull(),
  evidenceLines: jsonb('evidence_lines').$type<string[]>().notNull(),
  difficulty: text('difficulty').notNull(),
  qualityScore: real('quality_score'),
  evidenceValid: boolean('evidence_valid').notNull().default(false),
  version: text('version').notNull().default('v1'),
  pointType: text('point_type'),
  pointId: text('point_id'),
  scoringPoints: jsonb('scoring_points').$type<string[]>(),
  promptVersion: text('prompt_version'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  questionId: uuid('question_id').notNull().references(() => quizQuestions.id),
  poemId: text('poem_id').notNull(),
  sessionId: text('session_id').notNull(),
  userAnswer: text('user_answer').notNull(),
  isCorrect: boolean('is_correct'),           // objective only; null for subjective
  completionRate: real('completion_rate'),     // subjective only (0-1); null for objective
  hitPoints: jsonb('hit_points').$type<string[]>(),
  missedPoints: jsonb('missed_points').$type<string[]>(),
  feedback: text('feedback'),
  createdAt: timestamp('created_at').defaultNow(),
}, t => [uniqueIndex('quiz_attempts_session_question_idx').on(t.sessionId, t.questionId)])

export const wrongQuestions = pgTable('wrong_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  questionId: uuid('question_id').notNull().references(() => quizQuestions.id),
  poemId: text('poem_id').notNull(),
  wrongCount: integer('wrong_count').notNull().default(1),
  lastWrongAt: timestamp('last_wrong_at').defaultNow(),
  resolved: boolean('resolved').notNull().default(false),
}, t => [uniqueIndex('wrong_questions_user_question_idx').on(t.userId, t.questionId)])

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  source: text('source'),
  weight: real('weight').default(1),
  createdAt: timestamp('created_at').defaultNow(),
})
