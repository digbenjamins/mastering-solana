import {
  address,
  Address,
  airdropFactory,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  isOffCurveAddress,
  isSolanaError,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
} from "@solana/kit";
import { config } from "../config";
import { loadSignerFromFile } from "../wallet";
import { getCreateAccountInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { getBurnCheckedInstruction, getCloseAccountInstruction } from "@solana-program/token";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

/**
 *  Calculate the minimum balance for rent exemption
 */
const space = 0n; // bytes
const rentInLamports = await rpc.getMinimumBalanceForRentExemption(space).send();
console.log(`Minimum balance for rent exemption for ${space} bytes: ${Number(rentInLamports) / Number(config.LAMPORTS_PER_SOL)} lamports`);

/**
 * Create a new account instruction
 */
const newAccount = await generateKeyPairSigner();
const createAccountInstruction = getCreateAccountInstruction({
  payer: wallet,
  newAccount: newAccount,
  lamports: rentInLamports,
  programAddress: SYSTEM_PROGRAM_ADDRESS,
  space,
});

// const seeds = ["solana"];
// const [pda, bump] = await getProgramDerivedAddress({
//   programAddress: SYSTEM_PROGRAM_ADDRESS,
//   seeds,
// });
// console.log("PDA Off Curve: ", isOffCurveAddress(pda));
// console.log("Wallet Off Curve: ", isOffCurveAddress(newAccount.address));

/**
 *  Build the transaction
 */
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(wallet, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions([createAccountInstruction], tx) // Use new instruction
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
console.log("Transaction Signature for create account:", transactionSignature);
