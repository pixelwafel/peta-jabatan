import { Project } from '@/models/project';
import { Finding } from '@/models/derived';
import { zProject } from '@/schema/project';
import { migrateProject } from '@/schema/migration';
import { validateProject } from '@/selectors/validation';
import { taxonomy } from '@/config/taxonomy';
import { normalizeProject } from '@/persistence/storage';

export interface JsonImportResult {
  project: Project | null;
  findings: Finding[];
}

export async function importJsonFile(file: File): Promise<JsonImportResult> {
  const findings: Finding[] = [];
  let raw: unknown;

  try {
    const text = await file.text();
    raw = JSON.parse(text);
  } catch (err) {
    return {
      project: null,
      findings: [
        {
          code: 'IMPORT_JSON_UNPARSEABLE',
          severity: 'error',
          message: 'Berkas JSON tidak dapat dibaca atau format sintaks tidak valid.',
        },
      ],
    };
  }

  try {
    const migrated = migrateProject(raw);
    const parseResult = zProject.safeParse(migrated);

    if (parseResult.success) {
      const project = normalizeProject(parseResult.data as Project);
      // Validate project structure findings
      const projFindings = validateProject(project, taxonomy);
      return { project, findings: [...findings, ...projFindings] };
    }

    // Repairable checks (dangling edges, missing positions, unit rincian)
    if (migrated && typeof migrated === 'object' && Array.isArray((migrated as Record<string, unknown>).nodes)) {
      const projObj = migrated as Project;

      // 1. Repair missing node positions
      for (const n of projObj.nodes) {
        if (!n.position) {
          n.position = { x: 0, y: 0 };
        }
      }

      // 2. Clear rincian on unit nodes (Invariant 1)
      for (const n of projObj.nodes) {
        if (n.type === 'unit' && n.rincian && n.rincian.length > 0) {
          n.rincian = [];
          findings.push({
            code: 'IMPORT_UNIT_RINCIAN_CLEARED',
            severity: 'warning',
            nodeId: n.id,
            message: `Node Unit "${n.nama}" memiliki rincian; rincian dikosongkan.`,
          });
        }
      }

      // 3. Remove dangling edges
      const nodeIds = new Set(projObj.nodes.map(n => n.id));
      const validEdges = (projObj.edges ?? []).filter(e => {
        const ok = nodeIds.has(e.source) && nodeIds.has(e.target);
        if (!ok) {
          findings.push({
            code: 'IMPORT_DANGLING_EDGE_DROPPED',
            severity: 'warning',
            message: `Garis penghubung ${e.source} -> ${e.target} tidak valid dan dihapus.`,
          });
        }
        return ok;
      });
      projObj.edges = validEdges;

      const secondaryParse = zProject.safeParse(projObj);
      if (secondaryParse.success) {
        const project = normalizeProject(secondaryParse.data as Project);
        const projFindings = validateProject(project, taxonomy);
        return { project, findings: [...findings, ...projFindings] };
      }
    }

    return {
      project: null,
      findings: [
        {
          code: 'IMPORT_JSON_SCHEMA_INVALID',
          severity: 'error',
          message: 'Struktur JSON tidak sesuai dengan skema proyek Peta Jabatan.',
        },
      ],
    };
  } catch (err) {
    return {
      project: null,
      findings: [
        {
          code: 'IMPORT_JSON_FATAL',
          severity: 'error',
          message: `Gagal memproses berkas JSON: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}
