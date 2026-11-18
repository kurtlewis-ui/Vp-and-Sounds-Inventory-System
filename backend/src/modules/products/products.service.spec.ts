import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import * as optionWriter from './product-options';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for ProductsService core rules: create/update guards, the
 * Admin cost confidentiality, global archive/restore, per-branch archive
 * (remove/restore from one shop), and cost-price confidentiality in the
 * serialized output. Mocked Prisma + Upload — no database.
 */
const USER = 'owner-1';
const PRODUCT_ID = 'prod-1';
const BRANCH_ID = 'branch-1';

describe('ProductsService — core & per-branch archive', () => {
  let service: ProductsService;
  let prisma: any;

  // A fully-populated product row as returned by includeFull()/selectFull().
  function productRow(overrides: Partial<any> = {}) {
    return {
      variantType: 'NONE', parentId: null,
      id: PRODUCT_ID,
      name: 'Blue Razz',
      slug: 'blue-razz',
      image: null,
      sellingPrice: 100,
      costPrice: 40,
      quantityAlert: 0,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      brand: { id: 'b1', name: 'RELX', slug: 'relx' },
      inventory: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const mockPrisma = {
      product: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      brand: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn(), count: jest.fn() },
      inventory: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      stockMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v ?? null) } },
      ],
    }).compile();

    service = module.get(ProductsService);
    prisma = module.get(PrismaService);
  });

  it.each(['Owner', 'Admin'])('%s applies All Shops pricing without overwriting a newer stock count', async role => {
    prisma.product.findFirst.mockResolvedValue(productRow({ variantType: 'NONE', parentId: null }));
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.branch.count.mockResolvedValue(1);
    prisma.inventory.findMany = jest.fn().mockResolvedValue([{ branchId: BRANCH_ID, quantity: 9 }]);
    prisma.inventory.updateMany = jest.fn();
    await service.update(PRODUCT_ID, { sellingPrice: 700, applyPriceToAllBranches: true,
      quantities: [{ branchId: BRANCH_ID, quantity: 10, expectedQuantity: 10, sellingPrice: 700 }] }, USER, role);
    expect(prisma.inventory.upsert.mock.calls[0][0].update).toEqual({});
    expect(prisma.inventory.updateMany).toHaveBeenCalledWith({ where: { productId: PRODUCT_ID }, data: { sellingPrice: 700 } });
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  // ---- create --------------------------------------------------------------
  describe('create', () => {
    it('rejects when the brand does not exist', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ name: 'X', brandId: 'missing', sellingPrice: 10 } as any, USER, 'Owner'),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends new products at the end (sortOrder = max + 1)', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'b1', name: 'RELX', deletedAt: null });
      prisma.product.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prisma.product.create.mockResolvedValue(productRow({ sortOrder: 5 }));

      await service.create({ name: 'X', brandId: 'b1', sellingPrice: 10 } as any, USER, 'Owner');

      expect(prisma.product.create.mock.calls[0][0].data.sortOrder).toBe(5);
    });
  });

  it('does not pass forged Admin cost into flavor/color persistence', async () => {
    const save = jest.spyOn(optionWriter, 'saveProductOptions').mockResolvedValue(PRODUCT_ID);
    try {
      prisma.product.findFirst.mockResolvedValue(productRow({ variantType: 'FLAVOR' }));
      await service.update(PRODUCT_ID, { name: 'Updated', costPrice: 999 } as any, 'admin', 'Admin');
      expect(save.mock.calls[0][1]).not.toHaveProperty('costPrice');
      expect(save.mock.calls[0][1]).toHaveProperty('name', 'Updated');
    } finally { save.mockRestore(); }
  });

  // ---- update (shared operations, private cost) ---------------------------------------
  describe('update — Admin operations', () => {
    it('allows Admin metadata and selling-price edits while stripping forged cost', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.product.findUnique.mockResolvedValue(productRow());
      const result = await service.update(PRODUCT_ID, { name: 'Updated', sellingPrice: 150, costPrice: 1, quantityAlert: 9, image: 'image' } as any, 'admin-1', 'Admin');
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ name: 'Updated', sellingPrice: 150, quantityAlert: 9, image: 'image' });
      expect(data).not.toHaveProperty('costPrice');
      expect(result).not.toHaveProperty('costPrice');
    });

    it('strips forged cost on Admin product creation', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'b1', name: 'Brand' });
      prisma.product.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      prisma.product.create.mockResolvedValue(productRow());
      const result = await service.create({ name: 'New', brandId: 'b1', sellingPrice: 150, costPrice: 999 } as any, 'admin-1', 'Admin');
      expect(prisma.product.create.mock.calls[0][0].data.costPrice).toBe(0);
      expect(result).not.toHaveProperty('costPrice');
    });

    it('rejects (brand not found) for an Owner editing with a bad brandId', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.update(PRODUCT_ID, { brandId: 'missing' } as any, USER, 'Owner'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- global archive / restore -------------------------------------------
  describe('remove / restore (global)', () => {
    it('archives a product by setting deletedAt', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.product.update.mockResolvedValue(productRow({ deletedAt: new Date() }));

      await service.remove(PRODUCT_ID, USER);

      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.isActive).toBe(false);
    });

    it('refuses to restore a product whose brand is still archived', async () => {
      prisma.product.findFirst.mockResolvedValue(
        productRow({ deletedAt: new Date(), brand: { id: 'b1', name: 'RELX', deletedAt: new Date() } }),
      );
      await expect(service.restore(PRODUCT_ID, USER, 'Owner')).rejects.toThrow(/brand is archived/i);
    });
  });

  // ---- per-branch archive (remove from one shop) --------------------------
  describe('removeFromBranch', () => {
    it('throws NotFound when the product does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the branch does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('archives even when the product has no stock record at that branch (creates a 0-qty archived row)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      // No inventory row exists for this product at this branch.
      prisma.inventory.findUnique.mockResolvedValue(null);
      prisma.inventory.upsert.mockResolvedValue({});

      // Should NOT throw — it should create an archived, 0-quantity row.
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).resolves.toEqual(
        expect.objectContaining({ message: expect.stringMatching(/Removed/i) }),
      );

      const call = prisma.inventory.upsert.mock.calls[0][0];
      expect(call.create).toEqual(
        expect.objectContaining({ productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 0 }),
      );
      expect(call.create.archivedAt).toBeInstanceOf(Date);
    });

    it('rejects when already removed from that branch', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.inventory.findUnique.mockResolvedValue({ archivedAt: new Date() });
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/already removed/i);
    });

    it('archives an existing (unarchived) branch inventory row without touching quantity', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.inventory.findUnique.mockResolvedValue({ archivedAt: null, quantity: 10 });
      prisma.inventory.upsert.mockResolvedValue({});

      await service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER);

      const call = prisma.inventory.upsert.mock.calls[0][0];
      // Existing row path: update only sets archivedAt, never quantity.
      expect(call.update.archivedAt).toBeInstanceOf(Date);
      expect(call.update.quantity).toBeUndefined();
    });
  });

  describe('restoreToBranch', () => {
    it('throws NotFound when there is no branch-archived row', async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('refuses when the branch itself is archived', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: new Date() },
      });
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/branch is archived/i);
    });

    it('refuses when the product is globally archived', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: new Date() },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/archived everywhere/i);
    });

    it('clears archivedAt on a valid restore', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      prisma.inventory.update.mockResolvedValue({});

      await service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER);

      expect(prisma.inventory.update.mock.calls[0][0].data).toEqual({ archivedAt: null });
    });
  });

  // ---- cost-price confidentiality -----------------------------------------
  describe('findAll — cost confidentiality', () => {
    it('uses a unique tie-breaker when paging equally ordered products', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);
      await service.findAll({ page: 2, limit: 200 } as any, 'Staff');
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 200, take: 200,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }));
    });

    it('includes costPrice for an Owner', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([productRow({ costPrice: 40 })]);
      const res = await service.findAll({} as any, 'Owner');
      expect(res.data[0]).toHaveProperty('costPrice', 40);
    });

    it('hides costPrice from a non-Owner (Admin)', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([productRow({ costPrice: 40 })]);
      const res = await service.findAll({} as any, 'Admin');
      expect(res.data[0]).not.toHaveProperty('costPrice');
    });
  });
});
