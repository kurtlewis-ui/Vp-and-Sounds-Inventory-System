import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { SalesService } from '../sales/sales.service';
import { DisposalsService } from '../disposals/disposals.service';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const actor = (role: string) => ({ role, userId: 'actor', email: 'a@example.invalid', sessionId: 'session' } as any);
function mockPrisma() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ grossSales: 400, discount: 10, cash: 390 }]),
    sale: { count: jest.fn().mockResolvedValue(235), findMany: jest.fn().mockResolvedValue([]) },
    saleItem: { findMany: jest.fn() },
    disposal: { count: jest.fn().mockResolvedValue(235), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { value: 100, sellingValue: 250, quantity: 2 } }), groupBy: jest.fn().mockResolvedValue([{ productName: 'Historical Product', brandName: 'Brand', _sum: { value: 100, sellingValue: 250, quantity: 2 } }]) },
    user: { findUnique: jest.fn().mockResolvedValue({ branchId: 'assigned' }) },
  };
}
describe('Report efficiency boundaries', () => {
  it('executes the actual parameterized aggregate SQL in PostgreSQL', () => {
    const output = execFileSync(process.execPath, [resolve(__dirname, '../../../scripts/test-report-efficiency.cjs')], { encoding: 'utf8', timeout: 30000 });
    expect(output).toContain('PASS: PostgreSQL payment aggregates');
  }, 35000);
  it('sales reads keep their response and pagination contract without loading historical item arrays', async () => {
    const p=mockPrisma(); const service=new SalesService(p as any);
    const result=await service.findRecords({page:2,limit:200,search:'Rare',branchId:'branch'},actor('Admin'));
    expect(p.sale.count).toHaveBeenCalled(); expect(p.$queryRaw).toHaveBeenCalledTimes(1);expect(p.saleItem.findMany).not.toHaveBeenCalled();
    expect(p.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:'APPROVED',branchId:'branch'}),skip:200,take:200}));
    expect(result.summary).toMatchObject({grossSales:400,discount:10,cash:390,total:390,count:235});
    const select=p.sale.findMany.mock.calls[0][0].include.items.select;
    expect(select).not.toHaveProperty('costPrice');expect(select).toMatchObject({note:true,paymentSplit:true,product:{select:{image:true}}});
    const sql=p.$queryRaw.mock.calls[0][0];expect(sql.values).toContain('%Rare%');expect(sql.values).toContain('branch');
  });
  it('Staff reports remain assigned-branch scoped and pending summary behavior is unchanged', async()=>{
    const p=mockPrisma();const service=new SalesService(p as any);
    const result=await service.findPending({branchId:'other'},actor('Staff'));
    expect(p.sale.findMany.mock.calls[0][0].where).toMatchObject({status:'PENDING',branchId:'assigned'});
    expect(p.$queryRaw.mock.calls[0][0].values).toEqual(expect.arrayContaining(['PENDING','assigned']));
    expect(result.summary).toMatchObject({grossSales:400,discount:10,cash:390,total:390,count:235});
  });
  it.each(['Owner','Admin'])('%s disposal chart aggregates all approved records without per-record transfers',async role=>{
    const p=mockPrisma();const result=await new StatsService(p as any).disposedProducts('branch',actor(role));
    expect(result).toEqual([{name:'Historical Product',brandName:'Brand',quantity:2,value:role==='Owner'?100:250}]);
    expect(p.disposal.findMany).not.toHaveBeenCalled();
    const query=p.disposal.groupBy.mock.calls[0][0];expect(query.where).toEqual({branchId:'branch',status:'APPROVED'});expect(query).not.toHaveProperty('take');
    if(role==='Admin')expect(query._sum).not.toHaveProperty('value');
  });
  it('Staff cannot access company disposal analytics',async()=>{
    const p=mockPrisma();await expect(new StatsService(p as any).disposedProducts(undefined,actor('Staff'))).rejects.toThrow('Management access');
    expect(p.disposal.groupBy).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(ROLES_KEY,StatsController.prototype.disposedProducts)).toEqual(['Owner','Admin']);
  });
});
