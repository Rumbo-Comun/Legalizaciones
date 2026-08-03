CREATE TABLE `evidences` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`expense_id` text,
	`file_name` text NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`r2_key` text NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`invoice` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`payment_method` text DEFAULT 'efectivo' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`employee` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`fund_code` text DEFAULT '' NOT NULL,
	`period_start` text DEFAULT '' NOT NULL,
	`period_end` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'borrador' NOT NULL,
	`advance_cents` integer DEFAULT 0 NOT NULL,
	`cash_returned_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
