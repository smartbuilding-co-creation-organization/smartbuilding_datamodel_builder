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
  const trimmed = yamlText.trim();
  if (
    trimmed.startsWith('@prefix') ||
    trimmed.includes('sh:NodeShape') ||
    trimmed.includes('sh:targetClass')
  ) {
    return buildShaclShapeFromTurtle(yamlText);
  }
  return buildShaclShapeFromYaml(yamlText);
}

function extractLocalName(token: string): string {
  const cleaned = token.trim().replace(/[;,]$/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('<') && cleaned.endsWith('>')) {
    const iri = cleaned.slice(1, -1);
    const splitIndex = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
    return splitIndex >= 0 ? iri.slice(splitIndex + 1) : iri;
  }
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex >= 0) return cleaned.slice(colonIndex + 1);
  return cleaned;
}

function extractNodeShapeBlocks(turtleText: string): string[] {
  const lines = turtleText.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBlock) {
      if (trimmed.includes('a sh:NodeShape')) {
        inBlock = true;
        current = [line];
        if (trimmed.endsWith('.')) {
          blocks.push(current.join('\n'));
          inBlock = false;
          current = [];
        }
      }
      continue;
    }

    current.push(line);
    if (trimmed.endsWith('.')) {
      blocks.push(current.join('\n'));
      inBlock = false;
      current = [];
    }
  }

  return blocks;
}

export function buildShaclShapeFromTurtle(turtleText: string): ShaclShape {
  const requiredByClass = new Map<string, Set<string>>();
  const blocks = extractNodeShapeBlocks(turtleText);

  for (const block of blocks) {
    const targetMatch = block.match(/sh:targetClass\s+([^\s;]+)\s*;?/);
    if (!targetMatch) continue;
    const targetClass = extractLocalName(targetMatch[1]);
    if (!targetClass) continue;
    const classKey = resolveClassKey(targetClass);
    const requiredSet = requiredByClass.get(classKey) ?? new Set<string>();

    const propertyBlocks = block.match(/\[[\s\S]*?\]/g) ?? [];
    for (const propBlock of propertyBlocks) {
      if (!/sh:path\s+/.test(propBlock)) continue;
      if (!/sh:minCount\s+1\b/.test(propBlock)) continue;
      const pathMatch = propBlock.match(/sh:path\s+([^\s;]+)\s*;?/);
      if (!pathMatch) continue;
      const pathToken = pathMatch[1];
      const pathLocal = extractLocalName(pathToken);
      if (!pathLocal) continue;
      if (pathToken.startsWith('rdf:') && pathLocal === 'type') continue;
      requiredSet.add(pathLocal);
    }

    if (requiredSet.size > 0) {
      requiredByClass.set(classKey, requiredSet);
    }
  }

  const required: Record<string, string[]> = {};
  for (const [className, slots] of requiredByClass.entries()) {
    required[className] = Array.from(slots);
  }

  return { required };
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
