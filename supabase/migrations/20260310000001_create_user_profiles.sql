-- ============================================================
-- ClawHelper — user_profiles 使用者擴充資料表
-- Migration: 20260310000001
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name  TEXT        NOT NULL DEFAULT '',
    roles         TEXT[]      NOT NULL DEFAULT '{seeker}',
    -- roles 說明：
    --   'seeker'   = 需求方（找服務）
    --   'provider' = 供給方（提供服務）
    --   可同時持有兩種角色，例如 '{seeker,provider}'
    phone         TEXT,
    district      TEXT,
    avatar_emoji  TEXT        NOT NULL DEFAULT '👤',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 自動更新觸發器
-- 注意：set_updated_at() function 由 next-chapter migration 已建立
-- 若尚未存在，請先建立：
-- CREATE OR REPLACE FUNCTION public.set_updated_at()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 索引
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles (user_id);

-- Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 任何人可以讀取（供服務卡片顯示提供者姓名）
CREATE POLICY "profiles: select public"
    ON public.user_profiles FOR SELECT
    USING (true);

-- 只有本人可以新增自己的資料
CREATE POLICY "profiles: insert own"
    ON public.user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 只有本人可以更新自己的資料
CREATE POLICY "profiles: update own"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = user_id);
