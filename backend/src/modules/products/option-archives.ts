import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOptionArchiveDto } from './dto/option-archive.dto';

export async function changeOptionArchive(
  prisma: PrismaService,
  optionId: string,
  userId: string,
  restore: boolean,
  branchId?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const option = await tx.product.findUnique({
        where: { id: optionId },
        include: { parent: { include: { brand: true } } },
      });
      if (!option?.parent) throw new NotFoundException('Flavor/color not found.');
      if (restore && (option.parent.deletedAt || option.parent.brand.deletedAt)) {
        throw new BadRequestException(
          'Restore the product and brand before restoring this flavor/color.',
        );
      }
      if (branchId) {
        const branch = await tx.branch.findUnique({ where: { id: branchId } });
        if (!branch) throw new NotFoundException('Shop not found.');
        if (restore) {
          const [parentInventory, brandArchive] = await Promise.all([
            tx.inventory.findUnique({
              where: { productId_branchId: { productId: option.parentId!, branchId } },
            }),
            tx.branchBrandArchive.findUnique({
              where: { brandId_branchId: { brandId: option.brandId, branchId } },
            }),
          ]);
          if (branch.deletedAt || parentInventory?.archivedAt || brandArchive || option.deletedAt) {
            throw new BadRequestException(
              'Restore the shop, product, brand and global flavor/color archive first.',
            );
          }
        }
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: option.id, branchId } },
          create: {
            productId: option.id,
            branchId,
            quantity: 0,
            archivedAt: restore ? null : new Date(),
          },
          update: { archivedAt: restore ? null : new Date() },
        });
      } else {
        await tx.product.update({
          where: { id: option.id },
          data: { deletedAt: restore ? null : new Date(), isActive: restore },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: `OPTION_${branchId ? 'BRANCH_' : ''}${restore ? 'RESTORED' : 'ARCHIVED'}`,
          entityType: 'Product',
          entityId: option.id,
          newValues: {
            parentId: option.parentId,
            optionName: option.optionName,
            branchId: branchId ?? null,
          },
        },
      });
      return { message: `Flavor/color ${restore ? 'restored' : 'archived'} successfully.` };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listOptionArchives(prisma: PrismaService, query: QueryOptionArchiveDto) {
  const { page = 1, limit = 20, search, branchId } = query;
  const branchScope = query.scope === 'branch';
  const where: Prisma.ProductWhereInput = { parentId: { not: null } };
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (branchScope)
    where.inventory = { some: { ...(branchId ? { branchId } : {}), archivedAt: { not: null } } };
  else where.deletedAt = { not: null };
  if (!branchScope && branchId) where.inventory = { some: { branchId } };
  const [total, options] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, variantType: true } },
        inventory: {
          where: {
            ...(branchId ? { branchId } : {}),
            ...(branchScope ? { archivedAt: { not: null } } : {}),
          },
          include: { branch: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    data: options.map((option) => ({
      id: option.id,
      name: option.optionName,
      product: option.parent,
      globallyArchived: !!option.deletedAt,
      archivedAt: option.deletedAt,
      quantities: option.inventory.map((i) => ({
        branchId: i.branchId,
        branchName: i.branch.name,
        quantity: i.quantity,
        archivedAt: i.archivedAt,
      })),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
