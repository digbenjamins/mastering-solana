import { airdropFactory, createSolanaRpc, createSolanaRpcSubscriptions, generateKeyPairSigner, lamports } from "@solana/kit";
import { config } from "../config";
import { clusterApiUrl } from "@solana/web3.js";

const rpc = createSolanaRpc(config.RPC_HTTP); // clusterApiUrl("devnet")
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS); // clusterApiUrl("devnet").replace("https:", "wss:")

/**
 *  Connect using the network moniker
 *  You can also connect to a public RPC endpoint by specifying its network name (moniker):
 *  "mainnet", "devnet", or "testnet" moniker
 */

// Example: Get the current slot
async function getSlot() {
  const slot = await rpc.getSlot().send();
  console.log(`Current slot: ${slot}`);
}
getSlot();

/**
 * Airdrop some SOL to a newly created wallet
 */
const wallet = await generateKeyPairSigner();

const { value: solBefore } = await rpc.getBalance(wallet.address).send();
console.log(`Balance ${wallet.address}: ${solBefore / config.LAMPORTS_PER_SOL} SOL.`);

const airdrop = await airdropFactory({ rpc, rpcSubscriptions })({
  recipientAddress: wallet.address,
  lamports: lamports(config.LAMPORTS_PER_SOL * 10n),
  commitment: "confirmed",
});
console.log(`Airdrop Transaction: ${airdrop}`);

const { value: solAfter } = await rpc.getBalance(wallet.address).send();
console.log(`Balance ${wallet.address}: ${solAfter / config.LAMPORTS_PER_SOL} SOL.`);
