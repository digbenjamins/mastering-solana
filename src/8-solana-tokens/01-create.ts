import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
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
import { getCreateAssociatedTokenInstructionAsync, getInitializeMintInstruction, getMintSize, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getCreateAccountInstruction } from "@solana-program/system";
import { config } from "../config";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC

/**
 *  Generate keypair to use as address of mint
 */
const mint = await generateKeyPairSigner();

/**
 *  Get default mint account size (in bytes), no extensions enabled
 */
const space = BigInt(getMintSize());

/**
 *  Instruction to create new account for mint (token program)
 *  Invokes the system program
 */
const createAccountInstruction = getCreateAccountInstruction({
  payer: wallet,
  newAccount: mint,
  lamports: await rpc.getMinimumBalanceForRentExemption(space).send(),
  space,
  programAddress: TOKEN_PROGRAM_ADDRESS,
});

/**
 *  Instruction to initialize mint account data
 *  Invokes the token program
 */
const initializeMintInstruction = getInitializeMintInstruction({
  mint: mint.address,
  decimals: 9,
  mintAuthority: wallet.address,
  freezeAuthority: wallet.address,
});

/**
 *  Create instruction to create the associated token account
 */
const createAtaInstruction = await getCreateAssociatedTokenInstructionAsync({
  payer: wallet,
  mint: mint.address,
  owner: wallet.address,
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
  (tx) => appendTransactionMessageInstructions([createAccountInstruction, initializeMintInstruction, createAtaInstruction], tx) // Append instructions
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
console.log("Mint Address:", mint.address);
console.log("\nTransaction Signature:", transactionSignature);
