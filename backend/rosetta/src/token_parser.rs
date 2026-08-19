use crate::{pumpfun, pumpswap};
use anchor_lang::AnchorDeserialize;
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use commons::types::TokenContext;
use solana_sdk::pubkey::Pubkey;
use solana_transaction_status::{
    option_serializer::OptionSerializer, EncodedConfirmedTransactionWithStatusMeta,
    EncodedTransaction, UiMessage, UiTransactionTokenBalance,
};
use std::str::FromStr;
use tracing::{debug, warn};

#[derive(Debug, Clone, PartialEq)]
pub enum MarketIdentifier {
    Mint(Pubkey), // For pump.fun
    Pool(Pubkey), // For pumpswap
}

/// Parses transaction logs to extract all market identifiers (mints or pools).
/// This is a robust parser that decodes the base64 event data.
pub fn extract_market_identifiers(logs: &[String]) -> Vec<MarketIdentifier> {
    let mut identifiers = Vec::new();

    for log in logs {
        if !log.starts_with("Program data: ") {
            continue;
        }

        let Some(event_data_b64) = log.strip_prefix("Program data: ") else {
            continue;
        };

        let Ok(decoded) = general_purpose::STANDARD.decode(event_data_b64) else {
            continue;
        };

        if decoded.len() < 8 {
            continue;
        }

        let Ok(discriminator) = TryInto::<[u8; 8]>::try_into(&decoded[..8]) else {
            continue;
        };
        let event_data = &decoded[8..];

        match discriminator {
            pumpfun::TRADE_EVENT_DISCRIMINATOR => {
                if let Ok(event) = pumpfun::TradeEvent::deserialize(&mut &event_data[..]) {
                    identifiers.push(MarketIdentifier::Mint(event.mint));
                }
            }
            pumpswap::BUY_EVENT_DISCRIMINATOR => {
                if let Ok(event) = pumpswap::BuyEvent::deserialize(&mut &event_data[..]) {
                    identifiers.push(MarketIdentifier::Pool(event.pool));
                }
            }
            pumpswap::SELL_EVENT_DISCRIMINATOR => {
                if let Ok(event) = pumpswap::SellEvent::deserialize(&mut &event_data[..]) {
                    identifiers.push(MarketIdentifier::Pool(event.pool));
                }
            }
            pumpswap::CREATE_POOL_EVENT_DISCRIMINATOR => {
                if let Ok(event) = pumpswap::CreatePoolEvent::deserialize(&mut &event_data[..]) {
                    identifiers.push(MarketIdentifier::Pool(event.pool));
                }
            }
            _ => {}
        }
    }

    identifiers
}

// helper to parse balance changes from a confirmed transaction
pub fn parse_balance_changes(
    tx: EncodedConfirmedTransactionWithStatusMeta,
    wallet_pubkey: &Pubkey,
    token_context: &TokenContext,
) -> Result<(i64, i64)> {
    let meta = tx
        .transaction
        .meta
        .ok_or_else(|| anyhow!("transaction metadata not found in rpc response"))?;

    let account_keys: Vec<Pubkey> = match tx.transaction.transaction {
        EncodedTransaction::Json(parsed_tx) => match parsed_tx.message {
            UiMessage::Parsed(parsed_msg) => parsed_msg
                .account_keys
                .iter()
                .map(|key| Pubkey::from_str(&key.pubkey))
                .collect::<Result<Vec<_>, _>>()?,
            UiMessage::Raw(raw_msg) => raw_msg
                .account_keys
                .iter()
                .map(|key_str| Pubkey::from_str(key_str))
                .collect::<Result<Vec<_>, _>>()?,
        },
        _ => {
            return Err(anyhow!(
                "expected a JsonParsed transaction but received a different variant"
            ));
        }
    };

    // 1. find sol balance change from the protocol's liquidity account
    let sol_change = if !token_context.is_migrated {
        // for pump.fun, the bonding curve PDA holds native SOL
        let protocol_account_key = token_context.bonding_curve;
        if let Some(protocol_key_index) = account_keys
            .iter()
            .position(|key| key == &protocol_account_key)
        {
            let pre_sol = meta.pre_balances[protocol_key_index];
            let post_sol = meta.post_balances[protocol_key_index];
            debug!(protocol_account = %protocol_account_key, pre_sol = pre_sol, post_sol = post_sol, "found pump.fun SOL balances");
            let protocol_sol_delta = post_sol as i64 - pre_sol as i64;
            -protocol_sol_delta
        } else {
            warn!(protocol_account = %protocol_account_key, "pump.fun bonding curve not found in transaction; cannot determine SOL change");
            0i64
        }
    } else {
        // for pumpswap, the pool's quote token account holds wSOL
        let pool_quote_account = token_context.pool_quote_token_account.ok_or_else(|| {
            anyhow!("pumpswap pool quote token account not found in token context")
        })?;

        // 1. find the index of the pool's quote token account in the transaction's account keys
        let Some(pool_quote_account_index) = account_keys
            .iter()
            .position(|key| key == &pool_quote_account)
        else {
            warn!(pool_quote_account = %pool_quote_account, "pumpswap pool quote account not found in transaction; cannot determine SOL change");
            return Ok((0, 0)); // or handle as an error
        };

        // 2. define a helper to find the wsol balance for that account index
        let find_wsol_balance =
            |balances: &OptionSerializer<Vec<UiTransactionTokenBalance>>| -> u64 {
                if let OptionSerializer::Some(bals) = balances {
                    bals.iter()
                        .find(|tb| tb.account_index == pool_quote_account_index as u8)
                        .and_then(|tb| tb.ui_token_amount.amount.parse::<u64>().ok())
                        .unwrap_or(0)
                } else {
                    0
                }
            };

        // 3. get pre and post balances and calculate the delta
        let pre_wsol = find_wsol_balance(&meta.pre_token_balances);
        let post_wsol = find_wsol_balance(&meta.post_token_balances);
        debug!(protocol_account = %pool_quote_account, pre_wsol = pre_wsol, post_wsol = post_wsol, "found pumpswap wSOL balances");
        let protocol_wsol_delta = post_wsol as i64 - pre_wsol as i64;
        -protocol_wsol_delta
    };

    // 2. find token balance change from the user's token account (this logic is unchanged)
    let wallet_pubkey_str = wallet_pubkey.to_string();
    let token_mint_str = token_context.token_mint.to_string();

    let pre_token_balance =
        if let OptionSerializer::Some(balances) = meta.pre_token_balances.as_ref() {
            if let Some(tb) = balances.iter().find(|tb| {
                if let OptionSerializer::Some(owner) = &tb.owner {
                    tb.mint == token_mint_str && owner == &wallet_pubkey_str
                } else {
                    false
                }
            }) {
                tb.ui_token_amount.amount.parse::<u64>().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

    let post_token_balance =
        if let OptionSerializer::Some(balances) = meta.post_token_balances.as_ref() {
            if let Some(tb) = balances.iter().find(|tb| {
                if let OptionSerializer::Some(owner) = &tb.owner {
                    tb.mint == token_mint_str && owner == &wallet_pubkey_str
                } else {
                    false
                }
            }) {
                tb.ui_token_amount.amount.parse::<u64>().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

    debug!(wallet = %wallet_pubkey, token_mint = %token_mint_str, pre_token_balance = pre_token_balance, post_token_balance = post_token_balance, "found token balances");

    let token_change = post_token_balance as i64 - pre_token_balance as i64;

    Ok((sol_change, token_change))
}
