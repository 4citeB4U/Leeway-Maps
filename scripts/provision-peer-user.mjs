import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashPeerPassword } from '../server/providers/peerSignaling.js';

// Operator-side only. Never run in a request handler or expose this as registration.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]]); return pairs;
}, []));
try {
  const fields = ['file', 'username', 'subject', 'org', 'role', 'name'];
  if (fields.some(field => typeof args[field] !== 'string' || !args[field] || args[field].startsWith('--')) ||
    !['driver', 'dispatcher', 'manager'].includes(args.role) || ['username', 'subject', 'org', 'name'].some(field => args[field].length > 80 || /[\x00-\x1f]/.test(args[field])))
    throw new Error('Required: --file PATH --username NAME --subject ID --org ORG --role driver|dispatcher|manager --name DISPLAY_NAME. Password through stdin only.');
  if (process.stdin.isTTY) throw new Error('Supply password through redirected standard input; it must not be a command argument.');
  let password = '';
  for await (const chunk of process.stdin) { password += chunk.toString(); if (password.length > 258) throw new Error('Password too long.'); }
  password = password.replace(/\r?\n$/, '');
  if (password.length < 12 || password.length > 256) throw new Error('Password must contain 12–256 characters.');
  const path = resolve(args.file);
  let accounts = { schemaVersion: 1, users: [] };
  try { const existing = await readFile(path, 'utf8'); if (Buffer.byteLength(existing) > 131072) throw new Error('Account file too large.'); accounts = JSON.parse(existing); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (accounts.schemaVersion !== 1 || !Array.isArray(accounts.users) || accounts.users.length >= 200) throw new Error('Invalid/full account file.');
  if (accounts.users.some(row => row.username === args.username || (row.subject === args.subject && row.org === args.org))) throw new Error('Username or organization identity already exists. Edit/revoke deliberately before provisioning another identity.');
  const salt = randomBytes(16).toString('hex');
  accounts.users.push({ username: args.username, subject: args.subject, org: args.org, role: args.role, displayName: args.name,
    salt, passwordHash: await hashPeerPassword(password, salt) });
  password = '';
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(accounts, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
  try { await chmod(path, 0o600); } catch (error) { if (process.platform !== 'win32') throw error; }
  process.stdout.write('Account provisioned. Protect this file with operating-system access controls.\n');
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
