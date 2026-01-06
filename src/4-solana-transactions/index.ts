import {
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64Decoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getSignatureFromTransaction,
  isSolanaError,
  lamports,
  pipe,
  prependTransactionMessageInstructions,
  sendAndConfirmTransactionFactory,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
  TransactionMessageBytes,
  TransactionMessageBytesBase64,
} from "@solana/kit";
import { loadSignerFromFile } from "../wallet";
import { config } from "../config";
import { getTransferSolInstruction } from "@solana-program/system";
import { getAddMemoInstruction } from "@solana-program/memo";
import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const receiver = await loadSignerFromFile("sec.json"); // SecpqnoH2pRrPvZC8BEUykg94gVi53WB3uBJtiUzgY3
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
  destination: receiver.address,
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
  createTransactionMessage({ version: "legacy" }),
  (tx) => setTransactionMessageFeePayerSigner(wallet, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions([transferInstruction, memoInstruction], tx)
);

/**
 *  Calculate the transaction cost
 */
const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
const computeUnitsEstimate = await estimateComputeUnitLimit(transactionMessage);
console.log("💡 Estimated Compute Units:", computeUnitsEstimate, "CU");

// /**
//  *  Add compute unit limit instruction to the transaction
//  *  The lower that number is, the higher the chances that our transaction will be included in the next block.
//  */
const budgetedTransactionMessage = prependTransactionMessageInstructions(
  [getSetComputeUnitLimitInstruction({ units: computeUnitsEstimate })],
  transactionMessage
);

/**
 *  Provide additional priority fees for our transactions
 *  in the form of micro-lamports per CU.
 *  Example fee: 0.000405 SOL, 400,000 CU * 1 lamport/CU = 400,000 lamports = 0.0004 SOL + base fee 0.000005 SOL = 0.000405 SOL
 */
const prioTransactionMessage = appendTransactionMessageInstructions(
  [getSetComputeUnitLimitInstruction({ units: computeUnitsEstimate * 1.1 }), getSetComputeUnitPriceInstruction({ microLamports: 1_000_000 })],
  transactionMessage
);

/**
 *  Get estimated fee for the transaction
 */
const base64EncodedMessage = pipe(
  transactionMessage,
  compileTransactionMessage,
  getCompiledTransactionMessageEncoder().encode,
  getBase64Decoder().decode
) as TransactionMessageBytesBase64;
const transactionCost = await rpc.getFeeForMessage(base64EncodedMessage).send();
console.log("💡 Estimated Fee Cost ", Number(transactionCost.value) / LAMPORTS_PER_SOL, "SOL");

/**
 * Sign transaction
 */
const signedTransaction = await signTransactionMessageWithSigners(prioTransactionMessage);
console.log("💡 Signed Transaction:", signedTransaction);

/**
 *  Compiled signed transaction message
 */
const compiledMessage = getCompiledTransactionMessageDecoder().decode(signedTransaction.messageBytes as TransactionMessageBytes);
console.log("💡 Compiled Signed Transaction Message:", compiledMessage);

/**
 * Send transaction
 */
try {
  await sendTransactionWithoutConfirmingFactory({ rpc })(signedTransaction, { commitment: "confirmed", skipPreflight: true });
} catch (e) {
  if (isSolanaError(e, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
    console.error("This transaction depends on a blockhash that has expired");
  } else {
    throw e;
  }
}
