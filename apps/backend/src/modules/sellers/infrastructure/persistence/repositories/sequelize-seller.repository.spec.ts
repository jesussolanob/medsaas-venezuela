import { SequelizeSellerRepository } from './sequelize-seller.repository';
import type { SellerProfileModel } from '../models/seller-profile.model';
import type { Sequelize } from 'sequelize-typescript';

/**
 * Focused guard on the attribution write.
 *
 * `sold_by_source` has to be written in the SAME statement as `sold_by`. Writing
 * the attribution without its source leaves the column NULL, and
 * AccrueSignupCommissionUseCase only pays when it reads an eligible source — so
 * the $10 entry commission would silently never fire for anybody.
 */
describe('SequelizeSellerRepository.linkSoldBy', () => {
  const SPECIALIST_ID = 'spec-1';
  const SELLER_ID = 'seller-1';

  function makeRepo() {
    const update = jest.fn().mockResolvedValue([1]);
    const profileModel = { update } as unknown as typeof SellerProfileModel;
    const sequelize = {} as Sequelize;
    return {
      repo: new SequelizeSellerRepository(profileModel, sequelize),
      update,
    };
  }

  it('writes sold_by_source = "code" together with sold_by', async () => {
    const { repo, update } = makeRepo();

    await repo.linkSoldBy(SPECIALIST_ID, SELLER_ID);

    expect(update).toHaveBeenCalledTimes(1);
    const [values] = update.mock.calls[0]!;
    expect(values).toEqual({ soldBy: SELLER_ID, soldBySource: 'code' });
  });

  it('keeps the one-write rule: only updates rows whose sold_by is still null', async () => {
    const { repo, update } = makeRepo();

    await repo.linkSoldBy(SPECIALIST_ID, SELLER_ID);

    const [, options] = update.mock.calls[0]!;
    expect(options).toEqual({ where: { id: SPECIALIST_ID, soldBy: null } });
  });
});
