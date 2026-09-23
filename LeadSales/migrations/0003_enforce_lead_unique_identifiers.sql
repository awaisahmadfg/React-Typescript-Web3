CREATE UNIQUE INDEX "leads_email_unique" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_linkedin_url_unique" ON "leads" USING btree ("linkedin_url");