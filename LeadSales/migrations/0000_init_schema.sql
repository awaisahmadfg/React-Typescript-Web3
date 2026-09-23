CREATE TABLE "activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activity_date" date NOT NULL,
	"linkedin_connections_sent" integer DEFAULT 0,
	"connection_accepts" integer DEFAULT 0,
	"emails_sent" integer DEFAULT 0,
	"personalized_emails_sent" integer DEFAULT 0,
	"in_mails_sent" integer DEFAULT 0,
	"cold_calls" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "activity_timeline" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"channel" text,
	"subject" text,
	"body" text NOT NULL,
	"notes" text,
	"happened_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_invoice_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"invoice_date" date NOT NULL,
	"invoice_number" text,
	"invoice_amount" integer DEFAULT 0 NOT NULL,
	"received_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" text NOT NULL,
	"company" text NOT NULL,
	"start_date" date,
	"ticket_size" integer NOT NULL,
	"payment_terms" text NOT NULL,
	"billing_frequency" text NOT NULL,
	"hourly_rate" integer NOT NULL,
	"resource_count" integer NOT NULL,
	"invoice_number" text,
	"invoice_amount" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'UNPAID' NOT NULL,
	"delta_amount" integer DEFAULT 0 NOT NULL,
	"google_sheet_link" text,
	"client_poc" text NOT NULL,
	"owner_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text,
	"period" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"metric" text NOT NULL,
	"target" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text,
	"owner_id" text NOT NULL,
	"plan_id" text,
	"upload_batch_id" text,
	"linkedin_url" text,
	"email" text,
	"phone" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"connection_status" text DEFAULT 'NONE' NOT NULL,
	"connection_sent_at" timestamp,
	"connection_accepted_at" timestamp,
	"response_time_minutes" integer,
	"stage" text DEFAULT 'NEW' NOT NULL,
	"status_changed_at" timestamp DEFAULT now(),
	"notes" text,
	"owner_name" text,
	"initial_contact_due_date" date,
	"initial_contact_completed_date" timestamp,
	"next_email_followup_date" date,
	"email_last_sent_date" timestamp,
	"next_message_followup_date" date,
	"message_last_sent_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plan_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"initial_contacts_per_day" integer DEFAULT 20 NOT NULL,
	"email_delay_days" integer DEFAULT 3 NOT NULL,
	"message_delay_days" integer DEFAULT 2 NOT NULL,
	"initial_contact_channel" text DEFAULT 'LinkedIn' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"due_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"lead_id" text,
	"member_count" integer DEFAULT 0,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "upload_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"imported_at" timestamp DEFAULT now(),
	"row_count" integer NOT NULL,
	"success_count" integer NOT NULL,
	"error_count" integer NOT NULL,
	"hash" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"team_id" text,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"is_active" boolean DEFAULT true,
	"avatar" text,
	"avatar_url" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
