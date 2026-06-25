import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import tdSchema from './wot-schemas/td.schema.json';
import tmSchema from './wot-schemas/tm.schema.json';
import { Issue } from './types';

export type WotKind = 'td' | 'tm';

let tdValidator: ValidateFunction | undefined;
let tmValidator: ValidateFunction | undefined;

function buildValidator(schema: object): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function getValidator(kind: WotKind): ValidateFunction {
  if (kind === 'td') {
    if (!tdValidator) tdValidator = buildValidator(tdSchema as object);
    return tdValidator;
  }
  if (!tmValidator) tmValidator = buildValidator(tmSchema as object);
  return tmValidator;
}

function formatError(err: ErrorObject): string {
  const path = err.instancePath || '/';
  const message = err.message ?? 'invalid';
  if (err.params && Object.keys(err.params).length > 0) {
    const params = Object.entries(err.params)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    return `${path} ${message} (${params})`;
  }
  return `${path} ${message}`;
}

type WotThingShape = {
  id?: string;
  title?: string;
  [key: string]: unknown;
};

export function validateWotThings(things: unknown[], kind: WotKind): Issue[] {
  const validate = getValidator(kind);
  const code = kind === 'td' ? 'wot-td' : 'wot-tm';
  const issues: Issue[] = [];

  things.forEach((thing, index) => {
    const ok = validate(thing);
    if (ok) return;
    const errors = validate.errors ?? [];
    const t = thing as WotThingShape;
    const rowId = typeof t.id === 'string' ? t.id : undefined;
    const label = rowId ?? (typeof t.title === 'string' ? t.title : `things[${index}]`);
    for (const err of errors) {
      issues.push({
        code,
        message: `${label}: ${formatError(err)}`,
        rowId,
      });
    }
  });

  return issues;
}
