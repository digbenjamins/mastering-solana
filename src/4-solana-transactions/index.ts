import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  isSolanaError,
  lamports,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
} from "@solana/kit";
import { loadSignerFromFile } from "../wallet";
import { config } from "../config";
import { getTransferSolInstruction } from "@solana-program/system";
import { getAddMemoInstruction } from "@solana-program/memo";
import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { estimateAndSetComputeUnitLimitFactory } from "../functions";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // BENjdUV4wjhFPbEQfB3pnuC9g7PxLHH3kGE33oovG6WP

const transferAmount = lamports(config.LAMPORTS_PER_SOL / 100n); // 0.01 SOL
const memoMessage = "Hello, Solana Transactions!";

/**
 *  Subscribe to log notifications
 */
const abortController = new AbortController();
const notifications = await rpcSubscriptions
  .logsNotifications({ mentions: [wallet.address] }, { commitment: "processed" })
  .subscribe({ abortSignal: abortController.signal });

(async () => {
  for await (const notification of notifications) {
    const logContainsMemo = notification.value.logs.some((log) => log.includes(memoMessage));
    console.log(`✅ Transaction found: https://solscan.io/tx/${notification.value.signature}`, notification.value.logs);
    if (logContainsMemo) abortController.abort();
  }
})();

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

/**
 * Creat a transfer instruction
 */
const transferInstruction = getTransferSolInstruction({
  source: wallet,
  destination: wallet.address,
  amount: transferAmount,
});

/**
 *  Create a memo instruction
 */
const memoInstruction = getAddMemoInstruction({
  memo: memoMessage,
});

/**
 *  Build the transaction
 */
const transactionMessage = await pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(wallet, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions([transferInstruction, memoInstruction], tx)
);

/**
 *  Calculate the transaction cost
 */
const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
const computeUnitsEstimate = await estimateComputeUnitLimit(transactionMessage);
console.log("💡 Estimated Compute Units:", computeUnitsEstimate);

/**
 * Sign and send the transaction
 */
try {
  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
  await sendTransactionWithoutConfirmingFactory({ rpc })(signedTransaction, { commitment: "confirmed" });
  console.log("🚀 Transaction sent, awaiting confirmation via subscription...");
} catch (e) {
  if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
    console.error("❌ The transaction failed in simulation", e.cause);
    abortController.abort();
  } else {
    console.error("❌ Something went wrong", e);
    abortController.abort();
  }
}
