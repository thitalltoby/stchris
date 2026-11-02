#!/usr/bin/env python3
"""Emit PostgreSQL DDL for prisma/schema.prisma (used where the Prisma schema engine cannot be downloaded).
Usage: python3 scripts/schema-to-sql.py > prisma/migrations/<name>/migration.sql
Follows Prisma's DDL conventions so `prisma migrate deploy` / `migrate diff` see no drift."""
import re, sys

src = open('prisma/schema.prisma').read()
src = re.sub(r'//[^\n]*', '', src)  # comments (including ///)
enums, models = {}, {}
for m in re.finditer(r'\benum\s+(\w+)\s*\{([^}]*)\}', src):
    enums[m.group(1)] = [l.strip() for l in m.group(2).strip().splitlines() if l.strip()]
for m in re.finditer(r'\bmodel\s+(\w+)\s*\{(.*?)\n\}', src, re.S):
    models[m.group(1)] = m.group(2)

SCALAR = {'String': 'TEXT', 'Int': 'INTEGER', 'Boolean': 'BOOLEAN', 'DateTime': 'TIMESTAMP(3)', 'Json': 'JSONB', 'Float': 'DOUBLE PRECISION', 'BigInt': 'BIGINT', 'Decimal': 'DECIMAL(65,30)'}
q = lambda s: f'"{s}"'
out, fks, idx = [], [], []

for name, ev in enums.items():
    out.append(f'-- CreateEnum\nCREATE TYPE {q(name)} AS ENUM ({", ".join(chr(39)+v+chr(39) for v in ev)});\n')

def parse_default(d, typ, is_enum, is_list):
    d = d.strip()
    if d in ('cuid()', 'uuid()'): return None
    if d == 'now()': return 'CURRENT_TIMESTAMP'
    if d in ('true', 'false'): return d.upper()
    if re.fullmatch(r'-?\d+(\.\d+)?', d): return d
    if d.startswith('"'):
        v = d[1:-1].replace("'", "''")
        return f"'{v}'" + ('::jsonb' if typ == 'Json' else '')
    if d == '[]': return "'[]'::jsonb" if typ == 'Json' else None
    if is_enum: return f"'{d}'"
    raise SystemExit(f'unhandled default {d} for {typ}')

for name, body in models.items():
    cols, pks, uniques = [], [], []
    for line in body.strip().splitlines():
        line = line.strip()
        if not line: continue
        if line.startswith('@@'):
            if line.startswith('@@index'):
                fields = re.findall(r'\w+', re.search(r'\[(.*?)\]', line).group(1))
                idx.append(f'CREATE INDEX {q(name+"_"+"_".join(fields)+"_idx")} ON {q(name)}({", ".join(q(f) for f in fields)});')
            elif line.startswith('@@id'):
                pks = re.findall(r'\w+', re.search(r'\[(.*?)\]', line).group(1))
            elif line.startswith('@@unique'):
                fields = re.findall(r'\w+', re.search(r'\[(.*?)\]', line).group(1))
                idx.append(f'CREATE UNIQUE INDEX {q(name+"_"+"_".join(fields)+"_key")} ON {q(name)}({", ".join(q(f) for f in fields)});')
            continue
        m = re.match(r'(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$', line)
        if not m: continue
        fname, typ, mod, rest = m.groups()
        is_list, opt = mod == '[]', mod == '?'
        if typ in models:  # relation field
            r = re.search(r'@relation\((.*)\)', rest)
            if r and 'fields:' in r.group(1):
                args = r.group(1)
                f = re.findall(r'\w+', re.search(r'fields:\s*\[(.*?)\]', args).group(1))
                rf = re.findall(r'\w+', re.search(r'references:\s*\[(.*?)\]', args).group(1))
                od = re.search(r'onDelete:\s*(\w+)', args)
                od = od.group(1) if od else ('SetNull' if opt else 'Restrict')
                act = {'Cascade': 'CASCADE', 'SetNull': 'SET NULL', 'Restrict': 'RESTRICT', 'NoAction': 'NO ACTION'}[od]
                fks.append(f'ALTER TABLE {q(name)} ADD CONSTRAINT {q(name+"_"+"_".join(f)+"_fkey")} FOREIGN KEY ({", ".join(q(x) for x in f)}) REFERENCES {q(typ)}({", ".join(q(x) for x in rf)}) ON DELETE {act} ON UPDATE CASCADE;')
            continue
        is_enum = typ in enums
        sql_t = q(typ) if is_enum else SCALAR[typ]
        db = re.search(r'@db\.(\w+)(?:\(([^)]*)\))?', rest)
        if db:
            kind = db.group(1)
            if kind == 'Date': sql_t = 'DATE'
            elif kind == 'Decimal': sql_t = f'DECIMAL({db.group(2)})'
            elif kind == 'Text': sql_t = 'TEXT'
        if is_list: sql_t += '[]'
        col = f'{q(fname)} {sql_t}'
        if not opt: col += ' NOT NULL'
        d = re.search(r'@default\((.*?)\)(?=\s|@|$)', rest)
        if d:
            dv = parse_default(d.group(1) if not d.group(1).endswith('(') else d.group(1), typ, is_enum, is_list)
            if re.search(r'@default\((cuid|now|uuid)\(\)\)', rest): dv = {'cuid': None, 'uuid': None}.get(re.search(r'@default\((\w+)\(\)\)', rest).group(1), 'CURRENT_TIMESTAMP')
            if dv: col += f' DEFAULT {dv}'
        cols.append(col)
        if re.search(r'@id\b', rest): pks = [fname]
        if re.search(r'@unique\b', rest): uniques.append(fname)
    pkc = f',\n    CONSTRAINT {q(name+"_pkey")} PRIMARY KEY ({", ".join(q(p) for p in pks)})' if pks else ''
    out.append(f'-- CreateTable\nCREATE TABLE {q(name)} (\n    ' + ',\n    '.join(cols) + pkc + '\n);\n')
    for u in uniques:
        idx.append(f'CREATE UNIQUE INDEX {q(name+"_"+u+"_key")} ON {q(name)}({q(u)});')

print('\n'.join(out))
print('-- CreateIndex\n' + '\n'.join(idx) + '\n')
print('-- AddForeignKey\n' + '\n'.join(fks))
