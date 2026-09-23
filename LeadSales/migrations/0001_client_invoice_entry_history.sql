CREATE TABLE "client_invoice_entry_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"invoice_entry_id" text NOT NULL,
	"action" text NOT NULL,
	"changed_by_user_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
