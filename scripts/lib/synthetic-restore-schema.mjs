// Offline validator for the exact vocabulary used by the three checked-in contracts.
// Unknown schema keywords fail closed instead of silently weakening a future contract.
const keywords = new Set(['$schema', '$defs', '$ref', 'title', 'description', 'type',
  'additionalProperties', 'required', 'properties', 'const', 'enum', 'pattern', 'format',
  'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems',
  'items', 'allOf', 'not']);
export function assertSchema(value, name, schemas) {
  function vocabulary(s) {
    if (!s || Object.keys(s).some(k => !keywords.has(k))) throw Error('SCHEMA_CONTRACT');
    for (const map of [s.properties, s.$defs]) for (const child of Object.values(map ?? {})) vocabulary(child);
    if (s.items) vocabulary(s.items);
    if (s.not) vocabulary(s.not);
    s.allOf?.forEach(vocabulary);
  }
  Object.values(schemas).forEach(vocabulary);
  function walk(v, s, document) {
    if (!s || Object.keys(s).some(k => !keywords.has(k))) throw Error('SCHEMA_CONTRACT');
    if (s.$ref) {
      const [file, fragment = ''] = s.$ref.split('#');
      const target = file ? schemas[file] : document;
      if (!target || (fragment && !fragment.startsWith('/'))) throw Error('SCHEMA_CONTRACT');
      const resolved = fragment.split('/').slice(1).reduce((a, k) => a?.[k], target);
      walk(v, fragment ? resolved : target, target);
    }
    if (s.allOf) s.allOf.forEach(child => walk(v, child, document));
    if (s.not) {
      let matched = true;
      try { walk(v, s.not, document); }
      catch (error) {
        if (error.message !== 'SCHEMA_VALUE') throw error;
        matched = false;
      }
      if (matched) throw Error('SCHEMA_VALUE');
    }
    if (s.type) {
      const ok = s.type === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
        : s.type === 'array' ? Array.isArray(v)
          : s.type === 'integer' ? Number.isSafeInteger(v) : typeof v === s.type;
      if (!ok) throw Error('SCHEMA_VALUE');
    }
    if ('const' in s && v !== s.const) throw Error('SCHEMA_VALUE');
    if (s.enum && !s.enum.includes(v)) throw Error('SCHEMA_VALUE');
    if (typeof v === 'string') {
      if ((s.pattern && !new RegExp(s.pattern).test(v)) ||
          (s.minLength !== undefined && v.length < s.minLength) ||
          (s.maxLength !== undefined && v.length > s.maxLength) ||
          (s.format && (s.format !== 'date-time' || !Number.isFinite(Date.parse(v)) ||
            new Date(v).toISOString() !== v))) throw Error('SCHEMA_VALUE');
    }
    if (typeof v === 'number' && ((s.minimum !== undefined && v < s.minimum) ||
        (s.maximum !== undefined && v > s.maximum))) throw Error('SCHEMA_VALUE');
    if (Array.isArray(v)) {
      if ((s.minItems !== undefined && v.length < s.minItems) ||
          (s.maxItems !== undefined && v.length > s.maxItems) ||
          (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length)) throw Error('SCHEMA_VALUE');
      if (s.items) v.forEach(x => walk(x, s.items, document));
    } else if (v !== null && typeof v === 'object') {
      if (s.required?.some(k => !Object.hasOwn(v, k)) ||
          (s.additionalProperties === false && Object.keys(v).some(k => !Object.hasOwn(s.properties ?? {}, k)))) {
        throw Error('SCHEMA_VALUE');
      }
      for (const [k, child] of Object.entries(s.properties ?? {})) if (Object.hasOwn(v, k)) walk(v[k], child, document);
    }
  }
  walk(value, schemas[name], schemas[name]);
}
