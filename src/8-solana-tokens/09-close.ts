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
import { findAssociatedTokenPda, getCloseAccountInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
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
 *  Fetch token account to check balance before close
 */
const { value } = await rpc.getBalance(wallet.address).send();
console.log("\nAccount balance before close:", value, "Lamports");

/**
 *  Create instruction to close the token account
 */
const closeAccountInstruction = getCloseAccountInstruction({
  account: associatedTokenAddress,
  destination: wallet.address,
  owner: wallet,
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
  (tx) => appendTransactionMessageInstructions([closeAccountInstruction], tx) // Append instructions
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
 *  Fetch token account to check balance before close
 */
const { value: valueAfter } = await rpc.getBalance(wallet.address).send();
console.log("\nAccount balance after close:", valueAfter, "Lamports");
console.log("\nTrasnfer Signature:", transactionSignature);
