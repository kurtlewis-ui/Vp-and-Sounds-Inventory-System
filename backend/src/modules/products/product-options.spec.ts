import { saveProductOptions } from './product-options';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const branch = 'branch-a';
const parent = (extra = {}) => ({ id: 'parent', name: 'Device', brandId: 'brand', variantType: 'NONE', parentId: null,
  sellingPrice: 500, costPrice: 200, inventory: [{ branchId: branch, quantity: 10, sellingPrice: 550 }], options: [], ...extra });
const sku = (extra = {}) => ({ id: 'black', name: 'Device — Black', optionName: 'Black', parentId: 'parent', variantType: 'NONE',
  inventory: [{ branchId: branch, quantity: 10 }], deletedAt: null, ...extra });
const option = (extra = {}) => ({ name: 'Black', quantities: [{ branchId: branch, quantity: 10 }], ...extra });

function fixture(current: any = null) {
  let next = 0;
  const tx: any = {
    product: { findUnique: jest.fn(async () => current), aggregate: jest.fn(async () => ({ _max: { sortOrder: 3 } })),
      create: jest.fn(async ({ data }) => ({ id: `new-${++next}`, ...data })), update: jest.fn(async ({ where, data }) => ({ ...current, id: where.id, ...data })) },
    branch: { count: jest.fn(async ({ where }) => where.id.in.length) },
    brand: { findFirst: jest.fn(async () => ({ id: 'brand' })) },
    inventory: { upsert: jest.fn(), findUniqueOrThrow: jest.fn(async () => ({ sellingPrice: 550 })) },
    saleItem: { count: jest.fn(async () => 0) }, disposal: { count: jest.fn(async () => 0) },
    draftOrder: { findMany: jest.fn(async () => []) }, stockMovement: { create: jest.fn() }, auditLog: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn) => fn(tx)) };
  return { prisma, tx };
}

