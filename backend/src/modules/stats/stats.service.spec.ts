import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { ProductsController } from '../products/products.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('Role-aware financial summaries', () => {
  let prisma: any;
  let service: StatsService;
  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ capital: 200, discount: 50, cash: 950 }]),
      sale: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 950 } }) },
      saleItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { subTotal: 950, discount: 50 } }), findMany: jest.fn().mockResolvedValue([{ quantity: 2, costPrice: 100 }]) },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 80 } }) },
      disposal: { aggregate: jest.fn().mockResolvedValue({ _sum: { value: 100, sellingValue: 250 } }) },
      user: { findUnique: jest.fn().mockResolvedValue({ branchId: 'assigned-shop' }) },
    };
    service = new StatsService(prisma);
  });
  it('Admin uses gross minus expenses, selling disposal and discount exactly once', async () => {
    const result = await service.salesSummary('shop', '2026-11-15', '2026-11-15');
    expect(result).toEqual({ totalGrossSales: 1000, totalSales: 950, totalDiscount: 50, totalExpenses: 80, disposalLosses: 250, net: 620 });
    expect(prisma.disposal.aggregate).toHaveBeenCalledWith({ where: expect.objectContaining({ branchId: 'shop', status: 'APPROVED', createdAt: { gte: new Date('2026-11-14T16:00:00Z'), lt: new Date('2026-11-15T16:00:00Z') } }), _sum: { sellingValue: true } });
    expect(prisma.saleItem.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    for (const key of ['capital', 'costPrice', 'margin', 'grossProfit', 'netProfit']) expect(result).not.toHaveProperty(key);
  });
  it('Owner profit keeps cost-based capital and disposal', async () => {
    const result = await service.profitSummary(undefined, undefined, undefined);
    expect(result).toMatchObject({ grossSales: 1000, capital: 200, disposalLosses: 100, netProfit: 570 });
    expect(prisma.disposal.aggregate).toHaveBeenCalledWith(expect.objectContaining({ _sum: { value: true } }));
    expect(prisma.saleItem.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw.mock.calls[0][0].text).toContain('SUM(i.cost_price * i.quantity)');
  });
  it.each(['Admin', 'Staff', 'Owner'])('%s branch strip uses permitted disposal valuation', async role => {
    prisma.saleItem.findMany.mockResolvedValue([{ paymentMethod: 'Cash', subTotal: 950 }]);
    const result = await service.branchSummary('shop', { role, userId: 'actor' } as any);
    expect(result).toMatchObject({ totalGrossSales: 1000, totalDiscount: 50, totalDisposals: role === 'Owner' ? 100 : 250, totalDisposalsSelling: 250, net: role === 'Owner' ? 770 : 620 });
    const query = prisma.disposal.aggregate.mock.calls[0][0];
    if (role !== 'Owner') expect(query._sum).not.toHaveProperty('value');
    if (role === 'Staff') expect(query.where).toMatchObject({ branchId: 'assigned-shop', status: 'PENDING' });
  });
  it('empty Admin totals remain zero', async () => {
    prisma.saleItem.aggregate.mockResolvedValue({ _sum: { subTotal: null, discount: null } });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.disposal.aggregate.mockResolvedValue({ _sum: { sellingValue: null } });
    expect(await service.salesSummary(undefined, undefined, undefined)).toEqual({ totalGrossSales: 0, totalSales: 0, totalDiscount: 0, totalExpenses: 0, disposalLosses: 0, net: 0 });
  });
  it('keeps profit endpoints Owner-only and allows Admin option archives', () => {
    for (const method of ['profitSummary', 'profitOverview']) expect(Reflect.getMetadata(ROLES_KEY, (StatsController.prototype as any)[method])).toEqual(['Owner']);
    for (const method of ['optionArchives', 'archiveOption', 'restoreOption']) expect(Reflect.getMetadata(ROLES_KEY, (ProductsController.prototype as any)[method])).toEqual(['Owner', 'Admin']);
  });
});
