import { getCreateAccountInstruction } from "@solana-program/system";
import {
  extension,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
  getInitializeMintInstruction,
  getInitializeTransferFeeConfigInstruction,
  getMintSize,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
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
 *  Create transfer fee config extension
 */
const transferFeeConfigExtension = extension("TransferFeeConfig", {
  transferFeeConfigAuthority: authority.address,
  withdrawWithheldAuthority: authority.address,
  withheldAmount: 0n,
  newerTransferFee: {
    epoch: 0n,
    maximumFee: 1_000_000n,
    transferFeeBasisPoints: 150, // 1.5%
  },
  // Used for transitioning configs. Starts by being the same as newerTransferFee.
  olderTransferFee: {
    epoch: 0n,
    maximumFee: 1_000_000n,
    transferFeeBasisPoints: 150, // 1.5%
  },
});

/**
 *  Get mint account size with transfer fee extension
 */
const space = BigInt(getMintSize([transferFeeConfigExtension]));

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
 *  Instruction to initialize transfer fee config extension
 */
const initializeTransferFeeConfigInstruction = getInitializeTransferFeeConfigInstruction({
  mint: mint.address,
  transferFeeConfigAuthority: authority.address,
  withdrawWithheldAuthority: authority.address,
  transferFeeBasisPoints: 100, // 1% fee
  maximumFee: 1_000_000n, // Maximum fee of 1 token
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
 *  Create instruction to create the associated token account
 */
const createAtaInstruction = await getCreateAssociatedTokenInstructionAsync({
  payer: authority,
  mint: mint.address,
  owner: authority.address,
});

/**
 *  Use findAssociatedTokenPda to derive the ATA address
 */
const [authorityAssociatedTokenAddress] = await findAssociatedTokenPda({
  mint: mint.address,
  owner: authority.address,
  tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
});

const instructions = [createMintAccountInstruction, initializeTransferFeeConfigInstruction, initializeMintInstruction, createAtaInstruction];

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

// Create transaction message
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(authority, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions(instructions, tx)
);

// Sign transaction message with all required signers
const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

// This is the key step: re-apply the blockhash lifetime AFTER signing
// so that the final object has the correct narrow lifetimeConstraint type
const transactionToSend = {
  ...signedTransaction,
  lifetimeConstraint: latestBlockhash,
};

// Send and confirm transaction
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(transactionToSend, { commitment: "confirmed", skipPreflight: true });

// Get transaction signature
const transactionSignature = getSignatureFromTransaction(signedTransaction);

console.log("Mint Address with Transfer Fees:", mint.address.toString());
console.log("Token Account:", authorityAssociatedTokenAddress.toString());
console.log("Transfer Fee: 1.5% (150 basis points)");
console.log("Maximum Fee: 1 token");
console.log("Withdraw Authority:", authority.address.toString());
console.log("Transaction Signature:", transactionSignature);
