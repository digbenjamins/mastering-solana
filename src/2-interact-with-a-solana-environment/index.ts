import { createSolanaRpc, createSolanaRpcSubscriptions, lamports } from "@solana/kit";
import { config } from "../config";
import { loadSignerFromFile } from "../wallet";

const rpc = createSolanaRpc(config.RPC_HTTP);
const rpcSubscriptions = createSolanaRpcSubscriptions(config.RPC_WS);
const wallet = await loadSignerFromFile(); // Pri2XH96RyGPjJraPTHPiaikRp73KDxmMJvg7kKnsqC

/**
 *  The AbortController lets you stop the WebSocket subscription later.
 *  You’ll pass the .signal to the subscription to allow clean termination.
 */
const abortController = new AbortController();

/**
 *  Opens a WebSocket subscription that listens for account changes on the wallet.
 */
const notifications = await rpcSubscriptions
  .accountNotifications(wallet.address, { commitment: "confirmed" })
  .subscribe({ abortSignal: abortController.signal });

/**
 *  Asynchronously Listen for Notifications
 */
(async () => {
  for await (const notification of notifications) {
    console.log(`📢 Websocket Notification:`, notification);
    console.log(`✅ Lamports Balance: ${Number(notification.value.lamports / config.LAMPORTS_PER_SOL)} SOL`);
    abortController.abort();
  }
})();

/**
 * Request Airdrop and Wait for Confirmation
 */
const airdropSignature = await rpc.requestAirdrop(wallet.address, lamports(config.LAMPORTS_PER_SOL * 10n)).send();

/**
 *  Wait for Confirmation
 */
while (true) {
  const status = await rpc.getSignatureStatuses([airdropSignature]).send();
  const confirmationStatus = status.value?.[0]?.confirmationStatus;
  if (confirmationStatus === "confirmed") {
    console.log("☔ Airdrop Status:", confirmationStatus);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
