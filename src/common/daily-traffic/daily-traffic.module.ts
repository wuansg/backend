import { Module } from '@nestjs/common';

import { DailyTrafficReportService } from './daily-traffic-report.service';
import { DailyTrafficCollector } from './daily-traffic.collector';

@Module({
    providers: [DailyTrafficCollector, DailyTrafficReportService],
    exports: [DailyTrafficReportService],
})
export class DailyTrafficModule {}
