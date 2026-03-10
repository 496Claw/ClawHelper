-- ============================================================
-- ClawHelper — reviews NPS 評價表
-- Migration: 20260310000004
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reviews (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    service_id      UUID        REFERENCES public.services(id) ON DELETE SET NULL,
    task_request_id UUID        REFERENCES public.task_requests(id) ON DELETE SET NULL,
    reviewer_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reviewee_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- NPS 分數說明：
    --   0–6  = 批評者（Detractor）
    --   7–8  = 被動者（Passive）
    --   9–10 = 推薦者（Promoter）
    nps_score       SMALLINT    NOT NULL CHECK (nps_score BETWEEN 0 AND 10),
    comment         TEXT,
    ai_flagged      BOOLEAN     NOT NULL DEFAULT FALSE,  -- Phase 3: AI 標記惡意評論
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 至少要有 service_id 或 task_request_id 其中一個
    CONSTRAINT reviews_context_check CHECK (
        service_id IS NOT NULL OR task_request_id IS NOT NULL
    ),
    -- 防止同一個 reviewer 對同一個 service 重複評價
    CONSTRAINT reviews_unique_service_reviewer
        UNIQUE (service_id, reviewer_id),
    -- 防止同一個 reviewer 對同一個 task 重複評價
    CONSTRAINT reviews_unique_task_reviewer
        UNIQUE (task_request_id, reviewer_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS reviews_service_id_idx    ON public.reviews (service_id);
CREATE INDEX IF NOT EXISTS reviews_task_id_idx       ON public.reviews (task_request_id);
CREATE INDEX IF NOT EXISTS reviews_reviewee_id_idx   ON public.reviews (reviewee_id);

-- Row Level Security
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 所有人可以讀取評價（公開資訊）
CREATE POLICY "reviews: select all"
    ON public.reviews FOR SELECT
    USING (true);

-- 登入使用者可以新增評價（reviewer_id 必須是自己）
CREATE POLICY "reviews: insert own"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = reviewer_id);

-- 不開放修改評價（維護平台公信力）

-- ============================================================
-- Function + Trigger：新增評價後自動更新 services.avg_nps 和 review_count
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_service_nps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.service_id IS NOT NULL THEN
        UPDATE public.services
        SET
            avg_nps      = (
                SELECT ROUND(AVG(nps_score)::NUMERIC, 2)
                FROM public.reviews
                WHERE service_id = NEW.service_id
                  AND ai_flagged = FALSE
            ),
            review_count = (
                SELECT COUNT(*)
                FROM public.reviews
                WHERE service_id = NEW.service_id
                  AND ai_flagged = FALSE
            )
        WHERE id = NEW.service_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_service_nps ON public.reviews;
CREATE TRIGGER reviews_refresh_service_nps
    AFTER INSERT ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.refresh_service_nps();
