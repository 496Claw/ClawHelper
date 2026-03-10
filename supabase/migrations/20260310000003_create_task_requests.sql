-- ============================================================
-- ClawHelper — task_requests 需求方發單表
-- Migration: 20260310000003
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_requests (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    seeker_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title                TEXT        NOT NULL,
    category             TEXT        NOT NULL
                                     CHECK (category IN (
                                         '水電修繕',
                                         '家教與教學',
                                         '家事服務',
                                         '短途運送與小型任務'
                                     )),
    description          TEXT        NOT NULL,
    budget               NUMERIC(10,0),   -- NULL = 面議
    district             TEXT,
    deadline             DATE,
    status               TEXT        NOT NULL DEFAULT 'open'
                                     CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    assigned_provider_id UUID        REFERENCES auth.users(id),
    applicant_count      INTEGER     NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 觸發器
DROP TRIGGER IF EXISTS task_requests_set_updated_at ON public.task_requests;
CREATE TRIGGER task_requests_set_updated_at
    BEFORE UPDATE ON public.task_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 索引
CREATE INDEX IF NOT EXISTS task_requests_seeker_id_idx  ON public.task_requests (seeker_id);
CREATE INDEX IF NOT EXISTS task_requests_category_idx   ON public.task_requests (category);
CREATE INDEX IF NOT EXISTS task_requests_status_idx     ON public.task_requests (status);
CREATE INDEX IF NOT EXISTS task_requests_created_at_idx ON public.task_requests (created_at DESC);

-- Row Level Security
ALTER TABLE public.task_requests ENABLE ROW LEVEL SECURITY;

-- 所有人可以讀取 open 任務（供供給方瀏覽接案）
-- 發單人和被指派的服務方也可以讀取其他狀態的任務
CREATE POLICY "tasks: select open or own"
    ON public.task_requests FOR SELECT
    USING (
        status = 'open'
        OR auth.uid() = seeker_id
        OR auth.uid() = assigned_provider_id
    );

-- 登入使用者可以新增任務（seeker_id 必須是自己）
CREATE POLICY "tasks: insert own"
    ON public.task_requests FOR INSERT
    WITH CHECK (auth.uid() = seeker_id);

-- 只有發單人可以更新任務（取消、確認接案者等）
CREATE POLICY "tasks: update own"
    ON public.task_requests FOR UPDATE
    USING (auth.uid() = seeker_id);
