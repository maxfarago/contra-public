use anyhow::{anyhow, Result};
use aws_sdk_kms::primitives::Blob;
use aws_sdk_kms::Client as KmsClient;
use base64::{engine::general_purpose, Engine as _};
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, SeedDerivable, Signature},
    signer::Signer,
};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{error, info, warn};
use zeroize::Zeroize;

// a wrapper for a private key's bytes
pub struct HotWallet {
    pubkey: Pubkey,
    private_key_bytes: [u8; 32],
}

impl Drop for HotWallet {
    fn drop(&mut self) {
        self.private_key_bytes.zeroize();
    }
}

impl Signer for HotWallet {
    fn try_pubkey(&self) -> Result<Pubkey, solana_sdk::signer::SignerError> {
        Ok(self.pubkey)
    }
    fn try_sign_message(
        &self,
        message: &[u8],
    ) -> Result<Signature, solana_sdk::signer::SignerError> {
        // create an ephemeral keypair from the private key seed to sign the message
        let keypair = Keypair::from_seed(&self.private_key_bytes).map_err(|e| {
            solana_sdk::signer::SignerError::Custom(format!(
                "failed to create keypair from seed: {}",
                e
            ))
        })?;
        keypair.try_sign_message(message)
    }
    fn is_interactive(&self) -> bool {
        false
    }
}

// commands to manage the in-memory wallet cache
#[derive(Debug)]
pub enum WalletManagerCommand {
    PrepareSigner {
        wallet_pubkey: Pubkey,
        private_key_encrypted: String,
        reply_channel: oneshot::Sender<Result<()>>,
    },
    DestroySigner {
        wallet_pubkey: Pubkey,
    },
}

// handles preparing and destroying in-memory signers
pub async fn wallet_manager_loop(
    receiver: &mut mpsc::UnboundedReceiver<WalletManagerCommand>,
    signers: Arc<RwLock<HashMap<Pubkey, Arc<HotWallet>>>>,
    kms_client: KmsClient,
    kms_key_id: String,
) {
    info!("wallet manager loop started");
    while let Some(command) = receiver.recv().await {
        match command {
            WalletManagerCommand::PrepareSigner {
                wallet_pubkey,
                private_key_encrypted,
                reply_channel,
            } => {
                info!(pubkey = %wallet_pubkey, "received command to prepare signer");
                match decrypt_key(&kms_client, &kms_key_id, &private_key_encrypted).await {
                    Ok(decrypted_private_key_bytes) => {
                        // try to convert the decrypted bytes into a 32-byte array
                        if let Ok(private_key_bytes) =
                            TryInto::<[u8; 32]>::try_into(decrypted_private_key_bytes)
                        {
                            let hot_wallet = Arc::new(HotWallet {
                                pubkey: wallet_pubkey,
                                private_key_bytes,
                            });
                            let mut signers_map = signers.write().await;
                            signers_map.insert(wallet_pubkey, hot_wallet);
                            info!(pubkey = %wallet_pubkey, "successfully prepared and cached signer");
                            let _ = reply_channel.send(Ok(()));
                        } else {
                            let err_msg = "decrypted key was not 32 bytes long";
                            error!(pubkey = %wallet_pubkey, "{}", err_msg);
                            let _ = reply_channel.send(Err(anyhow!(err_msg)));
                        }
                    }
                    Err(e) => {
                        error!(pubkey = %wallet_pubkey, error = %e, "failed to decrypt private key with KMS");
                        let _ = reply_channel.send(Err(e));
                    }
                }
            }
            WalletManagerCommand::DestroySigner { wallet_pubkey } => {
                let mut signers_map = signers.write().await;
                if signers_map.remove(&wallet_pubkey).is_some() {
                    info!(pubkey = %wallet_pubkey, "successfully destroyed and removed signer from cache");
                } else {
                    warn!(pubkey = %wallet_pubkey, "could not find signer in cache to destroy");
                }
            }
        }
    }
}

// helper function to decrypt a private key using KMS
async fn decrypt_key(
    kms_client: &KmsClient,
    key_id: &str,
    encrypted_key_base64: &str,
) -> Result<Vec<u8>> {
    let encrypted_key_bytes = general_purpose::STANDARD.decode(encrypted_key_base64)?;
    let ciphertext_blob = Blob::new(encrypted_key_bytes);

    let response = kms_client
        .decrypt()
        .key_id(key_id)
        .ciphertext_blob(ciphertext_blob)
        .send()
        .await?;

    let plaintext_blob = response
        .plaintext
        .ok_or_else(|| anyhow!("KMS did not return a plaintext key"))?;

    Ok(plaintext_blob.into_inner())
}
