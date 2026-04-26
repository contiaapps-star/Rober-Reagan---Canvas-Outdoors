CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`competitor_id` text,
	`inspiration_source_id` text,
	`channel` text NOT NULL,
	`activity_type` text NOT NULL,
	`detected_at` integer NOT NULL,
	`published_at` integer,
	`source_url` text NOT NULL,
	`dedupe_hash` text NOT NULL,
	`raw_payload` text NOT NULL,
	`summary_text` text,
	`themes_extracted` text DEFAULT (json('[]')) NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`status_changed_by` text,
	`status_changed_at` integer,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inspiration_source_id`) REFERENCES `inspiration_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activities_channel_ck" CHECK("activities"."channel" IN ('website','meta_facebook','meta_instagram','tiktok','youtube','google_ads','seo_ranking','seo_backlink')),
	CONSTRAINT "activities_activity_type_ck" CHECK("activities"."activity_type" IN ('new_blog_post','new_landing_page','new_ad_creative','new_video','rank_change','new_backlink')),
	CONSTRAINT "activities_status_ck" CHECK("activities"."status" IN ('new','useful','skip'))
);
--> statement-breakpoint
CREATE INDEX `idx_activities_detected_at` ON `activities` (`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_activities_filters` ON `activities` (`competitor_id`,`channel`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activities_dedupe_hash` ON `activities` (`dedupe_hash`);--> statement-breakpoint
CREATE TABLE `api_spend_log` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`month` text NOT NULL,
	`spend_usd` integer DEFAULT 0 NOT NULL,
	`last_updated` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "api_spend_log_provider_ck" CHECK("api_spend_log"."provider" IN ('apify','zenrows','serper','dataforseo','youtube','openrouter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_spend_provider_month` ON `api_spend_log` (`provider`,`month`);--> statement-breakpoint
CREATE TABLE `competitor_handles` (
	`id` text PRIMARY KEY NOT NULL,
	`competitor_id` text NOT NULL,
	`channel` text NOT NULL,
	`handle` text,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "competitor_handles_channel_ck" CHECK("competitor_handles"."channel" IN ('meta_facebook','meta_instagram','tiktok','youtube','google_ads'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_competitor_handles_unique` ON `competitor_handles` (`competitor_id`,`channel`);--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`category` text NOT NULL,
	`tier` text NOT NULL,
	`logo_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "competitors_category_ck" CHECK("competitors"."category" IN ('well','plumbing','both')),
	CONSTRAINT "competitors_tier_ck" CHECK("competitors"."tier" IN ('local_same_size','mondo_100m','national','inspiration'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitors_domain_unique` ON `competitors` (`domain`);--> statement-breakpoint
CREATE TABLE `inspiration_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`channel` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	CONSTRAINT "inspiration_sources_kind_ck" CHECK("inspiration_sources"."kind" IN ('account','keyword_search')),
	CONSTRAINT "inspiration_sources_channel_ck" CHECK("inspiration_sources"."channel" IN ('tiktok','youtube'))
);
--> statement-breakpoint
CREATE TABLE `poll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`competitor_id` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`error_message` text,
	`items_fetched` integer DEFAULT 0 NOT NULL,
	`cost_usd_estimated` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "poll_runs_status_ck" CHECK("poll_runs"."status" IN ('ok','failed','partial'))
);
--> statement-breakpoint
CREATE INDEX `idx_poll_runs_health` ON `poll_runs` (`channel`,`started_at`);--> statement-breakpoint
CREATE TABLE `session_state` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_state_user_key` ON `session_state` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `target_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`category` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "target_keywords_category_ck" CHECK("target_keywords"."category" IN ('well','plumbing','both'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_role_ck" CHECK("users"."role" IN ('admin','agency'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);