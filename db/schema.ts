import {sqliteTable,text,integer,primaryKey,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const syncState=sqliteTable('sync_state',{
  id:integer('id').primaryKey(),activeGeneration:text('active_generation'),lastSuccess:text('last_success'),count:integer('count').notNull().default(0),
  lockRun:text('lock_run'),lockUntil:integer('lock_until').notNull().default(0)
});
export const syncRuns=sqliteTable('sync_runs',{
  id:text('id').primaryKey(),status:text('status').notNull(),startedAt:text('started_at').notNull(),completedAt:text('completed_at'),count:integer('count').notNull().default(0),expected:integer('expected'),error:text('error')
});
export const notices=sqliteTable('notices',{generation:text('generation').notNull(),id:text('id').notNull(),data:text('data').notNull()},t=>[primaryKey({columns:[t.generation,t.id]})]);
export const noticeArchive=sqliteTable('notice_archive',{id:text('id').primaryKey(),data:text('data').notNull(),lastSeen:text('last_seen').notNull()});

export const catalogEntries=sqliteTable('catalog_entries',{
  generation:text('generation').notNull(),id:text('id').notNull(),dedupKey:text('dedup_key').notNull(),data:text('data').notNull(),
  title:text('title').notNull(),searchText:text('search_text').notNull(),category:text('category').notNull(),region:text('region').notNull(),
  source:text('source').notNull(),isActive:integer('is_active').notNull(),published:text('published').notNull(),end:text('end_date'),priority:integer('priority').notNull()
},t=>[primaryKey({columns:[t.generation,t.id]}),uniqueIndex('catalog_dedup').on(t.generation,t.dedupKey),index('catalog_category_active').on(t.generation,t.category,t.isActive)]);
export const catalogSourceIds=sqliteTable('catalog_source_ids',{
  generation:text('generation').notNull(),provider:text('provider').notNull(),externalId:text('external_id').notNull(),dedupKey:text('dedup_key').notNull()
},t=>[primaryKey({columns:[t.generation,t.provider,t.externalId]})]);
export const catalogRuns=sqliteTable('catalog_runs',{
  id:text('id').primaryKey(),status:text('status').notNull(),expected:integer('expected').notNull(),expectedActive:integer('expected_active').notNull(),
  started:text('started').notNull(),completed:text('completed'),count:integer('count').notNull().default(0),error:text('error')
});
