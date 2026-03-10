-- ============================================================
-- ClawHelper — services 供給方服務上架表
-- Migration: 20260310000002
-- ============================================================

CREATE TABLE IF NOT EXISTS public.services (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL,
    category      TEXT        NOT NULL
                              CHECK (category IN (
                                  '水電修繕',
                                  '家教與教學',
                                  '家事服務',
                                  '短途運送與小型任務'
                              )),
    description   TEXT        NOT NULL,
    pricing_type  TEXT        NOT NULL DEFAULT 'hourly'
                              CHECK (pricing_type IN ('hourly', 'per_task', 'negotiable')),
    -- hourly     = 時薪計費
    -- per_task   = 次計費（固定價格）
    -- negotiable = 面議
    price         NUMERIC(10,0),   -- NULL 代表 negotiable
    district      TEXT,            -- 服務地區（例如：大安區）
    avg_nps       NUMERIC(4,2)     DEFAULT 0,    -- NPS 平均分 0–10，供排序
    review_count  INTEGER          DEFAULT 0,
    status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'deleted')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 觸發器
DROP TRIGGER IF EXISTS services_set_updated_at ON public.services;
CREATE TRIGGER services_set_updated_at
    BEFORE UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 索引
CREATE INDEX IF NOT EXISTS services_provider_id_idx ON public.services (provider_id);
CREATE INDEX IF NOT EXISTS services_category_idx    ON public.services (category);
CREATE INDEX IF NOT EXISTS services_status_idx      ON public.services (status);
CREATE INDEX IF NOT EXISTS services_avg_nps_idx     ON public.services (avg_nps DESC);

-- Row Level Security
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- 所有人可以讀取 active 狀態的服務（公開瀏覽）
CREATE POLICY "services: select active"
    ON public.services FOR SELECT
    USING (status = 'active');

-- 只有本人可以新增自己的服務
CREATE POLICY "services: insert own"
    ON public.services FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

-- 只有本人可以更新自己的服務
CREATE POLICY "services: update own"
    ON public.services FOR UPDATE
    USING (auth.uid() = provider_id);
