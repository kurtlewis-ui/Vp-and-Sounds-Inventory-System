import { changeOptionArchive, listOptionArchives } from './option-archives';
import { ProductsController } from './products.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

function fixture() {
  const option = { id: 'mango', parentId: 'pods', brandId: 'brand', optionName: 'Mango', deletedAt: null,
    parent: { id: 'pods', deletedAt: null, brand: { deletedAt: null } } };
  const tx: any = {
    product: { findUnique: jest.fn(async () => option), update: jest.fn(), count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    inventory: { upsert: jest.fn(), findUnique: jest.fn(async () => ({ quantity: 9, archivedAt: null })) },
    branch: { findUnique: jest.fn(async () => ({ deletedAt: null })) },
    branchBrandArchive: { findUnique: jest.fn(async () => null) }, auditLog: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async fn => fn(tx)) };
  return { tx, prisma, option };
}

describe('Flavor/color archive scopes', () => {
  it.each(['archiveOption', 'restoreOption', 'optionArchives'])('keeps %s Owner-only', method => {
    expect(Reflect.getMetadata(ROLES_KEY, (ProductsController.prototype as any)[method])).toEqual(['Owner']);
  });

  it('archives an option with retained stock in one branch without changing quantity or global status', async () => {
    const { tx, prisma } = fixture();
    await changeOptionArchive(prisma, 'mango', 'owner', false, 'branch-a');
    const input = tx.inventory.upsert.mock.calls[0][0];
    expect(input.where.productId_branchId).toEqual({ productId: 'mango', branchId: 'branch-a' });
    expect(input.update).toEqual({ archivedAt: expect.any(Date) });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'OPTION_BRANCH_ARCHIVED' }) });
  });

  it('archives globally without touching retained inventory or independent branch archive markers', async () => {
    const { tx, prisma } = fixture();
    await changeOptionArchive(prisma, 'mango', 'owner', false);
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'mango' }, data: { deletedAt: expect.any(Date), isActive: false } });
    expect(tx.inventory.upsert).not.toHaveBeenCalled();
  });

  it('global restore preserves branch archive markers', async () => {
    const { tx, prisma } = fixture();
    await changeOptionArchive(prisma, 'mango', 'owner', true);
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'mango' }, data: { deletedAt: null, isActive: true } });
    expect(tx.inventory.upsert).not.toHaveBeenCalled();
  });

  it('restores only the selected branch, retaining its stock', async () => {
    const { tx, prisma } = fixture();
    await changeOptionArchive(prisma, 'mango', 'owner', true, 'branch-a');
    expect(tx.inventory.upsert.mock.calls[0][0].update).toEqual({ archivedAt: null });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('requires global restore before a branch restore', async () => {
    const { option, prisma, tx } = fixture();
    (option as any).deletedAt = new Date();
    await expect(changeOptionArchive(prisma, 'mango', 'owner', true, 'branch-a')).rejects.toThrow('global flavor/color archive first');
    expect(tx.inventory.upsert).not.toHaveBeenCalled();
  });

  it('does not restore into an archived parent product', async () => {
    const { option, prisma } = fixture();
    (option.parent as any).deletedAt = new Date();
    await expect(changeOptionArchive(prisma, 'mango', 'owner', true)).rejects.toThrow('Restore the product and brand');
  });

  it('filters and paginates branch archive queries without losing globally archived options', async () => {
    const { tx, prisma } = fixture();
    await listOptionArchives(prisma, { scope: 'branch', branchId: 'branch-a', search: 'Mango', page: 2, limit: 20 });
    expect(tx.product.count).toHaveBeenCalledWith({ where: { parentId: { not: null }, name: { contains: 'Mango', mode: 'insensitive' }, inventory: { some: { branchId: 'branch-a', archivedAt: { not: null } } } } });
    expect(tx.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });
});
