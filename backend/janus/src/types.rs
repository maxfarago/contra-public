use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug)]
#[serde(tag = "command_type")]
pub enum SqsCommand {
    #[serde(rename = "CREATE_ORDER")]
    CreateOrder(CreateOrderCommand),
    #[serde(rename = "DELETE_ORDER")]
    DeleteOrder(DeleteOrderCommand),
}

#[derive(Deserialize, Debug)]
pub struct CreateOrderCommand {
    #[serde(flatten)]
    pub config: Value,
}

#[derive(Deserialize, Debug)]
pub struct DeleteOrderCommand {
    pub order_id: String,
    pub order_type: String,
    pub wallet_public_key: String,
    pub token_mint: String,
}
