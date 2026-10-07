-- Existing HTML and MarkdownV2 snapshots retain their original transport.
ALTER TABLE telegram_daily_traffic_reports
DROP CONSTRAINT telegram_daily_traffic_reports_parse_mode_check;

ALTER TABLE telegram_daily_traffic_reports
ADD CONSTRAINT telegram_daily_traffic_reports_parse_mode_check
CHECK (parse_mode IN ('HTML', 'MarkdownV2', 'RichMarkdown'));
