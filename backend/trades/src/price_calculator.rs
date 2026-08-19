use tracing::debug;

// ===================================
// -----       PUMP.FUN        -----
// ===================================

pub fn tokens_for_sol_pumpfun_buy(
    sol_in: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
) -> u64 {
    // CPMM formula: Δx = (v_x × Δy) / (v_y + Δy)
    let v_x = virtual_token_reserves as u128;
    let v_y = virtual_sol_reserves as u128;
    let delta_y = sol_in as u128;

    // prevent division by zero
    if v_y == 0 || delta_y == 0 {
        return 0;
    }

    let numerator = v_x * delta_y;
    let denominator = v_y + delta_y;

    // prevent division by zero
    if denominator == 0 {
        return 0;
    }

    let tokens_out = (numerator / denominator) as u64;

    debug!(
        protocol = "pump.fun",
        sol_in = sol_in,
        calculated_tokens_out = tokens_out,
        sol_reserves = virtual_sol_reserves,
        token_reserves = virtual_token_reserves,
        "calculated tokens for sol amount (buy)"
    );

    tokens_out
}

pub fn sol_for_tokens_pumpfun_buy(
    tokens_out: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
) -> u64 {
    // Δy = (v_y * Δx) / (v_x − Δx)
    let dx = tokens_out as u128;
    let vx = virtual_token_reserves as u128;
    let vy = virtual_sol_reserves as u128;

    if dx == 0 || vx == 0 || vy == 0 || dx >= vx {
        return u64::MAX; // insufficient liquidity
    }

    let numerator = vy * dx;
    let denominator = vx - dx;
    let sol_in = (numerator / denominator) as u64;

    debug!(
        protocol = "pump.fun",
        tokens_out = tokens_out,
        calculated_sol_in = sol_in,
        sol_reserves = virtual_sol_reserves,
        token_reserves = virtual_token_reserves,
        "calculated sol required for token amount (buy)"
    );

    sol_in
}

pub fn tokens_for_sol_pumpfun_sell(
    sol_out: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
) -> u64 {
    // Δx = (v_x × Δy) / (v_y + Δy)
    let v_x = virtual_token_reserves as u128;
    let v_y = virtual_sol_reserves as u128;
    let delta_y = sol_out as u128;

    if v_y == 0 || delta_y == 0 {
        return 0;
    }

    let numerator = v_x * delta_y;
    let denominator = v_y - delta_y;

    // prevent division by zero
    if denominator == 0 {
        return 0;
    }

    let tokens_in = (numerator / denominator) as u64;

    debug!(
        protocol = "pump.fun",
        sol_out = sol_out,
        calculated_tokens_needed = tokens_in,
        sol_reserves = virtual_sol_reserves,
        token_reserves = virtual_token_reserves,
        "calculated tokens needed for sol amount (sell)"
    );

    tokens_in
}

pub fn sol_for_tokens_pumpfun_sell(
    tokens_in: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
) -> u64 {
    // Δsol = (v_y * Δtokens) / (v_x + Δtokens)
    let v_x = virtual_token_reserves as u128;
    let v_y = virtual_sol_reserves as u128;
    let delta_x = tokens_in as u128;

    if v_x == 0 || v_y == 0 || delta_x == 0 {
        return 0;
    }

    let denominator = v_x.saturating_add(delta_x);
    if denominator == 0 {
        return 0;
    }

    let numerator = v_y.saturating_mul(delta_x);
    let sol_out = numerator / denominator;

    debug!(
        protocol = "pump.fun",
        tokens_in = tokens_in,
        calculated_sol_out = sol_out,
        sol_reserves = virtual_sol_reserves,
        token_reserves = virtual_token_reserves,
        "calculated sol for token amount (sell)"
    );

    sol_out as u64
}

// calculates market cap in lamports for a pump.fun bonding curve
pub fn market_cap_pumpfun(
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    mint_supply: u64,
) -> u128 {
    if virtual_token_reserves == 0 {
        return 0;
    }
    // market cap = (SOL reserves * total supply) / token reserves
    (virtual_sol_reserves as u128 * mint_supply as u128) / virtual_token_reserves as u128
}

// ===================================
// -----        PUMPSWAP         -----
// ===================================

