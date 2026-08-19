pub mod pumpfun;
pub mod pumpswap;
pub mod token_parser;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Protocol {
    PumpFun,
    PumpSwap,
}
