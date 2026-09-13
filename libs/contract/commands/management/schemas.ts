import { z } from 'zod';

export const ManagementEntityTypeSchema = z.enum([
    'node',
    'host',
    'config-profile',
    'node-plugin',
    'shared-list',
    'subscription-template',
    'subpage-config',
    'internal-squad',
    'external-squad',
]);

export const TaggableManagementEntityTypeSchema = ManagementEntityTypeSchema.exclude([
    'shared-list',
]);

export const ManagementTagSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[\p{L}\p{N}_.:-]+$/u, 'Tags may contain letters, numbers, _, ., :, and -.');

export const ManagementTagsSchema = z
    .array(ManagementTagSchema)
    .max(20)
    .transform((tags) => [...new Set(tags)].sort((a, b) => a.localeCompare(b)));

export type ManagementEntityType = z.infer<typeof ManagementEntityTypeSchema>;
export type TaggableManagementEntityType = z.infer<typeof TaggableManagementEntityTypeSchema>;
