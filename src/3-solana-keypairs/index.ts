import {
  address,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase58Encoder,
  getUtf8Encoder,
  signBytes,
  verifySignature,
  isOffCurveAddress,
} from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { webcrypto } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { config } from "../config";

/**
 *  Create a Random Solana signer keypair
 */
const randomSigner = await generateKeyPairSigner();
//console.log(`🔑 Random Keypair Address: ${randomSigner.address}`, randomSigner);

/**
 *  If you have an existing secret key, you can restore your Keypair from it.
 *  This allows you to access your wallet and sign transactions in your dApp.
 */
const keypairBytes = new Uint8Array([
  221, 49, 0, 64, 223, 163, 10, 178, 158, 97, 155, 241, 118, 47, 106, 122, 103, 221, 77, 44, 249, 106, 21, 94, 54, 115, 223, 135, 78, 62, 122, 47, 152, 1, 254,
  223, 199, 199, 155, 61, 84, 25, 121, 112, 77, 95, 139, 202, 96, 173, 241, 198, 41, 50, 93, 36, 59, 226, 218, 252, 151, 69, 4, 68,
]);
const restoredSigner = await createKeyPairSignerFromBytes(keypairBytes);
console.log(`🔐 Restored Keypair Address from Uint8Array: ${restoredSigner.address}`, restoredSigner);

const keypairBase58 = "5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG";
const restoredSigner58 = await createKeyPairSignerFromBytes(getBase58Encoder().encode(keypairBase58));
//console.log(`🔐 Restored Keypair Address from Base58: ${restoredSigner58.address}`, restoredSigner58);

/**
 *  If you are given a keypair, you can verify if the secret matches the given public key
 */
const primaryWalletPublicKey = address(config.WALLET_PUBLIC_KEY);
//console.log("✅ Valid Public Key:", restoredSigner.address === primaryWalletPublicKey);

/**
 *  In certain special cases (e.g. a Program Derived Address), public keys may not have a private key associated with them.
 *  You can check this by looking to see if the public key lies on the ed25519 curve.
 *  Only public keys that lie on the curve can be controlled by users with wallets.
 */
const primaryWalletPubKey = new PublicKey(config.WALLET_PUBLIC_KEY);
const primaryWalletAddress = address(config.WALLET_PUBLIC_KEY);
//console.log("On Curve:", PublicKey.isOnCurve(primaryWalletPubKey.toBytes()));
//console.log("Off Curve:", isOffCurveAddress(primaryWalletAddress));

/**
 *  The primary function of a keypair is to sign messages, transactions and enable verification of the signature.
 *  Verification of a signature allows the recipient to be sure that the data was signed by the owner of a specific private key.
 */
const message = getUtf8Encoder().encode("Hello, Solana World!");
const signedBytes = await signBytes(restoredSigner.keyPair.privateKey, message);
const decoded = getBase58Decoder().decode(signedBytes);

// console.log("📃 Encoded Message: ", message);
// console.log("🔑 Signed Message: ", signedBytes);
// console.log("🔐 Decoded Message (Signature): ", decoded);

const verified = await verifySignature(restoredSigner.keyPair.publicKey, signedBytes, message);
//console.log("✅ Verified:", verified);

/**
 * *  Finally, if you want to generate a Solana keypair in a more manual way,
 * you can do so by generating a 32-byte seed and using the TweetNaCl library to create the keypair.
 */
async function generateSolanaKey() {
  // Generate a 32-byte seed using webcrypto
  const seed = new Uint8Array(32);
  const crypto = webcrypto.getRandomValues(seed);

  // Use TweetNaCl to generate key pair from seed
  const keyPair = nacl.sign.keyPair.fromSeed(crypto);

  // Convert to Base58 and keypairBytes
  const privateKeyBase58 = bs58.encode(keyPair.secretKey);
  console.log("Private Key (keypairBytes):", keyPair.secretKey);
  console.log("Private Key (Base58):", privateKeyBase58);
}

generateSolanaKey();
