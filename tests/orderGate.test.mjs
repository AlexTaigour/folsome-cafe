process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-test-key';

import test from 'node:test';
import assert from 'node:assert/strict';

const { ipMatches } = await import('../server/orderGate.js');

test('IPv4 CIDR allowlist matches the café subnet', () => {
  assert.equal(ipMatches('203.0.113.42', '203.0.113.0/24'), true); 
  assert.equal(ipMatches('203.0.113.42', '203.0.114.0/24'), false);
});

test('IPv6 CIDR allowlist matches the café /64 network', () => {
  assert.equal(ipMatches('2001:db8:aaaa:0001::123', '2001:db8:aaaa:0001::/64'), true);
  assert.equal(ipMatches('2001:db8:aaaa:0002::123', '2001:db8:aaaa:0001::/64'), false);
});
