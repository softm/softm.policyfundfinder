CREATE TABLE `catalog_entries` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`dedup_key` text NOT NULL,
	`data` text NOT NULL,
	`title` text NOT NULL,
	`search_text` text NOT NULL,
	`category` text NOT NULL,
	`region` text NOT NULL,
	`source` text NOT NULL,
	`is_active` integer NOT NULL,
	`published` text NOT NULL,
	`end_date` text,
	`priority` integer NOT NULL,
	PRIMARY KEY(`generation`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_dedup` ON `catalog_entries` (`generation`,`dedup_key`);--> statement-breakpoint
CREATE INDEX `catalog_category_active` ON `catalog_entries` (`generation`,`category`,`is_active`);--> statement-breakpoint
CREATE TABLE `catalog_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`expected` integer NOT NULL,
	`expected_active` integer NOT NULL,
	`started` text NOT NULL,
	`completed` text,
	`count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `catalog_source_ids` (
	`generation` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`dedup_key` text NOT NULL,
	PRIMARY KEY(`generation`, `provider`, `external_id`)
);
