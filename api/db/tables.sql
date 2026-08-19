-- ---------------------
--        TABLES
-- ---------------------

CREATE TABLE account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE,
    first_name TEXT,
    telegram_username TEXT,
    public_key TEXT UNIQUE,
    private_key_encrypted TEXT, 
    last_name TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE account_ws_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE login_token (
    token TEXT PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    user_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE token (
    mint TEXT PRIMARY KEY,
    name TEXT,
    symbol TEXT,
    image_url TEXT,
    decimals SMALLINT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE position_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    token_mint TEXT NOT NULL REFERENCES token(mint) ON DELETE CASCADE,
    type TEXT NOT NULL,
    sol_amount_lamports BIGINT,
    token_amount_microtokens BIGINT,
    config JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'CREATED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_tx (
    signature TEXT PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES position_order(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    protocol TEXT NOT NULL,
    request_amount_lamports BIGINT,
    request_amount_microtokens BIGINT,
    result_amount_lamports BIGINT,
    result_amount_microtokens BIGINT,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    metadata JSONB NOT NULL DEFAULT '{}',
    submitted_by UUID NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE OR REPLACE VIEW position AS
WITH tx_aggregates AS (
    SELECT
        po.account_id,
        po.token_mint,
        MIN(po.created_at) AS created_at,
        -- buys: positive microtokens, negative lamports
        SUM(CASE WHEN otx.result_amount_microtokens > 0 THEN otx.result_amount_microtokens ELSE 0 END) AS total_bought_microtokens,
        SUM(CASE WHEN otx.result_amount_lamports < 0 THEN ABS(otx.result_amount_lamports) ELSE 0 END) AS total_bought_lamports,
        COUNT(*) FILTER (WHERE otx.result_amount_microtokens > 0) AS buy_tx_count,
        -- sells: negative microtokens, positive lamports
        SUM(CASE WHEN otx.result_amount_microtokens < 0 THEN ABS(otx.result_amount_microtokens) ELSE 0 END) AS total_sold_microtokens,
        SUM(CASE WHEN otx.result_amount_lamports > 0 THEN otx.result_amount_lamports ELSE 0 END) AS total_sold_lamports,
        COUNT(*) FILTER (WHERE otx.result_amount_microtokens < 0) AS sell_tx_count
    FROM
        order_tx otx
    JOIN
        position_order po ON otx.order_id = po.id
    WHERE
        otx.status = 'CONFIRMED'
    GROUP BY
        po.account_id,
        po.token_mint
)
SELECT
    -- synthetic unique id
    agg.account_id::text || ':' || agg.token_mint AS id,
    agg.account_id,
    agg.token_mint,
    -- token metadata
    tok.name AS token_name,
    tok.symbol AS token_symbol,
    tok.image_url AS token_image_url,
    -- holdings
    (agg.total_bought_microtokens - agg.total_sold_microtokens) AS current_holdings_microtokens,
    -- totals
    agg.total_bought_microtokens,
    agg.total_sold_microtokens,
    agg.total_bought_lamports,
    agg.total_sold_lamports,
    -- tx counts
    agg.buy_tx_count,
    agg.sell_tx_count,
    -- realized pnl (using average cost basis)
    (agg.total_sold_lamports - (agg.total_sold_microtokens * (agg.total_bought_lamports / NULLIF(agg.total_bought_microtokens, 0)))) AS realized_pnl_lamports,
    agg.created_at
FROM
    tx_aggregates agg
LEFT JOIN
    token tok ON agg.token_mint = tok.mint;

CREATE TABLE log (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES position_order(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ---------------------
--        INDEXES
-- ---------------------

-- account
CREATE INDEX idx_account_telegram_username ON account (telegram_username);
CREATE INDEX idx_account_created_at ON account (created_at DESC);
CREATE INDEX idx_account_updated_at ON account (updated_at DESC);

-- login_token
CREATE INDEX idx_login_token_telegram_id ON login_token (telegram_id);
CREATE INDEX idx_login_token_expires_at ON login_token (expires_at);

-- token
CREATE INDEX idx_token_symbol ON token (symbol);
CREATE INDEX idx_token_name ON token (name);
CREATE INDEX idx_token_added_at ON token (added_at DESC);
CREATE INDEX idx_token_updated_at ON token (updated_at DESC);

-- position_order
CREATE INDEX idx_position_order_account_id ON position_order(account_id);
CREATE INDEX idx_position_order_token_mint ON position_order(token_mint);
CREATE INDEX idx_position_order_type ON position_order(type);
CREATE INDEX idx_position_order_status ON position_order(status);
CREATE INDEX idx_position_order_created_at ON position_order (created_at DESC);
CREATE INDEX idx_position_order_updated_at ON position_order (updated_at DESC);

-- order_tx
CREATE INDEX idx_order_tx_order_id ON order_tx (order_id);
CREATE INDEX idx_order_tx_submitted_by ON order_tx (submitted_by);
CREATE INDEX idx_order_tx_type ON order_tx (type);
CREATE INDEX idx_order_tx_protocol ON order_tx (protocol);
CREATE INDEX idx_order_tx_status ON order_tx (status);
CREATE INDEX idx_order_tx_submitted_at ON order_tx (submitted_at DESC);
CREATE INDEX idx_order_tx_confirmed_at ON order_tx (confirmed_at DESC);

-- log
CREATE INDEX idx_log_order_id ON log (order_id);
CREATE INDEX idx_log_level ON log (level);
CREATE INDEX idx_log_created_at ON log (created_at DESC);


-- ---------------------
--        TRIGGERS
-- ---------------------

-- shared fxn
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- account
CREATE TRIGGER trg_account_updated_at
BEFORE UPDATE ON account
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- login_token
CREATE TRIGGER trg_login_token_updated_at
BEFORE UPDATE ON login_token
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- token
CREATE TRIGGER trg_token_updated_at
BEFORE UPDATE ON token
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- position_order
CREATE TRIGGER trg_position_order_updated_at
BEFORE UPDATE ON position_order
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- order_tx
CREATE TRIGGER trg_order_tx_updated_at
BEFORE UPDATE ON order_tx
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- log
CREATE TRIGGER trg_log_updated_at
BEFORE UPDATE ON log
FOR EACH ROW EXECUTE FUNCTION set_updated_at();