import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import fs from "fs";
import path from "path";

/**
 * Loads a KeyPairSigner from a JSON file containing the keypair bytes.
 */
export async function loadSignerFromFile(file: string = "pri.json"): Promise<KeyPairSigner<string>> {
  const resolvedPath = path.resolve(`./src/wallet/id/${file}`);
  const loadedKeyBytes = Uint8Array.from(JSON.parse(fs.readFileSync(resolvedPath, "utf8")));

  // Here you can also set the second parameter to true in case you need to extract your private key.
  const keypairSigner = await createKeyPairSignerFromBytes(loadedKeyBytes);
  return keypairSigner;
}
