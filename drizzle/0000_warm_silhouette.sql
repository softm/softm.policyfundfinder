CREATE TABLE `notice_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`generation`, `id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`count` integer DEFAULT 0 NOT NULL,
	`expected` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_generation` text,
	`last_success` text,
	`count` integer DEFAULT 0 NOT NULL,
	`lock_run` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
