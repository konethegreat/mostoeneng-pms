import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import usersRouter from '../../src/routes/users.js';
import { prisma } from '../../src/lib/prisma.js';
import { signToken } from '../../src/middleware/auth.js';

let server;
let base;
let people;
let outsiderManager;
let outsiderAttorney;

before(async () => {
  people = {};
  for (const [role, email] of Object.entries({
    admin: 'admin@example.test', manager: 't.dlamini@example.test',
    attorney: 'n.khumalo@example.test', client: 'client@client.example.test'
  })) {
    people[role] = await prisma.user.findUniqueOrThrow({ where: { email } });
  }
  // Another manager's team proves row scoping; these users never authenticate.
  const suffix = randomUUID();
  outsiderManager = await prisma.user.create({ data: {
    email: `other-manager-${suffix}@example.test`, passwordHash: people.admin.passwordHash,
    firstName: 'Other', lastName: 'Manager', role: 'MANAGER'
  } });
  outsiderAttorney = await prisma.user.create({ data: {
    email: `other-attorney-${suffix}@example.test`, passwordHash: people.admin.passwordHash,
    firstName: 'Other', lastName: 'Attorney', role: 'ATTORNEY', managerId: outsiderManager.id
  } });
  const app = express();
  app.use('/users', usersRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}/users`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (outsiderAttorney) await prisma.user.delete({ where: { id: outsiderAttorney.id } });
  if (outsiderManager) await prisma.user.delete({ where: { id: outsiderManager.id } });
  await prisma.$disconnect();
});

async function get(path, person) {
  const response = await fetch(base + path, {
    headers: person ? { Authorization: `Bearer ${signToken(person)}` } : {}
  });
  return { status: response.status, body: await response.json() };
}

test('every directory surface requires authentication', async () => {
  for (const path of ['', '/groups', '/competencies']) {
    assert.equal((await get(path)).status, 401);
  }
});

test('clients cannot list staff or practice-group contacts but can read feedback competencies', async () => {
  for (const path of ['', '/groups']) {
    const result = await get(path, people.client);
    assert.equal(result.status, 403, `client directory request ${path || '/'} must be forbidden`);
    assert.equal(Array.isArray(result.body), false);
  }
  const competencies = await get('/competencies', people.client);
  assert.equal(competencies.status, 200);
  assert.equal(competencies.body.length, 8);
});

test('attorneys receive colleague names and identifiers without contact or reporting fields', async () => {
  const result = await get('', people.attorney);
  assert.equal(result.status, 200);
  assert.ok(result.body.some((user) => user.id === people.manager.id));
  assert.equal(result.body.some((user) => user.id === people.client.id), false);
  for (const user of result.body) {
    assert.deepEqual(Object.keys(user).sort(), ['firstName', 'id', 'lastName']);
  }
  const groups = await get('/groups', people.attorney);
  assert.equal(groups.status, 200);
  const heads = groups.body.flatMap((group) => group.head ? [group.head] : []);
  assert.ok(heads.length > 0, 'fixture must include a practice-group head');
  for (const head of heads) {
    assert.deepEqual(Object.keys(head).sort(), ['firstName', 'id', 'lastName']);
  }
});

test('managers retain their own team scope and do not see another manager or their reports', async () => {
  const result = await get('', people.manager);
  assert.equal(result.status, 200);
  assert.ok(result.body.some((user) => user.id === people.manager.id));
  assert.ok(result.body.some((user) => user.id === people.attorney.id));
  for (const denied of [outsiderManager, outsiderAttorney, people.admin, people.client]) {
    assert.equal(result.body.some((user) => user.id === denied.id), false);
  }
  assert.ok(result.body.every((user) => user.id === people.manager.id || user.managerId === people.manager.id));
});

test('administrators retain the active directory without password hashes', async () => {
  const result = await get('', people.admin);
  assert.equal(result.status, 200);
  for (const expected of [people.admin, people.manager, people.attorney, people.client, outsiderAttorney]) {
    assert.ok(result.body.some((user) => user.id === expected.id));
  }
  assert.ok(result.body.every((user) => !('passwordHash' in user)));
  assert.equal(result.body.find((user) => user.id === people.client.id).email, people.client.email);
});
