import { CleanAppliedUsageSnapshotsTask } from './clean-applied-usage-snapshots';
import { CleanOldUsageRecordsTask } from './clean-old-usage-records/clean-old-usage-records.task';
import { CompactUsageHistoryTask } from './compact-usage-history';
import { VacuumTablesTask } from './vacuum-tables/vacuum-tables.task';

export const SERVICE_JOBS_TASKS = [
    CleanAppliedUsageSnapshotsTask,
    CleanOldUsageRecordsTask,
    CompactUsageHistoryTask,
    VacuumTablesTask,
];
