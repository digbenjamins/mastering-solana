import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  getInitializeMintInstruction,
  getMintSize,
  TOKEN_2022_PROGRAM_ADDRESS,
  extension,
  getTokenSize,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
  getEnableMemoTransfersInstruction,
  getInitializeAccountInstruction,
  getMintToInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token-2022";
import { loadSignerFromFile } from "../wallet";

// Create Connection, local validator in this example
const rpc = createSolanaRpc("http://localhost:8899");
const rpcSubscriptions = createSolanaRpcSubscriptions("ws://localhost:8900");
const authority = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC

/**
 *  Generate keypair to use as address of mint
 */
const mint = await generateKeyPairSigner();

/**
 *  Get mint account size (default)
 */
const space = BigInt(getMintSize());

/**
 *  Instruction to create new account for mint (token program)
 *  Invokes the system program
 */
const createMintAccountInstruction = getCreateAccountInstruction({
  payer: authority,
  newAccount: mint,
  lamports: await rpc.getMinimumBalanceForRentExemption(space).send(),
  space,
  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
});

/**
 *  Instruction to initialize mint account data
 *  Invokes the token22 program
 */
const initializeMintInstruction = getInitializeMintInstruction({
  mint: mint.address,
  decimals: 9,
  mintAuthority: authority.address,
  freezeAuthority: authority.address,
});

/**
 *  Generate keypair to use as address of token account
 */
const tokenAccount = await generateKeyPairSigner();

/**
 *  Memo transfer extension.
 */
const memoTransferExtension = extension("MemoTransfer", {
  requireIncomingTransferMemos: true,
});

/**
 *  Get token account size with extension enabled
 */
const tokenAccountLen = BigInt(getTokenSize([memoTransferExtension]));

/**
 *  Instruction to create new account for the token account
 *  Invokes the system program
 */
const createTokenAccountInstruction = getCreateAccountInstruction({
  payer: authority,
  newAccount: tokenAccount,
  lamports: await rpc.getMinimumBalanceForRentExemption(tokenAccountLen).send(),
  space: tokenAccountLen,
  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
});

/**
 *  Instruction to initialize the created token account
 */
const initializeTokenAccountInstruction = getInitializeAccountInstruction({
  account: tokenAccount.address,
  mint: mint.address,
  owner: authority.address,
});

/**
 *  create instruction to enable the MemoTransferExtension
 */
const enableMemoTransferExtensionInstruction = getEnableMemoTransfersInstruction({
  token: tokenAccount.address,
  owner: authority,
});

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

/**
 *  Create transaction message
 */
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(authority, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) =>
    appendTransactionMessageInstructions(
      [
        createMintAccountInstruction,
        initializeMintInstruction,
        createTokenAccountInstruction,
        initializeTokenAccountInstruction,
        enableMemoTransferExtensionInstruction,
      ],
      tx
    )
);

/**
 *  Sign transaction message with all required signers
 */
const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

// This is the key step: re-apply the blockhash lifetime AFTER signing
// so that the final object has the correct narrow lifetimeConstraint type
const transactionToSend = {
  ...signedTransaction,
  lifetimeConstraint: latestBlockhash,
};

/**
 *  Send and confirm transaction
 */
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(transactionToSend, { commitment: "confirmed", skipPreflight: true });
const transactionSignature = getSignatureFromTransaction(signedTransaction);

console.log("Mint Address:", mint.address.toString());
console.log("Token account with extension:", tokenAccount.address);
console.log("Transaction Signature:", transactionSignature);
