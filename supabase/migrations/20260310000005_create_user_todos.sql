-- ============================================================
-- ClawHelper — user_todos 個人 Vault 待辦事項表
-- Migration: 20260310000005
--
-- 設計目的：
--   讓登入使用者擁有一個完全私密的「保險庫（Vault）」，
--   用來記錄與媒合任務、聯絡服務方相關的個人備忘錄、
--   待跟進事項。任何資料只有 owner 看得見（RLS 強制）。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_todos (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    notes       TEXT,
    priority    TEXT        NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high')),
    is_done     BOOLEAN     NOT NULL DEFAULT FALSE,
    due_date    DATE,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 觸發器（沿用 next-chapter 的 set_updated_at()）
DROP TRIGGER IF EXISTS user_todos_set_updated_at ON public.user_todos;
CREATE TRIGGER user_todos_set_updated_at
    BEFORE UPDATE ON public.user_todos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 索引：以 user_id + 建立時間排序為主要查詢路徑
CREATE INDEX IF NOT EXISTS user_todos_user_id_idx
    ON public.user_todos (user_id);
CREATE INDEX IF NOT EXISTS user_todos_user_created_idx
    ON public.user_todos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_todos_user_done_idx
    ON public.user_todos (user_id, is_done);

-- ============================================================
-- Row Level Security：Vault 必須完全私密
-- ============================================================
ALTER TABLE public.user_todos ENABLE ROW LEVEL SECURITY;

-- 只有本人可讀
CREATE POLICY "todos: select own"
    ON public.user_todos FOR SELECT
    USING (auth.uid() = user_id);

-- 只有本人可新增（且 user_id 必須是自己）
CREATE POLICY "todos: insert own"
    ON public.user_todos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 只有本人可更新
CREATE POLICY "todos: update own"
    ON public.user_todos FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 只有本人可刪除
CREATE POLICY "todos: delete own"
    ON public.user_todos FOR DELETE
    USING (auth.uid() = user_id);
