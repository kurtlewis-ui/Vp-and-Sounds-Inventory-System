import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

describe('Supported authentication roles', () => {
  const config = new ConfigService({ JWT_SECRET: 'test', JWT_REFRESH_SECRET: 'refresh' });
  it('rejects an unsupported role with an otherwise valid access token', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'retired', isActive: true, role: { name: 'RemovedRole' } }) } };
    await expect(new JwtStrategy(config, prisma).validate({ sub: 'retired', sessionId: 's' } as any)).rejects.toThrow(UnauthorizedException);
  });
  it.each(['Owner', 'Admin', 'Staff'])('still validates %s access tokens', async role => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: role, email: 'test@test.invalid', isActive: true, role: { name: role } }) } };
    expect((await new JwtStrategy(config, prisma).validate({ sub: role } as any)).role).toBe(role);
    JwtStrategy.invalidate(role);
  });
  it('rejects a valid refresh session owned by an unsupported role', async () => {
    const prisma: any = { session: { findUnique: jest.fn().mockResolvedValue({ id: 's', userId: 'retired', expiresAt: new Date(Date.now() + 60000), tokenVersion: 1, user: { id: 'retired', isActive: true, role: { name: 'RemovedRole' } } }) } };
    await expect(new JwtRefreshStrategy(config, prisma).validate({ cookies: { refreshToken: 'token' } } as any, { sub: 'retired', sessionId: 's', tokenVersion: 1 })).rejects.toThrow(UnauthorizedException);
  });
});
