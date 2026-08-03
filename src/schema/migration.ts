import { Project } from '@/models/project';

/**
 * Migration mechanism for project schemas.
 * Currently MVP schema is 1.0.0.
 */
export function migrateProject(raw: unknown): Project {
  // If raw object has no schemaVersion or older version, upgrade steps go here.
  return raw as Project;
}