pub fn tokens_for_sol_pumpswap_buy(
    sol_in: u64,
    pool_sol_reserves: u64,
    pool_token_reserves: u64,
) -> u64 {
    // Δx = (x × Δy) / (y + Δy)
    let sol_in_u128 = sol_in as u128;
    let pool_sol_reserves_u128 = pool_sol_reserves as u128;
    let pool_token_reserves_u128 = pool_token_reserves as u128;

    if pool_sol_reserves_u128 == 0 || sol_in_u128 == 0 {
        return 0;
    }

    let numerator = pool_token_reserves_u128 * sol_in_u128;
    let denominator = pool_sol_reserves_u128 + sol_in_u128;

    let tokens_out = (numerator / denominator) as u64;

    debug!(
        protocol = "pumpswap",
        sol_in = sol_in,
        calculated_tokens_out = tokens_out,
        sol_reserves = pool_sol_reserves,
        token_reserves = pool_token_reserves,
        "calculated tokens for sol amount (buy)"
    );

    tokens_out
}

pub fn sol_for_tokens_pumpswap_buy(
    tokens_out: u64,
    pool_sol_reserves: u64,
    pool_token_reserves: u64,
) -> u64 {
    // Δy = (y * Δx) / (x − Δx)
    let dx = tokens_out as u128;
    let x = pool_token_reserves as u128;
    let y = pool_sol_reserves as u128;

    if dx == 0 || x == 0 || y == 0 || dx >= x {
        return u64::MAX; // insufficient liquidity
    }

    let numerator = y * dx;
    let denominator = x - dx;
    let sol_in = (numerator / denominator) as u64;

    debug!(
        protocol = "pumpswap",
        tokens_out = tokens_out,
        calculated_sol_in = sol_in,
        sol_reserves = pool_sol_reserves,
        token_reserves = pool_token_reserves,
        "calculated sol required for token amount (buy)"
    );

    sol_in
}

pub fn tokens_for_sol_pumpswap_sell(
    sol_out: u64,
    pool_sol_reserves: u64,
    pool_token_reserves: u64,
) -> u64 {
    // Δx = (x × Δy) / (y - Δy)
    let sol_out_u128 = sol_out as u128;
    let pool_sol_reserves_u128 = pool_sol_reserves as u128;
    let pool_token_reserves_u128 = pool_token_reserves as u128;

    if pool_sol_reserves_u128 <= sol_out_u128 {
        // not enough liquidity in the pool
        return u64::MAX;
    }

    let numerator = pool_token_reserves_u128 * sol_out_u128;
    let denominator = pool_sol_reserves_u128 - sol_out_u128;

    if denominator == 0 {
        return 0;
    }

    let tokens_in = (numerator / denominator) as u64;

    debug!(
        protocol = "pumpswap",
        sol_out = sol_out,
        calculated_tokens_in = tokens_in,
        sol_reserves = pool_sol_reserves,
        token_reserves = pool_token_reserves,
        "calculated tokens for sol amount (sell)"
    );

    tokens_in
}

pub fn sol_for_tokens_pumpswap_sell(
    tokens_in: u64,
    pool_sol_reserves: u64,
    pool_token_reserves: u64,
) -> u64 {
    // Δy = (y × Δx) / (x + Δx)
    let tokens_in_u128 = tokens_in as u128;
    let pool_sol_reserves_u128 = pool_sol_reserves as u128;
    let pool_token_reserves_u128 = pool_token_reserves as u128;

    if pool_token_reserves_u128 == 0 || tokens_in_u128 == 0 {
        return 0;
    }

    let numerator = pool_sol_reserves_u128 * tokens_in_u128;
    let denominator = pool_token_reserves_u128 + tokens_in_u128;

    let sol_out = (numerator / denominator) as u64;

    debug!(
        protocol = "pumpswap",
        tokens_in = tokens_in,
        calculated_sol_out = sol_out,
        sol_reserves = pool_sol_reserves,
        token_reserves = pool_token_reserves,
        "calculated sol for token amount (sell)"
    );

    sol_out
}

// helper function to calculate market cap for AMM pool
pub fn market_cap_pumpswap(
    pool_quote_reserves: u64,
    pool_base_reserves: u64,
    total_supply: u64,
) -> u128 {
    if pool_base_reserves == 0 {
        return 0;
    }
    // market cap = (SOL reserves * total supply) / token reserves
    let quote_reserves_u128 = pool_quote_reserves as u128;
    let total_supply_u128 = total_supply as u128;
    let base_reserves_u128 = pool_base_reserves as u128;

    (quote_reserves_u128 * total_supply_u128) / base_reserves_u128
}
