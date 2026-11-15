import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

/**
 * Unit tests for RolesGuard — the route-level gate that decides whether the
 * logged-in user's role is allowed to hit an endpoint. This is the mechanism
 * behind every @Roles('Owner', 'Admin', ...) decorator, so it must: allow when
 * no roles are required, allow when the user's role is in the list, deny when
 * it isn't, and deny when there's no user at all.
 */
function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardWithRequiredRoles(roles: string[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows the request when the route declares no required roles', () => {
    const guard = guardWithRequiredRoles(undefined);
    expect(guard.canActivate(contextFor({ role: 'Staff' }))).toBe(true);
  });

  it('allows when the user role is in the required list', () => {
    const guard = guardWithRequiredRoles(['Owner', 'Admin']);
    expect(guard.canActivate(contextFor({ role: 'Admin' }))).toBe(true);
  });

  it('denies when the user role is NOT in the required list', () => {
    const guard = guardWithRequiredRoles(['Owner']);
    expect(guard.canActivate(contextFor({ role: 'Admin' }))).toBe(false);
  });

  it('denies unsupported roles even if a route mistakenly lists one', () => {
    const guard = guardWithRequiredRoles(['Owner', 'RemovedRole']);
    expect(guard.canActivate(contextFor({ role: 'RemovedRole' }))).toBe(false);
  });

  it('denies when there is no authenticated user', () => {
    const guard = guardWithRequiredRoles(['Owner']);
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });
});
