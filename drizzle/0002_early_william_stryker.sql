ALTER TABLE `settlements` ADD `fund_type` text DEFAULT 'caja menor' NOT NULL;--> statement-breakpoint
ALTER TABLE `settlements` ADD `project_name` text DEFAULT '' NOT NULL;