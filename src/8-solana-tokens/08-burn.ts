import {
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  isSolanaError,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
} from "@solana/kit";
import { loadSignerFromFile } from "../wallet";
import { fetchToken, findAssociatedTokenPda, getBurnCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { tokensToRaw } from "../functions";
import { config } from "../config";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const mint = address(config.MINT);

/**
 *  Use findAssociatedTokenPda to derive the ATA address
 */
const [associatedTokenAddress] = await findAssociatedTokenPda({
  mint: mint,
  owner: wallet.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

/**
 *  Fetch token account to check balance before burn
 */
const tokenAccountBefore = await fetchToken(rpc, associatedTokenAddress);
console.log("\nToken balance before burn:", tokenAccountBefore.data.amount / 10n ** 9n, "tokens");

/**
 *  Create instruction to burn tokens
 */
const burnInstruction = getBurnCheckedInstruction({
  account: associatedTokenAddress,
  mint: mint,
  authority: wallet.address,
  amount: tokensToRaw(100, 9), // 9 decimals
  decimals: 9,
});

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

/**
 *  Build the transaction
 */
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }), // Create transaction message
  (tx) => setTransactionMessageFeePayerSigner(wallet, tx), // Set fee payer
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx), // Set transaction blockhash
  (tx) => appendTransactionMessageInstructions([burnInstruction], tx) // Append instructions
);

/**
 * Sign  transaction
 */
const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

// This is the key step: re-apply the blockhash lifetime AFTER signing
// so that the final object has the correct narrow lifetimeConstraint type
const transactionToSend = {
  ...signedTransaction,
  lifetimeConstraint: latestBlockhash,
};

try {
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(transactionToSend, { commitment: "confirmed" });
} catch (e) {
  if (isSolanaError(e, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
    console.error("This transaction depends on a blockhash that has expired");
  } else {
    throw e;
  }
}

/**
 * Get the transaction signature
 */
const transactionSignature = getSignatureFromTransaction(signedTransaction);

/**
 * Fetch token account to check balance after burn
 */
const tokenAccountAfter = await fetchToken(rpc, associatedTokenAddress);

console.log("\nTrasnfer Signature:", transactionSignature);
console.log("Token balance after burn:", tokenAccountAfter.data.amount / 10n ** 9n, "tokens");
