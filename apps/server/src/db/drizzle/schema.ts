import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
});

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: timestamp('date', { withTimezone: true }),
  content: text('content'),
  tags: text('tags').array(),
  chapterId: uuid('chapter_id'),
  mood: text('mood'),
  summary: text('summary'),
  source: text('source'),
  embedding: vector1536('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  yearShard: integer('year_shard'),
});

export const characters = pgTable('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name'),
  canonicalName: text('canonical_name'),
  description: text('description'),
  aliases: jsonb('aliases'),
  metadata: jsonb('metadata'),
  embedding: vector1536('embedding'),
  importance: real('importance'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name'),
  canonicalName: text('canonical_name'),
  type: text('type'),
  description: text('description'),
  aliases: jsonb('aliases'),
  metadata: jsonb('metadata'),
  embedding: vector1536('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const omegaEntities = pgTable('omega_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name'),
  entityType: text('entity_type'),
  canonicalName: text('canonical_name'),
  embedding: vector1536('embedding'),
  confidence: real('confidence'),
  mentionCount: integer('mention_count'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const omegaClaims = pgTable('omega_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  entityId: uuid('entity_id'),
  claimText: text('claim_text'),
  knowledgeType: text('knowledge_type'),
  confidence: real('confidence'),
  embedding: vector1536('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const knowledgeUnits = pgTable('knowledge_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  subjectId: uuid('subject_id'),
  subjectType: text('subject_type'),
  text: text('text'),
  confidence: real('confidence'),
  embedding: vector1536('embedding'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const memoryComponents = pgTable('memory_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  componentType: text('component_type'),
  content: text('content'),
  confidence: real('confidence'),
  embedding: vector1536('embedding'),
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const schemaVersionCheck = sql`select 1`;
