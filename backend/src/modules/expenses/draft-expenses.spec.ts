import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { DraftsService } from '../sales/drafts.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

const BRANCH = '11111111-1111-4111-8111-111111111111';
const STAFF: RequestUser = { userId: 'staff', email: 'staff@example.invalid', role: 'Staff' };

describe('Expenses submitted from Staff drafts', () => {
  let app: INestApplication;
  let prisma: any;
  let drafts: DraftsService;
  let rows: any[];
  const addedAt = '2026-11-25T13:00:00.000Z';
  beforeEach(async () => {
    rows = [];
    const matching = (where: any) => rows.filter(row => (!where.branchId || row.branchId === where.branchId) && (!where.status || row.status === where.status));
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: STAFF.userId, email: STAFF.email, branchId: BRANCH }) },
      draftOrder: {
        delete: jest.fn().mockResolvedValue({ branchId: BRANCH, items: [], disposalItems: [], expenses: [{ amount: 125.5, note: 'Delivery from draft', addedAt }], customerName: null }),
        create: jest.fn(),
      },
      expense: {
        create: jest.fn().mockImplementation(async ({ data }: any) => { const row = { ...data, id: 'expense', createdAt: new Date(), branch: { id: BRANCH, name: 'Branch A' }, staff: { id: STAFF.userId, firstName: 'Sample', lastName: 'Staff' } }; rows.push(row); return row; }),
        count: jest.fn().mockImplementation(async ({ where }: any) => matching(where).length),
        findMany: jest.fn().mockImplementation(async ({ where, skip, take }: any) => matching(where).slice(skip, skip + take)),
        aggregate: jest.fn().mockImplementation(async ({ where }: any) => ({ _sum: { amount: matching(where).reduce((sum, row) => sum + Number(row.amount), 0) } })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const expenses = new ExpensesService(prisma);
    drafts = new DraftsService(prisma, { create: jest.fn() } as any, { create: jest.fn() } as any, expenses);
    const module = await Test.createTestingModule({ controllers: [ExpensesController], providers: [{ provide: ExpensesService, useValue: expenses }] })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.user = STAFF; next(); });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterEach(async () => { await app.close(); });

  it.each(['Staff', 'Admin'])('an expense-only draft saved by %s is immediately readable by the Staff pending report', async role => {
    await request(app.getHttpServer()).get('/expenses?status=PENDING&limit=200').expect(200).expect(response => expect(response.body.data).toEqual([]));
    const result = await drafts.saveForStaff(STAFF.userId, { ...STAFF, role } as RequestUser);
    expect(result).toMatchObject({ sale: null, disposals: [], errors: [], alreadySubmitted: false });
    expect(result.expenses).toHaveLength(1);
    const response = await request(app.getHttpServer()).get('/expenses?status=PENDING&limit=200').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ amount: 125.5, note: 'Delivery from draft', status: 'PENDING', addedAt, staff: { id: STAFF.userId }, branch: { id: BRANCH } });
    expect(response.body.summary).toEqual({ totalAmount: 125.5, count: 1 });
    expect(prisma.expense.findMany.mock.calls.at(-1)[0].where).toMatchObject({ status: 'PENDING', branchId: BRANCH });
    // Approved/declined and other-branch records must not leak into pending totals.
    rows.push({ ...rows[0], id: 'approved', status: 'APPROVED' }, { ...rows[0], id: 'declined', status: 'DECLINED' }, { ...rows[0], id: 'other-shop', branchId: 'other' });
    const filtered = await request(app.getHttpServer()).get('/expenses?status=PENDING&limit=200').expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.summary).toEqual({ totalAmount: 125.5, count: 1 });
  });
  it.each(['APPROVED','DECLINED'])('accepts the existing %s status filter', async status => {
    await request(app.getHttpServer()).get('/expenses').query({ status, limit: '200' }).expect(200);
    expect(prisma.expense.findMany.mock.calls[0][0].where.status).toBe(status);
  });
  it.each([{ status: 'UNKNOWN' }, { status: 'pending' }, { status: 'PENDING', unexpected: 'field' }, { status: 'PENDING', limit: '201' }])('retains strict validation for %j', async query => {
    await request(app.getHttpServer()).get('/expenses').query(query).expect(400);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });
  it('keeps the default unfiltered list valid', async () => {
    await request(app.getHttpServer()).get('/expenses').expect(200);
    expect(prisma.expense.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
  });
});
