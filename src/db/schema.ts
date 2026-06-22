import { pgTable, text, integer, timestamp, jsonb, real, uuid } from 'drizzle-orm/pg-core'
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

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  source: text('source'),
  weight: real('weight').default(1),
  createdAt: timestamp('created_at').defaultNow(),
})
