CREATE TABLE "telegram_daily_traffic_reports" (
    "report_date" DATE PRIMARY KEY,
    "target" VARCHAR(16) NOT NULL,
    "chat_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "message" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "leased_until" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_daily_traffic_status_check" CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED'))
);
CREATE INDEX "telegram_daily_traffic_reports_status_next_attempt_at_idx"
ON "telegram_daily_traffic_reports" ("status", "next_attempt_at");
