import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { slugify } from '../../common/utils/string.util';

/** Options are inventory-bearing SKUs; their parent owns all prices and catalog metadata. */
export async function saveProductOptions(
  prisma: PrismaService,
  dto: Partial<CreateProductDto>,
  userId: string,
  id?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const current = id
        ? await tx.product.findUnique({
            where: { id },
            include: { inventory: true, options: { include: { inventory: true } } },
          })
        : null;
      if (id && (!current || current.deletedAt)) throw new NotFoundException('Product not found');
      if (current?.parentId)
        throw new BadRequestException('Edit flavors/colors from their parent product.');
      const type = dto.variantType ?? current?.variantType ?? 'NONE';
      if (!['FLAVOR', 'COLOR'].includes(type))
        throw new BadRequestException('A product with options must keep its flavor/color type.');
      if (current && current.variantType !== 'NONE' && current.variantType !== type)
        throw new BadRequestException('The flavor/color type cannot change once options exist.');
      if (dto.applyPriceToAllBranches && dto.sellingPrice === undefined) throw new BadRequestException('Enter the selling price to apply to all shops.');
      const options =
        dto.options ??
        (current?.options ?? []).map((o) => ({
          id: o.id,
          name: o.optionName!,
          archived: !!o.deletedAt,
        }));
      if (!options.length)
        throw new BadRequestException('Add at least one active flavor/color.');
      const names = options.map((o) => o.name.trim().toLocaleLowerCase());
      if (names.some((n) => !n) || new Set(names).size !== names.length)
        throw new BadRequestException('Flavor/color names must be nonempty and unique.');
      if (
        new Set(options.filter((o) => o.id).map((o) => o.id)).size !==
        options.filter((o) => o.id).length
      )
        throw new BadRequestException('Duplicate option IDs.');
      const allQuantities = [
        ...(dto.quantities ?? []),
        ...options.flatMap((o) => ('quantities' in o ? (o.quantities ?? []) : [])),
      ];
      const branchIds = [...new Set(allQuantities.map((q) => q.branchId))];
      if (
        branchIds.length !==
        (await tx.branch.count({ where: { id: { in: branchIds }, deletedAt: null } }))
      )
        throw new BadRequestException('One or more shops are unavailable.');
      for (const quantities of [
        dto.quantities,
        ...options.map((o) => ('quantities' in o ? o.quantities : undefined)),
      ]) {
        if (quantities && new Set(quantities.map((q) => q.branchId)).size !== quantities.length)
          throw new BadRequestException('A shop may appear only once per stock row.');
      }
      const converting = current?.variantType === 'NONE';
      if (converting) {
        await assertNoOpenWork(tx, [current!.id]);
        for (const inv of current!.inventory) {
          const allocated = options.reduce(
            (sum, o) =>
              sum +
              (('quantities' in o ? o.quantities : [])?.find((q) => q.branchId === inv.branchId)
                ?.quantity ?? 0),
            0,
          );
          if (allocated !== inv.quantity)
            throw new BadRequestException(
              `Allocate exactly ${inv.quantity} units for shop ${inv.branchId}. Adjust existing stock separately if needed.`,
            );
        }
        for (const q of allQuantities) {
          if (!current!.inventory.some((i) => i.branchId === q.branchId) && q.quantity !== 0)
            throw new BadRequestException('Conversion must preserve stock at every shop.');
        }
      }
      if (current?.options.some((o) => !options.some((input) => input.id === o.id)))
        throw new BadRequestException(
          'Keep existing options; archive them instead of removing their history.',
        );
      const name = dto.name?.trim() ?? current!.name;
      if (options.some((o) => `${name} — ${o.name.trim()}`.length > 150))
        throw new BadRequestException(
          'Product name plus flavor/color must be at most 150 characters.',
        );
      const metadata = {
        name,
        slug: slugify(name),
        variantType: type,
        brandId: dto.brandId ?? current!.brandId,
        sellingPrice: dto.sellingPrice ?? current?.sellingPrice ?? 0,
        costPrice: dto.costPrice ?? current?.costPrice ?? 0,
        quantityAlert: dto.quantityAlert ?? current?.quantityAlert ?? 0,
        image: dto.image !== undefined ? dto.image || null : (current?.image ?? null),
      };
      const brand = await tx.brand.findFirst({ where: { id: metadata.brandId, deletedAt: null } });
      if (!brand) throw new BadRequestException('Brand is unavailable.');
      const parent = current
        ? await tx.product.update({ where: { id }, data: metadata })
        : await tx.product.create({
            data: {
              ...metadata,
              sortOrder:
                ((await tx.product.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) +
                1,
            },
          });
      const parentBranches = new Set([
        ...branchIds,
        ...(current?.inventory ?? []).map((i) => i.branchId),
      ]);
      for (const branchId of parentBranches) {
        const old = current?.inventory.find((i) => i.branchId === branchId);
        const price =
          (dto.applyPriceToAllBranches ? dto.sellingPrice : undefined) ??
          dto.quantities?.find((q) => q.branchId === branchId)?.sellingPrice ??
          old?.sellingPrice ??
          parent.sellingPrice;
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: parent.id, branchId } },
          create: { productId: parent.id, branchId, quantity: 0, sellingPrice: price },
          update: { quantity: 0, sellingPrice: price },
        });
        if (converting && old?.quantity)
          await tx.stockMovement.create({
            data: {
              productId: parent.id,
              branchId,
              userId,
              type: 'ADJUSTMENT',
              quantityChange: -old.quantity,
              quantityAfter: 0,
              description: 'Allocated existing stock to flavors/colors.',
            },
          });
      }
      for (const input of options) {
        const old = current?.options.find((o) => o.id === input.id);
        if (input.id && !old)
          throw new BadRequestException('Option does not belong to this product.');
        if (old && old.optionName !== input.name.trim())
          throw new BadRequestException(
            'Existing option names cannot be changed; add a new option instead.',
          );
        const quantities = 'quantities' in input ? (input.quantities ?? []) : [];
        if (input.archived !== undefined && input.archived !== !!old?.deletedAt) {
          throw new BadRequestException('Use the Archive or Restore action to change option status.');
        }
        const data = {
          name: `${parent.name} — ${input.name.trim()}`,
          slug: slugify(`${parent.name}-${input.name}`),
          optionName: input.name.trim(),
          brandId: parent.brandId,
          image: parent.image,
          sellingPrice: parent.sellingPrice,
          costPrice: parent.costPrice,
          quantityAlert: parent.quantityAlert,
          deletedAt: old?.deletedAt ?? null,
        };
        const option = old
          ? await tx.product.update({ where: { id: old.id }, data })
          : await tx.product.create({ data: { ...data, parentId: parent.id } });
        for (const branchId of parentBranches) {
          const supplied = quantities.find((q) => q.branchId === branchId);
          const previous = old?.inventory.find((i) => i.branchId === branchId);
          if (supplied && previous && supplied.expectedQuantity !== previous.quantity) {
            throw new BadRequestException(
              `Stock for ${input.name} changed while editing. Close and reopen the product before saving.`,
            );
          }
          const quantity = supplied?.quantity ?? previous?.quantity ?? 0;
          if ((old?.deletedAt || previous?.archivedAt) && quantity !== (previous?.quantity ?? 0)) {
            throw new BadRequestException('Restore this flavor/color at the shop before changing its stock.');
          }
          const parentInv = await tx.inventory.findUniqueOrThrow({
            where: { productId_branchId: { productId: parent.id, branchId } },
          });
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: option.id, branchId } },
            create: {
              productId: option.id,
              branchId,
              quantity,
              sellingPrice: parentInv.sellingPrice,
            },
            update: { ...(supplied ? { quantity } : {}), sellingPrice: parentInv.sellingPrice },
          });
          const diff = quantity - (previous?.quantity ?? 0);
          if (diff)
            await tx.stockMovement.create({
              data: {
                productId: option.id,
                branchId,
                userId,
                type: old ? 'ADJUSTMENT' : 'RESTOCK',
                quantityChange: diff,
                quantityAfter: quantity,
                description: converting
                  ? 'Allocated from existing product stock.'
                  : 'Flavor/color stock updated.',
              },
            });
        }
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: converting ? 'PRODUCT_CONVERTED_TO_OPTIONS' : 'PRODUCT_OPTIONS_SAVED',
          entityType: 'Product',
          entityId: parent.id,
          newValues: { variantType: type, options: options.map((o) => o.name) },
        },
      });
      return parent.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
  );
}

async function assertNoOpenWork(tx: Prisma.TransactionClient, ids: string[]) {
  const [sales, disposals, drafts] = await Promise.all([
    tx.saleItem.count({ where: { productId: { in: ids }, sale: { status: 'PENDING' } } }),
    tx.disposal.count({ where: { productId: { in: ids }, status: 'PENDING' } }),
    tx.draftOrder.findMany({ select: { items: true, disposalItems: true } }),
  ]);
  const inDraft = drafts.some((d) =>
    [d.items, d.disposalItems].some(
      (rows) => Array.isArray(rows) && rows.some((r: any) => ids.includes(r.productId)),
    ),
  );
  if (sales || disposals || inDraft)
    throw new BadRequestException(
      'Finish or clear drafts and pending sales/disposals for this product first.',
    );
}
