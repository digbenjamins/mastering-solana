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
import { tokensToRaw } from "../functions";
import { config } from "../config";
import { findAssociatedTokenPda, getCreateAssociatedTokenInstructionAsync, getMintToInstruction, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const authority = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const recipient = await loadSignerFromFile("sec.json"); // SecpqnoH2pRrPvZC8BEUykg94gVi53WB3uBJtiUzgY3
const mint = address(config.MINT2022);

/**
 *  Use findAssociatedTokenPda to derive the ATA address
 */
const [recipientAssociatedTokenAddress] = await findAssociatedTokenPda({
  mint: mint,
  owner: recipient.address,
  tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
});

/**
 *  Create instruction for recipient's ATA
 */
const createRecipientAtaInstruction = await getCreateAssociatedTokenInstructionAsync({
  payer: authority,
  mint: mint,
  owner: recipient.address,
});

/**
 *  Create instruction to mint tokens
 */
const mintToInstruction = getMintToInstruction({
  mint: mint,
  token: recipientAssociatedTokenAddress,
  mintAuthority: authority.address,
  amount: tokensToRaw(1000, 9), // 9 decimals
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
  (tx) => setTransactionMessageFeePayerSigner(authority, tx), // Set fee payer
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx), // Set transaction blockhash
  (tx) => appendTransactionMessageInstructions([createRecipientAtaInstruction, mintToInstruction], tx) // Append instructions
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
console.log("\nTransaction Signature:", transactionSignature);
