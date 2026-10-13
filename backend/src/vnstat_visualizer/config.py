from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VNSTAT_", extra="ignore")

    database_url: str = Field(default="sqlite:///./vnstat.db", validation_alias="DATABASE_URL")
    api_listen_address: str = Field(
        default="0.0.0.0",  # nosec B104
        validation_alias="API_LISTEN_ADDRESS",
    )
    api_port: int = Field(default=8000, validation_alias="API_PORT")
    udp_listen_address: str = Field(
        default="0.0.0.0",  # nosec B104
        validation_alias="UDP_LISTEN_ADDRESS",
    )
    udp_port: int = Field(default=9999, validation_alias="UDP_PORT")
    charts_config_path: str = Field(default="charts.json", validation_alias="CHARTS_CONFIG_PATH")

    log_level: str = "INFO"
    db_pool_size: int = 5
    db_max_overflow: int = 10


settings = Settings()
