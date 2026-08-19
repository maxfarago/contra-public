# Mayhem Mode Implementation Plan

## Overview

Implement support for mayhem mode tokens by detecting `is_mayhem_mode` from on-chain accounts, propagating this state through the system, and using the mayhem fee recipient when building trade instructions.

## Changes Required

### 1. Update Chain Data Structures

**File**: `commons/src/chain.rs`

- Add `is_mayhem_mode: bool` field to `BondingCurve` struct (after `creator` field)
- Add `is_mayhem_mode: bool` field to `Pool` struct (after `coin_creator` field)
- Add `reserved_fee_recipient: Pubkey` and `mayhem_mode_enabled: bool` fields to `Global` struct (at the end)
- Create new `GlobalConfig` struct for PumpSwap with fields:
- `admin: Pubkey`
- `lp_fee_basis_points: u64`
- `protocol_fee_basis_points: u64`
- `disable_flags: u8`
- `protocol_fee_recipients: [Pubkey; 8]`
- `coin_creator_fee_basis_points: u64`
- `admin_set_coin_creator_authority: Pubkey`
- `whitelist_pda: Pubkey`
- `reserved_fee_recipient: Pubkey`
- `mayhem_mode_enabled: bool`

### 2. Add `is_mayhem` to TokenContext

**File**: `commons/src/types.rs`

- Add `pub is_mayhem: bool` field to `TokenContext` struct (after `is_migrated` field)

### 3. Update Protocol Detection Logic

**File**: `trades/src/protocol_detector.rs`

- In `detect_token_protocol`, when bonding curve account is found:
- Deserialize `BondingCurve` to get `is_mayhem_mode` field
- If `is_mayhem_mode == false`: set `is_migrated: false, is_mayhem: false` (existing pump.fun behavior)
- If `is_mayhem_mode == true`: set `is_migrated: false, is_mayhem: true` (mayhem mode)
- When pool account is found: set `is_mayhem: false` (pools are post-migration, mayhem only applies to bonding curves)

### 4. Add `is_mayhem` to ExecutionOrder

**File**: `commons/src/contracts.rs`

- Add `pub is_mayhem: bool` field to `ExecutionOrder` struct (after `protocol` field or in protocol-specific section)

### 5. Propagate `is_mayhem` in Trade Implementations

**Files**:

- `trades/src/examples/oneshot/buy.rs`
- `trades/src/examples/oneshot/sell.rs`
- `trades/src/examples/countersell/execute.rs`

- In `OneShotBuy::activate()`: Read `is_mayhem` from `token_context` and include it in `ExecutionOrder` creation
- In `OneShotSell::activate()`: Read `is_mayhem` from `token_context` and include it in `ExecutionOrder` creation
- In `Countersell::write_countersell_warrant()`: Read `is_mayhem` from `token_context` and include it in `ExecutionOrder` creation

### 6. Update PumpFun Instruction Building

**File**: `guillotine/src/protocols/pumpfun.rs`

- In `build_pumpfun_instructions()`:
- Fetch `Global` account if not cached (or use cached `global_state` from `ExecutionOrder`)
- When `command.is_mayhem == true`:
- Use `global_state.reserved_fee_recipient` instead of `global_state.fee_recipient` for the 2nd account (index 1) in both BUY and SELL trade instructions
- When `command.is_mayhem == false`: Use existing `global_state.fee_recipient` (no change)

### 7. Update PumpSwap Instruction Building

**File**: `guillotine/src/protocols/pumpswap.rs`

- In `build_pumpswap_instructions()`:
- Fetch `GlobalConfig` account (PDA: `["global_config"]` seeds, address: `ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw`)
- Deserialize `GlobalConfig` to get `reserved_fee_recipient`
- When `command.is_mayhem == true`:
- Use `reserved_fee_recipient` for the 10th account (index 9) in trade instruction
- Derive WSOL token account of `reserved_fee_recipient` using `get_ata(&reserved_fee_recipient, &wsol_mint)`
- Use this WSOL token account for the 11th account (index 10) in trade instruction
- When `command.is_mayhem == false`: Use existing `protocol_fee_recipient` logic (no change)

### 8. Update Shylock Cache (if needed)

**File**: `shylock/src/lib.rs`

- Update `fetch_and_build_cache_entry()` to handle `GlobalConfig` deserialization when fetching PumpSwap data
- Ensure `GlobalConfig` is cached or fetched when needed for mayhem mode detection

## Implementation Notes

- The mayhem fee recipient is: `GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS` (from docs)
- `reserved_fee_recipient` may be `Pubkey::default()` initially; check if it's set before using it
- WSOL mint is already defined as `WSOL_MINT` constant in `pumpswap.rs`
- Account indices are 0-based in Rust vectors, so "2nd account" = index 1, "10th account" = index 9, "11th account" = index 10

## Testing Considerations

- Test with tokens that have `is_mayhem_mode = false` (should work as before)
- Test with tokens that have `is_mayhem_mode = true` (should use mayhem fee recipient)
- Verify fee recipient accounts are correctly set in instruction account lists
- Ensure backward compatibility with existing tokens

## Implementation Order

1. Update chain data structures first (needed for deserialization)
2. Add fields to TokenContext and ExecutionOrder
3. Update protocol detector to populate is_mayhem
4. Update trade implementations to propagate is_mayhem
5. Update instruction builders to use mayhem fee recipient