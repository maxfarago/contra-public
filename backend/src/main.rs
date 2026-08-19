mod app;

use anyhow::Result;
use app::Application;
use config::{Config, File, FileFormat};
use dotenvy::dotenv;
use tracing::debug;
use tracing_subscriber::{fmt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    println!(
        r#"
 █████╗ ██╗  ██╗████████╗ ██████╗ ███╗   ██╗
██╔══██╗╚██╗██╔╝╚══██╔══╝██╔═══██╗████╗  ██║
███████║ ╚███╔╝    ██║   ██║   ██║██╔██╗ ██║
██╔══██║ ██╔██╗    ██║   ██║   ██║██║╚██╗██║
██║  ██║██╔╝ ██╗   ██║   ╚██████╔╝██║ ╚████║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝
"#
    );
    println!("starting axton...");

    // --- env vars + cfg ---
    println!("loading env vars from .env...");
    dotenv().ok();

    println!("loading config...");
    let config = Config::builder()
        .add_source(File::from_str(
            include_str!("config.toml"),
            FileFormat::Toml,
        ))
        .add_source(config::Environment::with_prefix("AXTON").separator("__"))
        .build()?;

    // --- logs ---
    println!("initializing tracing...");
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        let axton_level = "debug";
        let guillotine_level = "debug";
        let trades_level = "debug";
        let janus_level = "debug";
        let hermes_level = "debug";
        let aws_config_level = "info";
        let shylock_level = "debug";
        let buffett_level = "debug";

        let filter_string = format!(
            "axton={},guillotine={},trades={},janus={},hermes={},aws_config={},shylock={},buffett={}",
            axton_level,
            guillotine_level,
            trades_level,
            janus_level,
            hermes_level,
            aws_config_level,
            shylock_level,
            buffett_level
        );
        EnvFilter::new(filter_string)
    });
    fmt().with_env_filter(env_filter).init();
    debug!("tracing initialized! loading axton...");

    // --- build and run application ---
    let app = Application::build(&config).await?;
    app.run().await?;

    Ok(())
}
