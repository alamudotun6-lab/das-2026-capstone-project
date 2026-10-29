import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/http/router.js';

describe('Router', () => {
  it('matches a simple GET path', () => {
    const router = new Router();
    router.get('/health', () => 'ok');
    const match = router.match('GET', '/health');
    assert.ok(match);
    assert.equal(match.handler(), 'ok');
  });

  it('extracts :params', () => {
    const router = new Router();
    router.get('/events/:id', ({ params }) => params);
    const match = router.match('GET', '/events/abc-123');
    assert.deepEqual(match.handler({ params: match.params }), { id: 'abc-123' });
  });

  it('returns null when no route matches', () => {
    const router = new Router();
    router.get('/health', () => 'ok');
    assert.equal(router.match('GET', '/missing'), null);
    assert.equal(router.match('POST', '/health'), null);
  });

  it('is case-insensitive on the HTTP method', () => {
    const router = new Router();
    router.get('/health', () => 'ok');
    assert.ok(router.match('get', '/health'));
  });
});
