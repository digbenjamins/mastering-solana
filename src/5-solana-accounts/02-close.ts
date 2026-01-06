import {
  address,
  airdropFactory,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
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
import { getBurnCheckedInstruction, getCloseAccountInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC
const tokenAccountToClose = address("3XWhD5SaUeXnSTMiBjvxpGv8nifrDVJeNPbNviLfpksb"); // Token account to be closed
const mintAddress = address("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"); // Mint address of RAY token

/**
 *  Get the latest blockhash to include in the transaction
 */
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

/**
 *  Get account balance after creation
 */
const { value } = await rpc
  .getAccountInfo(tokenAccountToClose, {
    encoding: "jsonParsed",
  })
  .send();
const solBalance = value ? Number(value.lamports) / Number(config.LAMPORTS_PER_SOL) : 0;
console.log(`Account Info: `, value, `\nSOL Balance: ${solBalance} SOL`);

/**
 *  Get the token account to transfer the tokens to
 */
const receiverTokenAccounts = await rpc
  .getTokenAccountsByOwner(
    wallet.address,
    {
      programId: TOKEN_PROGRAM_ADDRESS,
    },
    {
      encoding: "jsonParsed",
    }
  )
  .send();
console.log("Receiver Token Accounts: ", receiverTokenAccounts);

/**
 * Verify that the token account to be closed belongs to the wallet
 */
const receiverTokenAddress = receiverTokenAccounts.value.find((item) => item.account.data.parsed.info.mint === mintAddress);
console.log("Verified Token Address: ", receiverTokenAddress?.pubkey === tokenAccountToClose ? "✅ Verified" : "❌ Not Verified");

/**
 *  Get the amount and decimals of tokens in the account to be closed
 */
const tokenAmount = receiverTokenAddress?.account.data.parsed.info.tokenAmount.amount ?? 0n;
const tokenDecimals = receiverTokenAddress?.account.data.parsed.info.tokenAmount.decimals ?? 6;

/**
 *  Create instruction to close the token account
 */
const closeAccountInstruction = getCloseAccountInstruction({
  account: tokenAccountToClose,
  destination: wallet.address,
  owner: wallet,
});

/**
 * Create instruction to burn tokens from the token account before closing
 */
const burnInstruction = getBurnCheckedInstruction({
  account: tokenAccountToClose,
  mint: address("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"),
  authority: wallet.address,
  amount: BigInt(tokenAmount), // 200.0 tokens with 6 decimals
  decimals: tokenDecimals,
});

/**
 *  Build the transaction
 */
const transactionCloseMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(wallet, tx),
  (tx) =>
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      tx
    ),
  (tx) => appendTransactionMessageInstructions([burnInstruction, closeAccountInstruction], tx) // Use new instruction
);

/**
 * Sign  transaction
 */
const signedCloseTransaction = await signTransactionMessageWithSigners(transactionCloseMessage);

// This is the key step: re-apply the blockhash lifetime AFTER signing
// so that the final object has the correct narrow lifetimeConstraint type
const closingTransactionToSend = {
  ...signedCloseTransaction,
  lifetimeConstraint: latestBlockhash,
};

try {
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(closingTransactionToSend, { commitment: "confirmed" });
} catch (e) {
  if (isSolanaError(e, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
    console.error("This transaction depends on a blockhash that has expired");
  } else {
    throw e;
  }
}
