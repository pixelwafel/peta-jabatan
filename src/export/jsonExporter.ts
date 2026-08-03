import { Project } from '@/models/project';

export function exportJson(project: Project): Blob {
  const payload = JSON.stringify(project, null, 2);
  return new Blob([payload], { type: 'application/json;charset=utf-8' });
}
