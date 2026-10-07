-- Preserve the format of existing frozen HTML messages, including pending retries.
ALTER TABLE telegram_daily_traffic_reports
ADD COLUMN parse_mode VARCHAR(16) NOT NULL DEFAULT 'HTML';

ALTER TABLE telegram_daily_traffic_reports
ADD CONSTRAINT telegram_daily_traffic_reports_parse_mode_check
CHECK (parse_mode IN ('HTML', 'MarkdownV2'));
