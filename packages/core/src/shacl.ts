import { Issue, RowRecord } from './types';

export type ShaclValidationOptions = {
  shape: ShaclShape;
};

type ShaclShape = {
  required?: Record<string, string[]>;
};

const CLASS_MAP: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  room: 'Room',
  space: 'Room',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
};

const INTERNAL_KEYS = new Set([
  '__rowId',
  'parentId',
  'kind',
  'pointId',
  'pointName',
  'deviceId',
  'deviceName',
]);

function normalizeValue(value: string | undefined): string {
  return value ? value.toString().trim() : '';
}

function resolveClassKey(kind: string | undefined): string {
  const normalized = normalizeValue(kind).toLowerCase();
  if (!normalized) return 'Resource';
  return CLASS_MAP[normalized] ?? kind ?? 'Resource';
}

export function parseShaclRequirements(yamlText: string): ShaclShape {
  return buildShaclShapeFromYaml(yamlText);
}

export function buildShaclShapeFromYaml(yamlText: string): ShaclShape {
  const lines = yamlText.split(/\r?\n/);
  const requiredSlots = new Set<string>();
  const classSlots = new Map<string, Set<string>>();
  let mode: 'slots' | 'classes' | null = null;
  let currentSlot = '';
  let currentClass = '';
  let inClassSlots = false;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (indent === 0 && trimmed === 'slots:') {
      mode = 'slots';
      currentSlot = '';
      continue;
    }
    if (indent === 0 && trimmed === 'classes:') {
      mode = 'classes';
      currentClass = '';
      inClassSlots = false;
      continue;
    }

    if (mode === 'slots') {
      if (indent === 2 && trimmed.endsWith(':')) {
        currentSlot = trimmed.replace(':', '').trim();
        continue;
      }
      if (currentSlot && indent > 2 && trimmed.startsWith('required:')) {
        const value = trimmed.split(':')[1]?.trim();
        if (value === 'true') {
          requiredSlots.add(currentSlot);
        }
      }
      continue;
    }

    if (mode === 'classes') {
      if (indent === 2 && trimmed.endsWith(':')) {
        currentClass = trimmed.replace(':', '').trim();
        classSlots.set(currentClass, classSlots.get(currentClass) ?? new Set());
        inClassSlots = false;
        continue;
      }
      if (!currentClass) continue;
      if (indent === 4 && trimmed === 'slots:') {
        inClassSlots = true;
        continue;
      }
      if (inClassSlots) {
        if (indent === 6 && trimmed.startsWith('- ')) {
          const slotName = trimmed.replace('- ', '').trim();
          classSlots.get(currentClass)?.add(slotName);
        } else if (indent <= 4 && !trimmed.startsWith('-')) {
          inClassSlots = false;
        }
      }
    }
  }

  const required: Record<string, string[]> = {};

  for (const [className, slots] of classSlots.entries()) {
    const fields = Array.from(slots).filter((slot) => requiredSlots.has(slot));
    required[className] = fields;
  }

  return { required };
}

export function validateShacl(rows: RowRecord[], options: ShaclValidationOptions): Issue[] {
  const issues: Issue[] = [];
  const requiredByClass = options.shape.required ?? {};

  for (const row of rows) {
    const kind = resolveClassKey(row.kind ?? row.resourceKind ?? row.kindLabel ?? row.className);
    const required = requiredByClass[kind] ?? [];
    for (const field of required) {
      if (INTERNAL_KEYS.has(field)) continue;
      const value = normalizeValue(row[field]);
      if (!value) {
        issues.push({
          code: 'shacl',
          message: 'SHACL required',
          rowId: normalizeValue(row.id) || row['__rowId'],
          field,
        });
      }
    }
  }

  return issues;
}
