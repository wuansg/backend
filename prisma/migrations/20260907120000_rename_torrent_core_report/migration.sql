UPDATE "torrent_blocker_reports"
SET "report" = ("report" - 'xrayReport') || jsonb_build_object('coreReport', "report"->'xrayReport')
WHERE "report" ? 'xrayReport'
  AND NOT ("report" ? 'coreReport');