describe('Product flavor/color stock rules', () => {
  it('keeps creation Owner-only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductsController.prototype.create)).toEqual(['Owner']);
  });
  it('creates a parent with zero physical stock and separately identified option stock', async () => {
    const { prisma, tx } = fixture();
    await saveProductOptions(prisma, { name: 'Device', brandId: 'brand', sellingPrice: 500, costPrice: 200, variantType: 'COLOR', options: [option()] }, 'owner');
    expect(tx.product.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ variantType: 'COLOR', name: 'Device' }) });
    expect(tx.product.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ parentId: 'new-1', name: 'Device — Black', costPrice: 200, sellingPrice: 500 }) });
    expect(tx.inventory.upsert.mock.calls[0][0].create.quantity).toBe(0);
    expect(tx.inventory.upsert.mock.calls[1][0].create).toMatchObject({ quantity: 10, sellingPrice: 550 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it('rejects case-insensitive duplicate options before any product writes', async () => {
    const { prisma, tx } = fixture();
    await expect(saveProductOptions(prisma, { variantType: 'FLAVOR', options: [option(), option({ name: ' black ' })] }, 'owner')).rejects.toThrow('unique');
    expect(tx.product.create).not.toHaveBeenCalled();
  });
  it('rejects a conversion that changes existing stock', async () => {
    const { prisma, tx } = fixture(parent());
    await expect(saveProductOptions(prisma, { variantType: 'COLOR', options: [option({ quantities: [{ branchId: branch, quantity: 9 }] })] }, 'owner', 'parent')).rejects.toThrow('exactly 10');
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it('moves existing stock to the options with an auditable zero-sum allocation', async () => {
    const { prisma, tx } = fixture(parent());
    await saveProductOptions(prisma, { variantType: 'COLOR', options: [option()] }, 'owner', 'parent');
    const movements = tx.stockMovement.create.mock.calls.map(([arg]: any[]) => arg.data);
    expect(movements.map((m: any) => m.quantityChange)).toEqual([-10, 10]);
    expect(movements.every((m: any) => m.description.startsWith('Allocated'))).toBe(true);
  });
  it.each(['sale', 'disposal', 'draft'])('blocks conversion while %s work is outstanding', async (kind) => {
    const { prisma, tx } = fixture(parent());
    if (kind === 'sale') tx.saleItem.count.mockResolvedValue(1);
    if (kind === 'disposal') tx.disposal.count.mockResolvedValue(1);
    if (kind === 'draft') tx.draftOrder.findMany.mockResolvedValue([{ items: [{ productId: 'parent' }], disposalItems: [] }]);
    await expect(saveProductOptions(prisma, { variantType: 'COLOR', options: [option()] }, 'owner', 'parent')).rejects.toThrow('pending');
    expect(tx.product.update).not.toHaveBeenCalled();
  });
  it('prevents switching colors to flavors and dropping an existing option', async () => {
    const { prisma } = fixture(parent({ variantType: 'COLOR', options: [sku()] }));
    await expect(saveProductOptions(prisma, { variantType: 'FLAVOR', options: [option()] }, 'owner', 'parent')).rejects.toThrow('cannot change');
    await expect(saveProductOptions(prisma, { variantType: 'COLOR', options: [option()] }, 'owner', 'parent')).rejects.toThrow('Keep existing');
  });
  it('requires the dedicated archive action when a product form tries to change archive status', async () => {
    const { prisma } = fixture(parent({ variantType: 'COLOR', options: [sku(), sku({ id: 'blue', optionName: 'Blue', inventory: [] })] }));
    await expect(saveProductOptions(prisma, { options: [option({ id: 'black', archived: true, quantities: [{ branchId: branch, quantity: 0 }] }), option({ id: 'blue', name: 'Blue', quantities: [] })] }, 'owner', 'parent')).rejects.toThrow('Use the Archive or Restore');
  });
  it('rejects stock edits based on stale quantities rather than overwriting a sale', async () => {
    const { prisma } = fixture(parent({ variantType: 'COLOR', inventory: [{ branchId: branch, quantity: 0 }], options: [sku()] }));
    await expect(saveProductOptions(prisma, { options: [option({ id: 'black', quantities: [{ branchId: branch, quantity: 12, expectedQuantity: 11 }] })] }, 'owner', 'parent')).rejects.toThrow('changed while editing');
  });
  it('allows a stock edit when the expected count matches and records its delta', async () => {
    const { prisma, tx } = fixture(parent({ variantType: 'COLOR', inventory: [{ branchId: branch, quantity: 0 }], options: [sku()] }));
    await saveProductOptions(prisma, { options: [option({ id: 'black', quantities: [{ branchId: branch, quantity: 12, expectedQuantity: 10 }] })] }, 'owner', 'parent');
    expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'black', quantityChange: 2, quantityAfter: 12 }) });
  });
  it('preserves stock and price in omitted branches during a selected-branch edit', async () => {
    const otherBranch = 'branch-b';
    const { prisma, tx } = fixture(parent({ variantType: 'COLOR',
      inventory: [{ branchId: branch, quantity: 0, sellingPrice: 550 }, { branchId: otherBranch, quantity: 0, sellingPrice: 600 }],
      options: [sku({ inventory: [{ branchId: branch, quantity: 10 }, { branchId: otherBranch, quantity: 7 }] })] }));
    tx.inventory.findUniqueOrThrow.mockImplementation(async ({ where }: any) => ({ sellingPrice: where.productId_branchId.branchId === otherBranch ? 600 : 550 }));
    await saveProductOptions(prisma, { quantities: [{ branchId: branch, quantity: 0, sellingPrice: 550 }],
      options: [option({ id: 'black', quantities: [{ branchId: branch, quantity: 9, expectedQuantity: 10 }] })] }, 'owner', 'parent');
    const hiddenOptionWrite = tx.inventory.upsert.mock.calls.map(([arg]: any[]) => arg)
      .find((arg: any) => arg.where.productId_branchId.productId === 'black' && arg.where.productId_branchId.branchId === otherBranch);
    expect(hiddenOptionWrite.create.quantity).toBe(7);
    expect(hiddenOptionWrite.update).toEqual({ sellingPrice: 600 });
    expect(tx.stockMovement.create.mock.calls).toHaveLength(1);
  });

  it('applies an explicit All Shops price to existing branch prices', async () => {
    const { prisma, tx } = fixture(parent({ variantType: 'COLOR',
      inventory: [{ branchId: branch, quantity: 0, sellingPrice: 550 }, { branchId: 'branch-b', quantity: 0, sellingPrice: 600 }], options: [sku()] }));
    await saveProductOptions(prisma, { sellingPrice: 700, applyPriceToAllBranches: true }, 'owner', 'parent');
    const parentWrites = tx.inventory.upsert.mock.calls.map(([input]: any[]) => input).filter((input: any) => input.where.productId_branchId.productId === 'parent');
    expect(parentWrites).toHaveLength(2);
    expect(parentWrites.every((input: any) => input.update.sellingPrice === 700)).toBe(true);
  });

  it('excludes branch-archived stock from available totals while retaining its stored quantity', async () => {
    const row = parent({ variantType: 'COLOR', inventory: [{ branchId: branch, quantity: 0 }],
      options: [sku({ sellingPrice: 500, inventory: [{ branchId: branch, quantity: 9, archivedAt: new Date() }] })] });
    const service = new ProductsService({ product: { findFirst: jest.fn(async () => row) } } as any, {} as any);
    const result = await service.findOne('parent', 'Owner');
    expect(result.totalQuantity).toBe(0);
    expect(result.options[0].totalQuantity).toBe(0);
    expect(result.options[0].quantities[0].quantity).toBe(9);
  });

  it('serializes totals from active options and never leaks option cost to Admin/Staff', async () => {
    const row = parent({ variantType: 'COLOR', inventory: [{ branchId: branch, quantity: 0, sellingPrice: 550 }], options: [sku({ costPrice: 200, sellingPrice: 500 }), sku({ id: 'old', optionName: 'Old', deletedAt: new Date(), costPrice: 200, inventory: [{ branchId: branch, quantity: 0 }] })] });
    const prisma: any = { product: { findFirst: jest.fn(async () => row) } };
    const service = new ProductsService(prisma, {} as any);
    for (const role of ['Admin', 'Staff']) {
      const result = await service.findOne('parent', role);
      expect(result.totalQuantity).toBe(10);
      expect(result.options[0].sellingPrice).toBe(550);
      expect(JSON.stringify(result)).not.toContain('costPrice');
    }
    expect((await service.findOne('parent', 'Owner')).options[0].costPrice).toBe(200);
  });
});
