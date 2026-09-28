import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { storageConfigProblem } from './storage';

const real = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  R2_SECRET_ACCESS_KEY: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeedf00dfeedf00dfeedf00dfeed',
  R2_BUCKET: 'pod-vector-studio-dev',
  R2_ENDPOINT: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
};

describe('storageConfigProblem', () => {
  it('accepts a real-looking R2 config', () => {
    assert.equal(storageConfigProblem(real), null);
  });

  it('derives the endpoint from the account id when the endpoint is a template', () => {
    assert.equal(storageConfigProblem({ ...real, R2_ENDPOINT: 'https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com' }), null);
  });

  it('flags the old scaffold defaults (the reported upload failure)', () => {
    const old = { R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: 'minioadmin', R2_SECRET_ACCESS_KEY: 'minioadmin', R2_BUCKET: 'pod-vector-studio', R2_ENDPOINT: 'http://localhost:9000' };
    assert.match(storageConfigProblem(old)!, /R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY still have placeholder values/);
    assert.match(storageConfigProblem({ ...real, R2_ENDPOINT: 'http://localhost:9000' })!, /old local MinIO default/);
  });

  it('lists missing values', () => {
    assert.match(storageConfigProblem({ R2_BUCKET: 'b' })!, /missing R2_ENDPOINT \(or R2_ACCOUNT_ID\), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/);
  });

  it('never echoes secret values', () => {
    const msg = storageConfigProblem({ ...real, R2_ACCESS_KEY_ID: 'minioadmin', R2_SECRET_ACCESS_KEY: 'minioadmin' })!;
    assert.ok(!msg.includes('minioadmin'));
  });
});
