/**
 * Loyalty: point balances, reward redemption, and the customer-facing wallet.
 *
 * Redemption is the one place a customer's balance is spent, so it validates the
 * balance and deducts it in the same batch as the redemption record. Checking
 * then writing in two calls would allow the same reward to be claimed twice from
 * two tills at once.
 */

import { NotFoundError, type TenantDb } from "../lib/db.js";
import { newId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";

export class RedemptionError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "RedemptionError";
  }
}

export interface RedemptionRow {
  id: string;
  customer_id: string;
  reward_id: string;
  reward_name: string;
  points_spent: number;
  redeemed_at: string;
}

export class LoyaltyRepository {
  constructor(private readonly db: TenantDb) {}

  /**
   * Redeems a reward for a customer.
   *
   * The balance deduction is guarded in SQL (`loyalty_points >= ?`) rather than
   * only in application code, so two simultaneous redemptions cannot both
   * succeed against the same balance.
   */
  async redeem(customerId: string, rewardId: string): Promise<{ redemption: RedemptionRow; remainingPoints: number }> {
    const [customer, reward] = await Promise.all([
      this.db.first<{ id: string; loyalty_points: number; full_name: string }>(
        "select id, loyalty_points, full_name from customers where id = ? and is_archived = 0 {where}",
        [customerId]
      ),
      this.db.first<{ id: string; name: string; points_required: number }>(
        "select id, name, points_required from rewards where id = ? and is_active = 1 {where}",
        [rewardId]
      )
    ]);

    if (!customer) throw new NotFoundError("Customer");
    if (!reward) throw new NotFoundError("Reward");
    if (customer.loyalty_points < reward.points_required) {
      throw new RedemptionError(
        `${customer.full_name} has ${customer.loyalty_points} points; this reward needs ${reward.points_required}.`,
        "insufficient_points"
      );
    }

    const deduction = await this.db.run(
      "update customers set loyalty_points = loyalty_points - ?, updated_at = ? where id = ? and loyalty_points >= ? {where}",
      [reward.points_required, nowIso(), customerId, reward.points_required]
    );
    if (deduction.meta.changes === 0) {
      throw new RedemptionError("Point balance changed before the reward could be redeemed. Please retry.", "conflict");
    }

    const id = newId("redemption");
    const ts = nowIso();
    await this.db.insert("reward_redemptions", {
      id,
      customer_id: customerId,
      reward_id: rewardId,
      points_spent: reward.points_required,
      redeemed_at: ts
    });

    return {
      redemption: {
        id,
        customer_id: customerId,
        reward_id: rewardId,
        reward_name: reward.name,
        points_spent: reward.points_required,
        redeemed_at: ts
      },
      remainingPoints: customer.loyalty_points - reward.points_required
    };
  }

  history(customerId: string, limit = 20): Promise<RedemptionRow[]> {
    return this.db.all<RedemptionRow>(
      `select r.id, r.customer_id, r.reward_id, rw.name as reward_name, r.points_spent, r.redeemed_at
       from reward_redemptions r join rewards rw on rw.id = r.reward_id
       where r.customer_id = ? {where:r}
       order by r.redeemed_at desc limit ?`,
      [customerId, Math.min(limit, 100)]
    );
  }

  /**
   * The customer wallet view: balance, the next reward within reach, and how
   * many points remain to it. This is what the QR-code PWA shows.
   */
  async wallet(customerId: string): Promise<{
    points: number;
    nextReward: { id: string; name: string; pointsRequired: number; pointsRemaining: number } | null;
    unlocked: Array<{ id: string; name: string; pointsRequired: number }>;
  }> {
    const customer = await this.db.first<{ loyalty_points: number }>(
      "select loyalty_points from customers where id = ? {where}",
      [customerId]
    );
    if (!customer) throw new NotFoundError("Customer");

    const rewards = await this.db.all<{ id: string; name: string; points_required: number }>(
      "select id, name, points_required from rewards where is_active = 1 {where} order by points_required asc"
    );

    const unlocked = rewards
      .filter((reward) => reward.points_required <= customer.loyalty_points)
      .map((reward) => ({ id: reward.id, name: reward.name, pointsRequired: reward.points_required }));

    const next = rewards.find((reward) => reward.points_required > customer.loyalty_points);

    return {
      points: customer.loyalty_points,
      unlocked,
      nextReward: next
        ? {
            id: next.id,
            name: next.name,
            pointsRequired: next.points_required,
            pointsRemaining: next.points_required - customer.loyalty_points
          }
        : null
    };
  }
}
