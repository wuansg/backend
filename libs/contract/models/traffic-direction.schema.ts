import { z } from 'zod';

/** Proxy-usage direction, not host-interface RX/TX. */
export const trafficDirectionSchema = z.enum(['total', 'upload', 'download']);
export type TrafficDirection = z.infer<typeof trafficDirectionSchema>;
