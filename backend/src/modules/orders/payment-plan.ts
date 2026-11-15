export const ORDER_DEPOSIT_PERCENT = 15 as const;

export type PaymentMethod = 'ONLINE' | 'PAY_AT_PICKUP';
export type PaymentPlan = 'FULL_ONLINE' | 'DEPOSIT_15';

export interface PaymentTerms {
  paymentPlan: PaymentPlan;
  depositPercent: number;
  depositAmount: number;
  amountDueNow: number;
  remainingAmount: number;
}

export function orderPaymentTerms(total: number, method: PaymentMethod): PaymentTerms {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error('Order total must be a non-negative safe integer');
  if (method === 'ONLINE') {
    return {
      paymentPlan: 'FULL_ONLINE',
      depositPercent: 0,
      depositAmount: 0,
      amountDueNow: total,
      remainingAmount: 0,
    };
  }
  const depositAmount = Number((BigInt(total) * BigInt(ORDER_DEPOSIT_PERCENT) + 99n) / 100n);
  return {
    paymentPlan: 'DEPOSIT_15',
    depositPercent: ORDER_DEPOSIT_PERCENT,
    depositAmount,
    amountDueNow: depositAmount,
    remainingAmount: total - depositAmount,
  };
}

export function quotePaymentOptions(total: number) {
  return (['ONLINE', 'PAY_AT_PICKUP'] as const).map((paymentMethod) => ({
    paymentMethod,
    ...orderPaymentTerms(total, paymentMethod),
  }));
}
