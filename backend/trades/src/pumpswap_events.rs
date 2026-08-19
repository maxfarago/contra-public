use anchor_lang::prelude::*;
use base64::Engine;
use solana_sdk::pubkey::Pubkey;

// event discriminators from IDL
pub const CREATE_POOL_EVENT_DISCRIMINATOR: [u8; 8] = [177, 49, 12, 210, 160, 118, 167, 116];
pub const BUY_EVENT_DISCRIMINATOR: [u8; 8] = [103, 244, 82, 31, 44, 245, 119, 119];
pub const SELL_EVENT_DISCRIMINATOR: [u8; 8] = [62, 47, 55, 10, 165, 3, 220, 42];

// create pool event structure from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct CreatePoolEvent {
    pub timestamp: i64,
    pub index: u16,
    pub creator: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_mint_decimals: u8,
    pub quote_mint_decimals: u8,
    pub base_amount_in: u64,
    pub quote_amount_in: u64,
    pub pool_base_amount: u64,
    pub pool_quote_amount: u64,
    pub minimum_liquidity: u64,
    pub initial_liquidity: u64,
    pub lp_token_amount_out: u64,
    pub pool_bump: u8,
    pub pool: Pubkey,
    pub lp_mint: Pubkey,
    pub user_base_token_account: Pubkey,
    pub user_quote_token_account: Pubkey,
    pub coin_creator: Pubkey,
}

// buy event structure from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct BuyEvent {
    pub timestamp: i64,
    pub base_amount_out: u64,           // tokens bought
    pub max_quote_amount_in: u64,       // max SOL willing to spend
    pub user_base_token_reserves: u64,  // user's token balance after
    pub user_quote_token_reserves: u64, // user's SOL balance after
    pub pool_base_token_reserves: u64,  // pool token reserves after trade
    pub pool_quote_token_reserves: u64, // pool SOL reserves after trade
    pub quote_amount_in: u64,           // actual SOL spent
    pub lp_fee_basis_points: u64,
    pub lp_fee: u64,
    pub protocol_fee_basis_points: u64,
    pub protocol_fee: u64,
    pub quote_amount_in_with_lp_fee: u64,
    pub user_quote_amount_in: u64, // SOL user actually paid
    pub pool: Pubkey,              // which pool
    pub user: Pubkey,              // who bought
    pub user_base_token_account: Pubkey,
    pub user_quote_token_account: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub protocol_fee_recipient_token_account: Pubkey,
    pub coin_creator: Pubkey,
    pub coin_creator_fee_basis_points: u64,
    pub coin_creator_fee: u64,
}

// sell event structure from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct SellEvent {
    pub timestamp: i64,
    pub base_amount_in: u64,            // tokens sold
    pub min_quote_amount_out: u64,      // min SOL expected
    pub user_base_token_reserves: u64,  // user's token balance after
    pub user_quote_token_reserves: u64, // user's SOL balance after
    pub pool_base_token_reserves: u64,  // pool token reserves after trade
    pub pool_quote_token_reserves: u64, // pool SOL reserves after trade
    pub quote_amount_out: u64,          // actual SOL received
    pub lp_fee_basis_points: u64,
    pub lp_fee: u64,
    pub protocol_fee_basis_points: u64,
    pub protocol_fee: u64,
    pub quote_amount_out_without_lp_fee: u64,
    pub user_quote_amount_out: u64, // SOL user actually received
    pub pool: Pubkey,               // which pool
    pub user: Pubkey,               // who sold
    pub user_base_token_account: Pubkey,
    pub user_quote_token_account: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub protocol_fee_recipient_token_account: Pubkey,
    pub coin_creator: Pubkey,
    pub coin_creator_fee_basis_points: u64,
    pub coin_creator_fee: u64,
}

// parse CreatePoolEvent (migration completed) from raw base64 encoded log data
pub fn parse_pumpswap_create_event(raw_data: &str) -> Option<CreatePoolEvent> {
    if !raw_data.starts_with("Program data:") {
        return None;
    }

    let event_data_b64 = raw_data.strip_prefix("Program data: ")?;
    match base64::engine::general_purpose::STANDARD.decode(event_data_b64) {
        Ok(decoded) => {
            if decoded.get(..8)? != CREATE_POOL_EVENT_DISCRIMINATOR {
                return None;
            }
            match CreatePoolEvent::deserialize(&mut &decoded[8..]) {
                Ok(event) => Some(event),
                Err(_) => None,
            }
        }
        Err(_) => None,
    }
}

// helper function to parse buy events from raw log data
pub fn parse_pumpswap_buy_event(raw_data: &str) -> Option<BuyEvent> {
    if !raw_data.starts_with("Program data:") {
        return None;
    }

    let event_data_b64 = raw_data.strip_prefix("Program data: ")?;

    match base64::engine::general_purpose::STANDARD.decode(event_data_b64) {
        Ok(decoded) => {
            if decoded.get(..8)? != BUY_EVENT_DISCRIMINATOR {
                return None;
            }
            match BuyEvent::deserialize(&mut &decoded[8..]) {
                Ok(event) => Some(event),
                Err(_) => None,
            }
        }
        Err(_) => None,
    }
}

// helper function to parse sell events from raw log data
pub fn parse_pumpswap_sell_event(raw_data: &str) -> Option<SellEvent> {
    if !raw_data.starts_with("Program data:") {
        return None;
    }

    let event_data_b64 = raw_data.strip_prefix("Program data: ")?;

    match base64::engine::general_purpose::STANDARD.decode(event_data_b64) {
        Ok(decoded) => {
            if decoded.get(..8)? != SELL_EVENT_DISCRIMINATOR {
                return None;
            }
            match SellEvent::deserialize(&mut &decoded[8..]) {
                Ok(event) => Some(event),
                Err(_) => None,
            }
        }
        Err(_) => None,
    }
}
