-- Enable PostgreSQL citext extension for case-insensitive short_code lookups
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable links
CREATE TABLE "links" (
    "id" BIGSERIAL NOT NULL,
    "short_code" CITEXT,
    "long_url" TEXT NOT NULL,
    "management_token" TEXT NOT NULL,
    "email" TEXT,
    "custom_alias" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "max_clicks" INTEGER,
    "password_hash" TEXT,
    "url_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable click_events
CREATE TABLE "click_events" (
    "id" BIGSERIAL NOT NULL,
    "link_id" BIGINT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,
    "device_type" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "city" TEXT,
    "ip_hash" TEXT NOT NULL,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex links_short_code_key
CREATE UNIQUE INDEX "links_short_code_key" ON "links"("short_code");

-- CreateIndex links_management_token_key
CREATE UNIQUE INDEX "links_management_token_key" ON "links"("management_token");

-- CreateIndex links_url_key_idx
CREATE INDEX "links_url_key_idx" ON "links"("url_key");

-- CreateIndex click_events_link_id_clicked_at_idx (Composite Index)
CREATE INDEX "click_events_link_id_clicked_at_idx" ON "click_events"("link_id", "clicked_at");

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
