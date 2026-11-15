import { isSupportedRole } from '../../common/utils/roles';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, DisposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { QueryDisposalDto } from './dto/query-disposal.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { businessDayRange } from '../../common/utils/business-day.util';

@Injectable()
export class DisposalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Request a disposal. It starts as PENDING and stock is reserved (deducted)
   * immediately, same timing as Sale.create() — not at approval. Restored if
   * declined while still pending.
   */
  async create(dto: CreateDisposalDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    const product = await this.prisma.product.findFirst({
      // Block archived products AND products from an archived brand.
      where: { id: dto.productId, variantType: 'NONE', deletedAt: null, brand: { deletedAt: null }, OR: [{ parentId: null }, { parent: { deletedAt: null, inventory: { some: { branchId, archivedAt: null } } } }] },
      include: { brand: { select: { name: true } }, parent: { select: { sellingPrice: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // A disposal is a loss of what the goods COST us (capital), not their
    // selling price — you never realized the sale. So value the write-off at
    // the product's cost price. This snapshots the cost at disposal time onto
    // the row (unitPrice/value), so later cost changes don't rewrite history.
    const unitPrice = new Prisma.Decimal(product.costPrice);
    const value = unitPrice.mul(dto.quantity);

    const disposal = await this.prisma.$transaction(async (tx) => {
      const quantityAfter = await this.reserveStock(
        tx, branchId, product.id, product.name, dto.quantity,
      );

      // Snapshot branch selling value separately so price edits cannot rewrite history.
      const priceInventory = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: product.parentId ?? product.id, branchId } },
        select: { sellingPrice: true },
      });
      const sellingUnit = priceInventory?.sellingPrice ?? product.parent?.sellingPrice ?? product.sellingPrice;
      const sellingValue = new Prisma.Decimal(sellingUnit).mul(dto.quantity);
      const created = await tx.disposal.create({
        data: {
          branchId,
          productId: product.id,
          productName: product.name,
          brandName: product.brand.name,
          quantity: dto.quantity,
          unitPrice,
          value,
          sellingValue,
          reason: dto.reason?.trim() || null,
          status: DisposalStatus.PENDING,
          createdById: actor.userId,
          // Original draft add-time (null when not from a draft; UI falls back
          // to createdAt).
          addedAt: dto.addedAt ? new Date(dto.addedAt) : null,
        },
        include: this.includeFull(),
      });

      // Record the stock drop in the activity log AT REQUEST TIME, because the
      // stock is actually deducted now (reserved) — not at approval. This is
      // the real -qty movement; approval later adds a 0-change audit line.
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          branchId,
          userId: actor.userId,
          type: 'DISPOSAL',
          quantityChange: -dto.quantity,
          quantityAfter,
          description: 'Disposed Product (Pending)',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_REQUESTED',
          entityType: 'Disposal',
          entityId: created.id,
          newValues: { product: product.name, quantity: dto.quantity },
        },
      });

      return created;
    });

    return this.serialize(disposal, actor.role);
  }

  /**
   * Approve a pending disposal. Stock was already reserved at creation, so
   * this just flips the status.
   */
  async approve(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the disposal so concurrent approve() calls can't
      // both succeed.
      const claim = await tx.disposal.updateMany({
        where: { id, status: DisposalStatus.PENDING },
        data: {
          status: DisposalStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Disposal is already approved or declined');
      }

      const updated = await tx.disposal.findUnique({
        where: { id },
        include: this.includeFull(),
      });

      // Audit-only movement: the stock was ALREADY deducted when the disposal
      // was requested (see create()), so approval must NOT deduct again. Record
      // a 0-change line that stamps WHO approved and WHEN, keeping the activity
      // log a complete, transparent trail without double-counting the stock.
      if (disposal.productId) {
        const inv = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: disposal.productId, branchId: disposal.branchId } },
        });
        await tx.stockMovement.create({
          data: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            userId: actor.userId,
            type: 'DISPOSAL',
            quantityChange: 0,
            quantityAfter: inv?.quantity ?? 0,
            description: 'Disposal approved',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_APPROVED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName, quantity: disposal.quantity },
        },
      });

      return this.serialize(updated!, actor.role);
    });
  }

  /** Decline a pending disposal and restore the stock reserved at request time. */
  async decline(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.disposal.updateMany({
        where: { id, status: DisposalStatus.PENDING },
        data: {
          status: DisposalStatus.DECLINED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Disposal is already approved or declined');
      }

      if (disposal.productId) {
        // Restore the reserved stock. Use upsert so that if the branch's
        // inventory row no longer exists (e.g. it was removed after the
        // disposal was created), the stock is still returned by recreating
        // the row — instead of an updateMany silently matching nothing and
        // losing the stock.
        const restored = await tx.inventory.upsert({
          where: {
            productId_branchId: {
              productId: disposal.productId,
              branchId: disposal.branchId,
            },
          },
          create: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            quantity: disposal.quantity,
          },
          update: { quantity: { increment: disposal.quantity } },
          select: { quantity: true },
        });

        // Log the stock return so the activity trail shows the decline, who
        // did it, and when (mirrors the pending-dispose entry in create()).
        await tx.stockMovement.create({
          data: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            userId: actor.userId,
            type: 'RETURN',
            quantityChange: disposal.quantity,
            quantityAfter: restored.quantity,
            description: 'Disposal declined — stock returned',
          },
        });
      }

      const updated = await tx.disposal.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_DECLINED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName },
        },
      });

      return this.serialize(updated!, actor.role);
    });
  }

  /**
   * Delete a disposal. Mirrors SalesService.remove():
   *   - APPROVED disposals are locked (its stock write-off is final).
   *   - Staff may only delete their OWN disposal; Owner/Admin any.
   *   - A PENDING disposal still holds its reserved stock, so deleting it
   *     RESTORES that stock (same inventory.upsert increment as decline()).
   *     A DECLINED disposal already had its stock restored at decline, so we
   *     must NOT restore again (that would double-credit inventory).
   */
  async remove(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status === DisposalStatus.APPROVED) {
      throw new BadRequestException('Approved disposals cannot be deleted');
    }
    if (actor.role === 'Staff' && disposal.createdById !== actor.userId) {
      throw new ForbiddenException('You can only delete your own disposals');
    }

    await this.prisma.$transaction(async (tx) => {
      // Only a PENDING disposal still has its reservation in effect — a
      // DECLINED one was already restored when it was declined.
      if (disposal.status === DisposalStatus.PENDING && disposal.productId) {
        const restored = await tx.inventory.upsert({
          where: {
            productId_branchId: {
              productId: disposal.productId,
              branchId: disposal.branchId,
            },
          },
          create: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            quantity: disposal.quantity,
          },
          update: { quantity: { increment: disposal.quantity } },
          select: { quantity: true },
        });

        // Log the stock return so deleting a pending disposal is also visible
        // in the activity trail (who/when), consistent with decline().
        await tx.stockMovement.create({
          data: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            userId: actor.userId,
            type: 'RETURN',
            quantityChange: disposal.quantity,
            quantityAfter: restored.quantity,
            description: 'Pending disposal deleted — stock returned',
          },
        });
      }

      await tx.disposal.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_DELETED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName },
        },
      });
    });

    return { message: 'Disposal deleted successfully' };
  }

  /**
   * Same atomic conditional-UPDATE reservation pattern as SalesService.
   * Returns the branch's REMAINING quantity after the decrement, so the caller
   * can record an accurate `quantityAfter` on the stock-movement log entry.
   */
  private async reserveStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    productId: string,
    productName: string,
    quantity: number,
  ): Promise<number> {
    const result = await tx.inventory.updateMany({
      where: { productId, branchId, archivedAt: null, product: { deletedAt: null }, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      const inv = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId } },
      });
      throw new BadRequestException(
        `Insufficient stock to dispose "${productName}" (need ${quantity}, have ${inv?.quantity ?? 0})`,
      );
    }
    const inv = await tx.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
      select: { quantity: true },
    });
    return inv?.quantity ?? 0;
  }

  async findAll(query: QueryDisposalDto, actor: RequestUser, status?: DisposalStatus) {
    const { page = 1, limit = 50, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DisposalWhereInput = {};
    if (status) where.status = status;

    if (actor.role === 'Staff') {
      // Staff see only the disposals THEY submitted (not the whole branch).
      where.createdById = actor.userId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      // PH business-day window (midnight-to-midnight PH) so disposals show on
      // the correct day's report regardless of server timezone. See business-day.util.
      where.createdAt = businessDayRange(startDate, endDate);
    }

    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, disposals, agg] = await Promise.all([
      this.prisma.disposal.count({ where }),
      this.prisma.disposal.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.disposal.aggregate({ where, _sum: { ...(actor.role === 'Owner' ? { value: true as const } : {}), sellingValue: true, quantity: true } }),
    ]);

    return {
      data: disposals.map((d) => this.serialize(d, actor.role)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      summary: {
        totalValue: Number((actor.role === 'Owner' ? agg._sum.value : agg._sum.sellingValue) ?? 0),
        totalQuantity: agg._sum.quantity ?? 0,
        count: total,
      },
    };
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (!isSupportedRole(actor.role)) {
      throw new ForbiddenException('Unsupported account role.');
    }
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branch: { select: { id: true, deletedAt: true } } },
      });
      if (!me?.branch) {
        throw new BadRequestException('Your account is not assigned to a branch.');
      }
      // An archived (closed) branch cannot transact.
      if (me.branch.deletedAt) {
        throw new BadRequestException(
          'Your assigned shop is archived. Ask an admin to assign you to an active shop.',
        );
      }
      return me.branch.id;
    }
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branchId;
  }

  private includeFull() {
    return {
      branch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    } satisfies Prisma.DisposalInclude;
  }

  private serialize(d: any, role: string) {
    const sellingValue = Number(d.sellingValue ?? 0);
    const owner = role === 'Owner';
    return {
      id: d.id,
      branch: d.branch ? { id: d.branch.id, name: d.branch.name } : null,
      productId: d.productId,
      name: d.productName,
      brandName: d.brandName,
      quantity: d.quantity,
      unitPrice: owner ? Number(d.unitPrice) : (d.quantity ? sellingValue / d.quantity : 0),
      // Non-Owners never receive cost, including mutation responses.
      value: owner ? Number(d.value) : sellingValue,
      sellingValue,
      reason: d.reason,
      status: d.status,
      createdBy: d.createdBy
        ? `${d.createdBy.firstName} ${d.createdBy.lastName}`.trim()
        : 'System',
      // Creator id (nullable) so the client can gate the delete button to the
      // staff member's OWN disposal. Display name stays in `createdBy` above.
      createdById: d.createdBy?.id ?? null,
      decidedBy: d.decidedBy
        ? `${d.decidedBy.firstName} ${d.decidedBy.lastName}`.trim()
        : null,
      decidedAt: d.decidedAt,
      createdAt: d.createdAt,
      // Original draft add-time; falls back to createdAt for pre-feature rows.
      addedAt: d.addedAt ?? d.createdAt,
      // Current product image (null if the product was deleted or has none).
      image: d.product?.image ?? null,
    };
  }
}
