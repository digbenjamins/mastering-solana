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
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { getAddMemoInstruction } from "@solana-program/memo";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const sender = await loadSignerFromFile("sec.json"); // SecpqnoH2pRrPvZC8BEUykg94gVi53WB3uBJtiUzgY3
const receiver = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const mint = address(config.MINT2022);

/**
 *  Use findAssociatedTokenPda to derive the ATA address
 */
const [senderAssociatedTokenAddress] = await findAssociatedTokenPda({
  mint: mint,
  owner: sender.address,
  tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
});

/**
 *  Get the token account to transfer the tokens to
 */
const receiverTokenAccounts = await rpc
  .getTokenAccountsByOwner(
    receiver.address,
    {
      programId: TOKEN_2022_PROGRAM_ADDRESS,
    },
    {
      encoding: "jsonParsed",
    }
  )
  .send();
const receiverTokenAddress = receiverTokenAccounts.value.find((item) => item.account.data.parsed.info.mint === mint)?.pubkey;

/**
 *  Create instruction to transfer tokens
 */
const transferInstruction = getTransferCheckedInstruction({
  amount: tokensToRaw(100, 9), // 9 decimals
  source: senderAssociatedTokenAddress,
  destination: address(receiverTokenAddress as string),
  authority: sender.address,
  mint: mint,
  decimals: 9,
});

/**
 *  Create a memo instruction
 */
const memoInstruction = getAddMemoInstruction({
  memo: "Required Meme",
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
  (tx) => setTransactionMessageFeePayerSigner(sender, tx), // Set fee payer
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx), // Set transaction blockhash
  (tx) => appendTransactionMessageInstructions([memoInstruction, transferInstruction], tx) // Append instructions
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
console.log("\nTrasnfer Signature:", transactionSignature);
