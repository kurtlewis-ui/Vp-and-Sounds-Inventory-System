import { ProductsController } from './products.controller';
import { BrandsController } from '../brands/brands.controller';
import { BranchesController } from '../branches/branches.controller';
import { StatsController } from '../stats/stats.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('Management endpoint boundaries', () => {
  it.each(['create', 'importProducts', 'restock', 'undoStock', 'resetStock', 'reorder', 'update'])('allows Owner/Admin but not Staff for product %s', method => {
    expect(Reflect.getMetadata(ROLES_KEY, (ProductsController.prototype as any)[method])).toEqual(['Owner', 'Admin']);
  });
  it.each([BrandsController, BranchesController])('allows both management roles to create and update catalog metadata', controller => {
    for (const method of ['create', 'update']) expect(Reflect.getMetadata(ROLES_KEY, (controller.prototype as any)[method])).toEqual(['Owner', 'Admin']);
  });
  it.each(['profitSummary', 'profitOverview'])('keeps confidential %s Owner-only', method => {
    expect(Reflect.getMetadata(ROLES_KEY, (StatsController.prototype as any)[method])).toEqual(['Owner']);
  });
});
