-- =============================================================================
-- glog — 多飯店多租戶 + 住客免登入掃碼請求
-- 建立 hotels / rooms / guest_requests 資料表
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. hotels（飯店 / 租戶）
-- -----------------------------------------------------------------------------
CREATE TABLE "hotels" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"                TEXT        NOT NULL,
    "line_official_token" TEXT,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE  "hotels" IS '飯店租戶主表，每間飯店擁有獨立 LINE Token 與客房資料';
COMMENT ON COLUMN "hotels"."line_official_token" IS '該飯店專屬 LINE Messaging API Channel Access Token';

-- -----------------------------------------------------------------------------
-- 2. rooms（客房 + QR Code 識別金鑰）
-- -----------------------------------------------------------------------------

-- 自動產生 8 碼 qr_token（md5 雜湊截取，碰撞時重試）
CREATE OR REPLACE FUNCTION "generate_room_qr_token"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    candidate TEXT;
    attempt   INT := 0;
BEGIN
    -- 若呼叫端已手動指定 qr_token，則沿用
    IF NEW."qr_token" IS NOT NULL AND btrim(NEW."qr_token") <> '' THEN
        NEW."qr_token" := btrim(NEW."qr_token");
        RETURN NEW;
    END IF;

    LOOP
        candidate := substr(
            md5(random()::text || clock_timestamp()::text || coalesce(NEW."id"::text, '')),
            1,
            8
        );

        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM "rooms" WHERE "qr_token" = candidate
        );

        attempt := attempt + 1;
        IF attempt >= 20 THEN
            RAISE EXCEPTION '無法產生唯一的 qr_token，請稍後再試';
        END IF;
    END LOOP;

    NEW."qr_token" := candidate;
    RETURN NEW;
END;
$$;

CREATE TABLE "rooms" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hotel_id"    UUID        NOT NULL,
    "room_number" TEXT        NOT NULL,
    "qr_token"    TEXT        NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rooms_hotel_id_fkey"
        FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rooms_qr_token_key" UNIQUE ("qr_token"),
    CONSTRAINT "rooms_hotel_id_room_number_key" UNIQUE ("hotel_id", "room_number")
);

COMMENT ON TABLE  "rooms" IS '客房資料；qr_token 供住客掃碼免登入識別';
COMMENT ON COLUMN "rooms"."qr_token" IS 'QR Code 識別金鑰，INSERT 時由觸發器自動產生 8 碼短字串';

CREATE TRIGGER "trg_rooms_generate_qr_token"
    BEFORE INSERT ON "rooms"
    FOR EACH ROW
    EXECUTE FUNCTION "generate_room_qr_token"();

-- -----------------------------------------------------------------------------
-- 3. guest_requests（住客工單）
-- -----------------------------------------------------------------------------
CREATE TABLE "guest_requests" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hotel_id"     UUID        NOT NULL,
    "room_id"      UUID        NOT NULL,
    "request_type" TEXT        NOT NULL,
    "status"       TEXT        NOT NULL DEFAULT 'pending',
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "guest_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guest_requests_hotel_id_fkey"
        FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guest_requests_room_id_fkey"
        FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guest_requests_status_check"
        CHECK ("status" IN ('pending', 'processing', 'completed'))
);

COMMENT ON TABLE  "guest_requests" IS '住客透過 QR Code 提交的服務請求（免登入）';
COMMENT ON COLUMN "guest_requests"."request_type" IS '請求類型，例如 towels / cleaning / maintenance';

-- -----------------------------------------------------------------------------
-- 4. 索引（常用查詢欄位）
-- -----------------------------------------------------------------------------

-- hotels
CREATE INDEX "hotels_created_at_idx" ON "hotels"("created_at" DESC);

-- rooms
CREATE INDEX "rooms_hotel_id_idx" ON "rooms"("hotel_id");
-- qr_token 已有 UNIQUE 約束，PostgreSQL 會自動建立唯一索引

-- guest_requests
CREATE INDEX "guest_requests_hotel_id_idx" ON "guest_requests"("hotel_id");
CREATE INDEX "guest_requests_room_id_idx" ON "guest_requests"("room_id");
CREATE INDEX "guest_requests_hotel_id_status_idx" ON "guest_requests"("hotel_id", "status");
CREATE INDEX "guest_requests_created_at_idx" ON "guest_requests"("created_at" DESC);

-- -----------------------------------------------------------------------------
-- 5. 資料一致性：確保 room 所屬 hotel 與 guest_request.hotel_id 一致
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "validate_guest_request_hotel_room"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    room_hotel_id UUID;
BEGIN
    SELECT "hotel_id" INTO room_hotel_id
    FROM "rooms"
    WHERE "id" = NEW."room_id";

    IF room_hotel_id IS NULL THEN
        RAISE EXCEPTION 'room_id % 不存在', NEW."room_id";
    END IF;

    IF NEW."hotel_id" <> room_hotel_id THEN
        RAISE EXCEPTION 'hotel_id 與 room 所屬飯店不一致';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_guest_requests_validate_hotel_room"
    BEFORE INSERT OR UPDATE OF "hotel_id", "room_id" ON "guest_requests"
    FOR EACH ROW
    EXECUTE FUNCTION "validate_guest_request_hotel_room"();
