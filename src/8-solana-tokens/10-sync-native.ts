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
import {
  fetchToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { config } from "../config";
import { getTransferSolInstruction } from "@solana-program/system";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const mint = address(config.MINT);
const NATIVE_MINT = address("So11111111111111111111111111111111111111112");
const amountToSync = 1n * config.LAMPORTS_PER_SOL;
/**
 *  Use findAssociatedTokenPda to derive the ATA address for WSOL
 */
const [associatedTokenAddressWsol] = await findAssociatedTokenPda({
  mint: NATIVE_MINT,
  owner: wallet.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

/**
 *  Create instruction to create the WSOL associated token account
 */
const createAtaInstruction = await getCreateAssociatedTokenInstructionAsync({
  payer: wallet,
  mint: NATIVE_MINT,
  owner: wallet.address,
});

/**
 *  Create instruction to transfer SOL to the WSOL token account
 */
const transferSolInstruction = getTransferSolInstruction({
  source: wallet,
  destination: associatedTokenAddressWsol,
  amount: amountToSync,
});

/**
 *  Create instruction to sync native SOL balance with WSOL token balance
 */
const syncNativeInstruction = getSyncNativeInstruction({
  account: associatedTokenAddressWsol,
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
  (tx) => appendTransactionMessageInstructions([transferSolInstruction, syncNativeInstruction], tx) // Append instructions
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
const tokenAccountBefore = await fetchToken(rpc, associatedTokenAddressWsol);
console.log("\nWSOL Token balance before burn:", Number(tokenAccountBefore.data.amount / 10n ** 9n), "WSOL");
console.log("\nTrasnfer Signature:", transactionSignature);
