import { StockMovementsService } from './stock-movements.service';

describe('StockMovementsService product option history', () => {
  function fixture() {
    const prisma = { stockMovement: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) } };
    return { prisma, service: new StockMovementsService(prisma as any) };
  }

  it('combines parent and all option movements within the selected branch, including archived options', async () => {
    const { prisma, service } = fixture();
    await service.findAll({ productId: 'parent', branchId: 'branch-a', includeOptions: 'true', page: 2, limit: 10 });
    const where = { branchId: 'branch-a', OR: [{ productId: 'parent' }, { product: { parentId: 'parent' } }] };
    expect(prisma.stockMovement.count).toHaveBeenCalledWith({ where });
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10, orderBy: { seq: 'desc' } }));
  });

  it('keeps a specific option filter scoped to that option', async () => {
    const { prisma, service } = fixture();
    await service.findAll({ productId: 'mango', branchId: 'branch-a' });
    expect(prisma.stockMovement.count).toHaveBeenCalledWith({ where: { productId: 'mango', branchId: 'branch-a' } });
  });

  it('includes the option identity and its own remaining quantity in each entry', async () => {
    const { prisma, service } = fixture();
    prisma.stockMovement.findMany.mockResolvedValue([{ id: 'movement', productId: 'mango', product: { name: 'Pods — Mango' },
      branchId: 'branch-a', branch: { name: 'Branch A' }, user: null, type: 'SALE', quantityChange: -1, quantityAfter: 9, createdAt: new Date('2026-11-14T00:00:00Z') }] as never);
    const result = await service.findAll({ productId: 'parent', branchId: 'branch-a', includeOptions: 'true' });
    expect(result.data[0]).toMatchObject({ productId: 'mango', productName: 'Pods — Mango', quantityChange: -1, quantityAfter: 9 });
  });
});
