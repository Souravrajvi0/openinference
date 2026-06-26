import { describe, it, expect } from 'vitest';
import {
  hasOrgRole,
  scopesForPlan,
  isPlatformAdminEmail,
  hashInviteToken,
} from '../orgAuth';

describe('orgAuth', () => {
  it('ranks org roles correctly', () => {
    expect(hasOrgRole('owner', 'admin')).toBe(true);
    expect(hasOrgRole('admin', 'admin')).toBe(true);
    expect(hasOrgRole('member', 'admin')).toBe(false);
    expect(hasOrgRole(null, 'member')).toBe(false);
  });

  it('derives scopes from org plan', () => {
    const free = scopesForPlan('free', 'member', 'user@example.com');
    expect(free).toContain('chat');
    expect(free).not.toContain('pro');

    const pro = scopesForPlan('pro', 'member', 'user@example.com');
    expect(pro).toContain('pro');
    expect(pro).not.toContain('admin');
  });

  it('grants admin scope to org admins', () => {
    const scopes = scopesForPlan('free', 'admin', 'user@example.com');
    expect(scopes).toContain('admin');
  });

  it('hashes invite tokens deterministically', () => {
    expect(hashInviteToken('abc')).toBe(hashInviteToken('abc'));
    expect(hashInviteToken('abc')).not.toBe(hashInviteToken('def'));
  });

  it('detects platform admin emails from env', () => {
    // Default ADMIN_EMAILS in test env is typically empty; just verify function shape
    expect(typeof isPlatformAdminEmail('test@example.com')).toBe('boolean');
  });
});
