import { Keypair } from '@solana/web3.js';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import bs58 from 'bs58';

const kmsKeyId = process.env.KMS_KEY_ID;
const kms = new KMSClient({ region: process.env.AWS_REGION });

/**
 * Generates a new Solana keypair, encrypts its seed with KMS,
 * and saves the public key and encrypted seed to the database for a given account.
 * This function is used for both initial creation and resets.
 * @param {object} fastify - The Fastify instance for logging.
 * @param {object} client - The database client.
 * @param {string} accountId - The ID of the account to associate the wallet with.
 * @returns {object} An object containing the publicKey and privateKey (bs58 encoded).
 */
export async function generateAndSaveWallet (fastify, client, accountId) {
  // generate keypair
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKey = keypair.secretKey; // 64-byte Uint8Array

  // encrypt and store only the 32-byte seed
  const privateKeySeed = privateKey.slice(0, 32);
  const secretKeyBuffer = Buffer.from(privateKeySeed);

  const encryptCommand = new EncryptCommand({ KeyId: kmsKeyId, Plaintext: secretKeyBuffer });
  const { CiphertextBlob } = await kms.send(encryptCommand);
  const encryptedSecretKey = Buffer.from(CiphertextBlob).toString('base64');

  // update account with new wallet
  await client.query(
    'UPDATE account SET public_key = $1, private_key_encrypted = $2, updated_at = NOW() WHERE id = $3',
    [publicKey, encryptedSecretKey, accountId]
  );

  fastify.log.info({ accountId, publicKey }, 'wallet created and saved');

  return {
    publicKey,
    privateKey: bs58.encode(privateKey) // return full key for user to save
  };
}
