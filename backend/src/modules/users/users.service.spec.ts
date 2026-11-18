import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for the permission rules in UsersService — the "who can manage
 * whom" guards. Admin may manage Admin/Staff, never Owner. Owners may manage
 * all supported roles (but cannot delete their own account). Mocked Prisma — no database.
 */
const OWNER_ROLE = 'Owner';
const ADMIN_ROLE = 'Admin';

describe('UsersService — permissions', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      role: { findUnique: jest.fn(), findMany: jest.fn() },
      branch: { findFirst: jest.fn() },
      session: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn(() => '12') } },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v) } },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  it('does not offer the Owner role to Admin', async () => {
    prisma.role.findMany.mockResolvedValue([]);
    await service.getRoles('Admin');
    expect(prisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { name: { in: ['Admin', 'Staff'] } } }));
  });

  // ---- create --------------------------------------------------------------
  it('lists only supported roles', async () => {
    prisma.role.findMany.mockResolvedValue([]);
    await service.getRoles();
    expect(prisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: { in: ['Owner', 'Admin', 'Staff'] } },
    }));
  });

  it('rejects creation with an unsupported role even for an Owner', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: 'retired', name: 'RemovedRole' });
    await expect(service.create({ email: 'retired@test.invalid', roleId: 'retired' } as any, 'owner-1', OWNER_ROLE))
      .rejects.toThrow('Unsupported account role');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects assigning an unsupported role even for an Owner', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'staff', role: { name: 'Staff' } });
    prisma.role.findUnique.mockResolvedValue({ id: 'retired', name: 'RemovedRole' });
    await expect(service.update('staff', { roleId: 'retired' } as any, 'owner-1', OWNER_ROLE))
      .rejects.toThrow('Unsupported account role');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  describe('create', () => {
    it('allows an Admin to create an Admin account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'Admin' });
      prisma.user.create.mockResolvedValue({ id: 'peer', role: { name: 'Admin' }, passwordHash: 'private' });
      const result = await service.create({ email: 'peer@test.invalid', password: 'p', roleId: 'r-admin' } as any, 'admin-1', ADMIN_ROLE);
      expect(result).toHaveProperty('id', 'peer');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('forbids an Admin from creating an Owner account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r-owner', name: 'Owner' });

      await expect(
        service.create(
          { email: 'x@x.com', password: 'p', firstName: 'A', lastName: 'B', roleId: 'r-owner' } as any,
          'admin-1',
          ADMIN_ROLE,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an Owner to create an Admin account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue({ id: 'r-admin', name: 'Admin' });
      prisma.user.create.mockResolvedValue({
        id: 'new-1', email: 'x@x.com', firstName: 'A', lastName: 'B',
        role: { id: 'r-admin', name: 'Admin' }, branch: null, passwordHash: 'h',
      });

      const res = await service.create(
        { email: 'x@x.com', password: 'p', firstName: 'A', lastName: 'B', roleId: 'r-admin' } as any,
        'owner-1',
        OWNER_ROLE,
      );
      expect(res).toHaveProperty('id', 'new-1');
      // Password hash is never returned.
      expect(res as any).not.toHaveProperty('passwordHash');
    });
  });

  // ---- update --------------------------------------------------------------
  describe('update', () => {
    it('forbids an Admin from editing an Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true, roleId: 'r-owner', role: { name: 'Owner' } });
      await expect(
        service.update('u1', { firstName: 'New' } as any, 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only manage Admin or Staff/i);
    });

    it('allows an Admin to edit a peer Admin', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'peer', isActive: true, roleId: 'r-admin', role: { name: 'Admin' } });
      prisma.user.update.mockResolvedValue({ id: 'peer', firstName: 'Updated', passwordHash: 'private' });
      const result = await service.update('peer', { firstName: 'Updated' }, 'admin-1', ADMIN_ROLE);
      expect(result).toHaveProperty('firstName', 'Updated');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('forbids an Admin from promoting Staff to Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', isActive: true, roleId: 'r-staff', role: { name: 'Staff' } });
      prisma.role.findUnique.mockResolvedValue({ id: 'r-owner', name: 'Owner' });
      await expect(
        service.update('u1', { roleId: 'r-owner' } as any, 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only assign Admin or Staff/i);
    });
  });

  // ---- resetPassword -------------------------------------------------------
  describe('resetPassword', () => {
    it('forbids an Admin from resetting an Owner password', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: { name: 'Owner' } });
      await expect(
        service.resetPassword('u1', 'NewPass123!', 'NewPass123!', 'admin-1', ADMIN_ROLE),
      ).rejects.toThrow(/only reset Admin or Staff/i);
    });

    it('rejects mismatched new passwords', async () => {
      await expect(
        service.resetPassword('u1', 'NewPass123!', 'Different123!', 'owner-1', OWNER_ROLE),
      ).rejects.toThrow(/do not match/i);
    });
  });

  // ---- remove --------------------------------------------------------------
  describe('remove', () => {
    it('forbids an Admin from deleting an Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: { name: 'Owner' } });
      await expect(service.remove('u1', 'admin-1', ADMIN_ROLE)).rejects.toThrow(/only delete Admin or Staff/i);
    });

    it('prevents an Owner from deleting their own account', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'owner-1', role: { name: 'Owner' } });
      await expect(service.remove('owner-1', 'owner-1', OWNER_ROLE)).rejects.toThrow(/your own account/i);
    });
  });

  // ---- restore -------------------------------------------------------------
  describe('restore', () => {
    it('forbids an Admin from restoring an Owner', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', deletedAt: new Date(), role: { name: 'Owner' } });
      await expect(service.restore('u1', 'admin-1', ADMIN_ROLE)).rejects.toThrow(/only restore Admin or Staff/i);
    });
  });

  it('allows Admin to reset a peer password and revokes sessions', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'peer', role: { name: 'Admin' } });
    await service.resetPassword('peer', 'StrongPass123!', 'StrongPass123!', 'actor', ADMIN_ROLE);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'peer' } }));
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'peer' } });
  });
  it('allows Admin to archive and restore a peer', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'peer', role: { name: 'Admin' }, deletedAt: new Date() });
    prisma.user.update.mockResolvedValue({ id: 'peer', passwordHash: 'private' });
    await service.remove('peer', 'actor', ADMIN_ROLE);
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'peer', email: 'peer@test.invalid', role: { name: 'Admin' }, deletedAt: new Date() }).mockResolvedValueOnce(null);
    const result = await service.restore('peer', 'actor', ADMIN_ROLE);
    expect(result).toHaveProperty('id', 'peer');
    expect(result).not.toHaveProperty('passwordHash');
  });

  // ---- findAll visibility --------------------------------------------------
  describe('findAll — visibility', () => {
    it('hides Owner accounts from a non-Owner (Admin) via the where clause', async () => {
      prisma.user.count = jest.fn().mockResolvedValue(0);
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
      await service.findAll({} as any, ADMIN_ROLE);
      // The query must restrict roles to Admin + Staff only (never Owner).
      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toEqual({ name: { in: ['Admin', 'Staff'] } });
    });

    it('does not restrict roles for an Owner', async () => {
      prisma.user.count = jest.fn().mockResolvedValue(0);
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
      await service.findAll({} as any, OWNER_ROLE);
      const whereArg = prisma.user.findMany.mock.calls[0][0].where;
      expect(whereArg.role).toBeUndefined();
    });
  });
  it.each(['Owner', 'Admin'])('%s archive query restricts account visibility before pagination', async role => {
    prisma.user.count = jest.fn().mockResolvedValue(0);
    prisma.user.findMany = jest.fn().mockResolvedValue([]);
    await service.findArchived({} as any, role);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.role).toEqual(role === 'Owner' ? undefined : { name: { in: ['Admin', 'Staff'] } });
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
  });
});
