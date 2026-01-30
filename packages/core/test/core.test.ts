import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildTree,
  exportCsv,
  exportRdf,
  exportYaml,
  parseCsv,
  validate,
} from '../src/index';
import schema from '../../../schema/building_model.schema.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures');

function loadCsv(name: string) {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('buildTree', () => {
  it('creates parent-child relationships', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const tree = buildTree(rows);

    const site = tree.find((node) => node.id === 'site-1');
    expect(site?.children.some((node) => node.id === 'bldg-1')).toBe(true);

    const building = site?.children.find((node) => node.id === 'bldg-1');
    expect(building?.children.some((node) => node.id === 'floor-1')).toBe(true);
  });
});

describe('validate', () => {
  it('returns no issues for valid rows', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });

  it('returns issues for invalid rows', () => {
    const rows = parseCsv(loadCsv('invalid.csv'), { schema });
    const { issues } = validate(rows);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.code === 'id_duplicate')).toBe(true);
    expect(issues.some((issue) => issue.code === 'parent_missing')).toBe(true);
    expect(issues.some((issue) => issue.code === 'cycle')).toBe(true);
    expect(issues.some((issue) => issue.code === 'schema')).toBe(true);
  });
});

describe('exportCsv', () => {
  it('preserves unknown columns and header order from the last parse', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const csv = exportCsv(rows);
    const [headerLine, firstRowLine] = csv.split(/\r?\n/);

    expect(headerLine).toBe('id,name,parentId,kind,extra');
    expect(firstRowLine).toContain('site-1,Site A,,site,alpha');
  });
});

describe('exportRdf', () => {
  it('emits RDF with class and parent relationships', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const rdf = exportRdf(rows);

    expect(rdf).toContain('@prefix sbco: <https://www.sbco.or.jp/ont/> .');
    expect(rdf).toContain('<https://www.sbco.or.jp/ont/resource/site-1> a sbco:Site ;');
    expect(rdf).toContain(
      'sbco:isPartOf <https://www.sbco.or.jp/ont/resource/site-1>',
    );
  });
});

describe('exportYaml', () => {
  it('emits YAML resources aligned to the RDF mapping', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const yaml = exportYaml(rows);

    expect(yaml).toContain('resources:');
    expect(yaml).toContain('id: "site-1"');
    expect(yaml).toContain('class: "sbco:Site"');
    expect(yaml).toContain('isPartOf: "https://www.sbco.or.jp/ont/resource/site-1"');
  });
});

describe('schema mapping', () => {
  it('fills schema properties and stores unknown columns in customProperties', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const site = rows.find((row) => row.id === 'site-1');
    expect(site).toBeDefined();
    expect(site?.address).toBeDefined();

    const custom = site?.customProperties ? JSON.parse(site.customProperties) : {};
    expect(custom.extra).toBe('alpha');
  });

  it('maps parentId into isPartOf when available in the schema', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const building = rows.find((row) => row.id === 'bldg-1');
    expect(building?.isPartOf).toBe('site-1');
  });
});

describe('large fixture', () => {
  it('parses and validates a large csv without errors', () => {
    const rows = parseCsv(loadCsv('large.csv'), { schema });
    expect(rows).toHaveLength(1000);

    const tree = buildTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.some((node) => node.id === 'bldg-1')).toBe(true);

    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });
});
