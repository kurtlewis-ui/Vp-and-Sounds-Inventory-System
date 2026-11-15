import { DisposalsService } from './disposals.service';

describe('Disposal confidential cost and selling snapshots', () => {
  const row = { id: 'disposal', productId: 'option', branchId: 'shop', productName: 'Pods — Mango', brandName: 'Brand', quantity: 2, unitPrice: 100, value: 200, sellingValue: 600, status: 'PENDING', product: { image: null }, branch: { id: 'shop', name: 'Shop' } };
  let prisma: any;
  let service: DisposalsService;
  beforeEach(() => {
    prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'shop' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ branch: { id: 'shop', deletedAt: null } }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'option', parentId: 'parent', costPrice: 100, sellingPrice: 250, parent: { sellingPrice: 250 }, name: row.productName, brand: { name: 'Brand' } }) },
      inventory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockImplementation(async ({ select }) => select?.sellingPrice ? { sellingPrice: 300 } : { quantity: 8 }), upsert: jest.fn().mockResolvedValue({ quantity: 10 }) },
      disposal: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([row]), aggregate: jest.fn().mockResolvedValue({ _sum: { value: 200, sellingValue: 600, quantity: 2 } }), findUnique: jest.fn().mockResolvedValue(row), updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockImplementation(async ({ data }) => ({ ...row, ...data })) },
      auditLog: { create: jest.fn() }, stockMovement: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn(fn => fn(prisma));
    service = new DisposalsService(prisma);
  });
  it.each(['Owner', 'Admin', 'Staff'])('%s receives only permitted list and aggregate values', async role => {
    const result = await service.findAll({} as any, { role, userId: 'actor' } as any);
    expect(result.data[0]).toMatchObject({ unitPrice: role === 'Owner' ? 100 : 300, value: role === 'Owner' ? 200 : 600, sellingValue: 600 });
    expect(result.summary.totalValue).toBe(role === 'Owner' ? 200 : 600);
    if (role !== 'Owner') expect(prisma.disposal.aggregate.mock.calls[0][0]._sum).not.toHaveProperty('value');
    expect(result.data[0]).not.toHaveProperty('costPrice');
  });
  it.each(['Owner', 'Admin', 'Staff'])('%s request snapshots parent branch price separately from cost', async role => {
    const result = await service.create({ productId: 'option', branchId: 'shop', quantity: 2 } as any, { role, userId: 'actor' } as any);
    const saved = prisma.disposal.create.mock.calls[0][0].data;
    expect(Number(saved.value)).toBe(200);
    expect(Number(saved.sellingValue)).toBe(600);
    expect(prisma.inventory.findUnique).toHaveBeenCalledWith({ where: { productId_branchId: { productId: 'parent', branchId: 'shop' } }, select: { sellingPrice: true } });
    expect(result.unitPrice).toBe(role === 'Owner' ? 100 : 300);
    expect(result.value).toBe(role === 'Owner' ? 200 : 600);
  });
  it.each(['approve', 'decline'])('Admin %s response does not leak stored cost', async method => {
    const result = await (service as any)[method]('disposal', { role: 'Admin', userId: 'actor' });
    expect(result).toMatchObject({ unitPrice: 300, value: 600, sellingValue: 600 });
    // Decisions do not recalculate financial snapshots or reserve stock twice.
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    expect(prisma.inventory.updateMany).not.toHaveBeenCalled();
  });
});
