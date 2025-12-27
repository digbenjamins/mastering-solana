import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { appendTransactionMessageInstruction, BaseTransactionMessage, TransactionMessageWithFeePayer } from "@solana/kit";

export function estimateAndSetComputeUnitLimitFactory(...params: Parameters<typeof estimateComputeUnitLimitFactory>) {
  const estimateComputeUnitLimit = estimateComputeUnitLimitFactory(...params);
  return async <T extends BaseTransactionMessage & TransactionMessageWithFeePayer>(transactionMessage: T) => {
    const computeUnitsEstimate = await estimateComputeUnitLimit(transactionMessage);
    console.log("💡 Estimated Compute Units:", computeUnitsEstimate);
    return appendTransactionMessageInstruction(getSetComputeUnitLimitInstruction({ units: computeUnitsEstimate }), transactionMessage);
  };
}

export function tokensToRaw(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * Math.pow(10, decimals)));
}
