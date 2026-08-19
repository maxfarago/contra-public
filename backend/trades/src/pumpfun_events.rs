use anchor_lang::prelude::*;
use base64::Engine;
use solana_sdk::pubkey::Pubkey;

// event discriminators from IDL
pub const TRADE_EVENT_DISCRIMINATOR: [u8; 8] = [189, 219, 127, 211, 78, 230, 97, 238];
pub const COMPLETE_EVENT_DISCRIMINATOR: [u8; 8] = [213, 115, 204, 153, 18, 16, 241, 239];

// trade event structure (unified) from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub is_buy: bool,
    pub user: Pubkey,
    pub timestamp: i64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
}

// migration event structure from IDL
#[derive(AnchorDeserialize, Debug, Clone)]
pub struct CompleteEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub bonding_curve: Pubkey,
    pub timestamp: i64,
}

// helper function to parse trade events from raw log data
pub fn parse_pumpfun_trade_event(raw_data: &str) -> Option<TradeEvent> {
    // early exit if there is no event data prefix
    if !raw_data.starts_with("Program data: ") {
        return None;
    }

    // strip the prefix and decode the base64 log data
    let event_data_b64 = raw_data.strip_prefix("Program data: ").unwrap();
    match base64::engine::general_purpose::STANDARD.decode(event_data_b64) {
        Ok(decoded) => {
            if decoded.get(..8)? != TRADE_EVENT_DISCRIMINATOR {
                return None;
            }
            TradeEvent::deserialize(&mut &decoded[8..]).ok()
        }
        Err(_) => None,
    }
}

// helper function to parse complete events from raw log data
pub fn parse_pumpfun_complete_event(raw_data: &str) -> Option<CompleteEvent> {
    // early exit if there is no event data prefix
    if !raw_data.starts_with("Program data: ") {
        return None;
    }

    // strip the prefix and decode the base64 log data
    let event_data_b64 = raw_data.strip_prefix("Program data: ").unwrap();
    match base64::engine::general_purpose::STANDARD.decode(event_data_b64) {
        Ok(decoded) => {
            if decoded.get(..8)? != COMPLETE_EVENT_DISCRIMINATOR {
                return None;
            }
            CompleteEvent::deserialize(&mut &decoded[8..]).ok()
        }
        Err(_) => None,
    }
}
