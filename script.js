/**
 * ============================================================
 * ClawHelper — script.js
 * 在地服務媒合平台
 *
 * 模組架構：
 *   A. 設定與初始化
 *   B. Auth（Magic Link，封裝於 authModule）
 *   C. 瀏覽服務（Browse Section）
 *   D. 張貼任務（Post Task Section）
 *   E. 服務上架（Provider Section）
 *   F. 評價系統（NPS Reviews）
 *   G. Navbar + 平滑滾動 + ScrollSpy
 *   H. 工具函式
 * ============================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // 模組 A：設定與初始化
    // ============================================================

    const SUPABASE_URL  = 'https://rjezzptqympyragmhijg.supabase.co';
    const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZXp6cHRxeW1weXJhZ21oaWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcyMTMsImV4cCI6MjA4ODM2MzIxM30.FpKE2bFTWd3_liZOlv_RWTOcHkGoYRfMNJHwBYgMSxA';

    const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { detectSessionInUrl: true }
    });

    let currentUser     = null;   // 目前登入的使用者
    let activeCategory  = 'all';  // 目前篩選的類別
    let currentServiceId = null;  // 目前詳情 Modal 的 service id
    let selectedNps     = null;   // NPS 選擇值
    let isAdmin         = false;  // 是否為管理員

    // ============================================================
    // 模組 B：Auth（Magic Link）
    // ⚠️ 封裝於此區塊，未來可替換為 OTP / 密碼 / OAuth
    // ============================================================

    const authOverlay   = document.getElementById('auth-overlay');
    const authStepEmail = document.getElementById('auth-step-email');
    const authStepSent  = document.getElementById('auth-step-sent');
    const authStepSaved = document.getElementById('auth-step-saved');

    /** 打開登入 Modal */
    function showAuthModal(afterLoginCallback) {
        window._afterLoginCallback = afterLoginCallback || null;
        authStepEmail.style.display = 'block';
        authStepSent.style.display  = 'none';
        authStepSaved.style.display = 'none';
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-send-label').textContent = '寄送登入連結';
        document.getElementById('auth-send-btn').disabled = false;
        authOverlay.style.display = 'flex';
    }

    /** 關閉登入 Modal */
    function closeAuthModal() {
        authOverlay.style.display = 'none';
    }

    // 關閉按鈕
    document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
    authOverlay.addEventListener('click', (e) => { if (e.target === authOverlay) closeAuthModal(); });

    // 寄送 Magic Link
    document.getElementById('auth-send-btn').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        if (!email || !email.includes('@')) {
            showToast('請輸入有效的 Email 地址', 'error');
            return;
        }

        const sendLabel = document.getElementById('auth-send-label');
        const sendBtn   = document.getElementById('auth-send-btn');
        sendLabel.textContent = '發送中...';
        sendBtn.disabled = true;

        const { error } = await db.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: 'http://localhost:3000/' }
        });

        if (error) {
            showToast('發送失敗：' + error.message, 'error');
            sendLabel.textContent = '寄送登入連結';
            sendBtn.disabled = false;
            return;
        }

        document.getElementById('auth-email-display').textContent = email;
        authStepEmail.style.display = 'none';
        authStepSent.style.display  = 'block';
        showToast('登入連結已寄出！', 'success');
    });

    // 「開始使用」按鈕
    document.getElementById('auth-done-btn').addEventListener('click', () => {
        closeAuthModal();
        if (window._afterLoginCallback) {
            window._afterLoginCallback();
            window._afterLoginCallback = null;
        }
    });

    // Supabase Auth 狀態監聽
    db.auth.onAuthStateChange(async (event, session) => {
        console.log('🔐 Auth 事件:', event, session?.user?.email);

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            currentUser = session.user;
            updateNavbarAuthState(session.user);

            // 確保 user_profiles 存在（upsert）
            await db.from('user_profiles').upsert([{
                user_id: session.user.id,
                display_name: session.user.email.split('@')[0]
            }], { onConflict: 'user_id' });

            // 取得 roles，判斷是否為管理員
            const { data: profile } = await db.from('user_profiles')
                .select('roles')
                .eq('user_id', session.user.id)
                .single();
            isAdmin = Array.isArray(profile?.roles) && profile.roles.includes('admin');
            updateNavbarAdminBtn();

            // 若 Modal 還開著，顯示成功步驟
            if (authOverlay.style.display !== 'none') {
                authStepEmail.style.display = 'none';
                authStepSent.style.display  = 'none';
                authStepSaved.style.display = 'block';
            }
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            isAdmin     = false;
            updateNavbarAuthState(null);
            updateNavbarAdminBtn();
        }
    });

    /** 更新 Navbar 登入狀態顯示 */
    function updateNavbarAuthState(user) {
        const btn = document.getElementById('nav-auth-btn');
        if (user) {
            btn.textContent = '👤 ' + user.email.split('@')[0];
            btn.classList.add('logged-in');
            btn.onclick = async () => {
                await db.auth.signOut();
                showToast('已登出', 'info');
            };
        } else {
            btn.textContent = '登入 / 註冊';
            btn.classList.remove('logged-in');
            btn.onclick = () => showAuthModal();
        }
    }


    // ============================================================
    // 模組 C：瀏覽服務（Browse Section）
    // ============================================================

    /** 載入並渲染服務列表 */
    async function loadServices() {
        const container = document.getElementById('services-container');
        const sortBy    = document.getElementById('sort-select').value;

        container.innerHTML = `
            <div class="loading-placeholder">
                <div class="loading-spinner"></div>
                <p class="loading-title">載入服務中...</p>
            </div>`;

        let query = db.from('services')
            .select(`
                *,
                user_profiles!services_provider_id_fkey (
                    display_name,
                    avatar_emoji
                )
            `)
            .eq('status', 'active');

        if (activeCategory && activeCategory !== 'all') {
            query = query.eq('category', activeCategory);
        }

        // 排序
        if (sortBy === 'avg_nps') {
            query = query.order('avg_nps', { ascending: false });
        } else if (sortBy === 'created_at') {
            query = query.order('created_at', { ascending: false });
        } else if (sortBy === 'price') {
            query = query.order('price', { ascending: true, nullsFirst: false });
        }

        const { data: services, error } = await query;

        if (error) {
            console.error('載入服務失敗:', error);
            container.innerHTML = `<div class="no-data-placeholder"><span class="no-data-icon">😢</span><p>載入失敗，請重新整理頁面</p></div>`;
            return;
        }

        if (!services || services.length === 0) {
            container.innerHTML = `
                <div class="no-data-placeholder">
                    <span class="no-data-icon">🔍</span>
                    <p>目前尚無服務上架<br>成為第一個服務達人吧！</p>
                </div>`;
            return;
        }

        container.innerHTML = services.map(renderServiceCard).join('');
    }

    /** 渲染單張服務卡片 */
    function renderServiceCard(s) {
        const providerName  = s.user_profiles?.display_name || '服務達人';
        const providerEmoji = s.user_profiles?.avatar_emoji  || '👤';
        const priceStr      = formatPrice(s.pricing_type, s.price);
        const npsStr        = s.review_count > 0
            ? `NPS ${parseFloat(s.avg_nps).toFixed(1)} <span style="color:var(--slate-gray);">(${s.review_count}則)</span>`
            : '尚無評價';

        return `
            <div class="service-card" onclick="window.openServiceDetailModal('${s.id}')">
                <div class="service-card-header">
                    <span class="service-category-badge">${s.category}</span>
                    <div class="service-provider-avatar">${providerEmoji}</div>
                </div>
                <div class="service-title">${escapeHtml(s.title)}</div>
                <div class="service-desc">${escapeHtml(s.description)}</div>
                ${s.district ? `<div class="service-district">📍 ${escapeHtml(s.district)}</div>` : ''}
                <div class="service-meta">
                    <div class="service-price">${priceStr}</div>
                    <div class="service-rating">
                        <span class="rating-stars">${npsStars(s.avg_nps, s.review_count)}</span>
                        <span>${npsStr}</span>
                    </div>
                </div>
                <button class="book-btn">查看詳情 →</button>
            </div>`;
    }

    /** 依類別篩選 */
    function filterByCategory(category) {
        activeCategory = category === activeCategory ? 'all' : category;

        // 更新 tab 樣式
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === activeCategory);
        });

        // 更新 Hero 類別卡片樣式
        document.querySelectorAll('.category-card').forEach(card => {
            card.classList.toggle('active', card.dataset.category === activeCategory);
        });

        // 若點選的是類別卡片，滾到瀏覽區
        if (activeCategory !== 'all') {
            document.getElementById('browse-section').scrollIntoView({ behavior: 'smooth' });
        }

        loadServices();
    }

    /** 設定排序 Select 事件 */
    document.getElementById('sort-select').addEventListener('change', loadServices);

    /** 打開服務詳情 Modal */
    async function openServiceDetailModal(serviceId) {
        currentServiceId = serviceId;
        selectedNps = null;

        const overlay  = document.getElementById('service-detail-overlay');
        const content  = document.getElementById('service-detail-content');
        const reviewSection = document.getElementById('review-form-section');

        overlay.style.display = 'flex';
        content.innerHTML = `<div class="loading-placeholder"><div class="loading-spinner"></div></div>`;
        reviewSection.style.display = 'none';

        // 載入服務詳情
        const { data: s, error } = await db.from('services')
            .select(`*, user_profiles!services_provider_id_fkey (display_name, avatar_emoji)`)
            .eq('id', serviceId)
            .single();

        if (error || !s) {
            content.innerHTML = '<p style="color:var(--light-slate);text-align:center;">載入失敗</p>';
            return;
        }

        const providerName  = s.user_profiles?.display_name || '服務達人';
        const providerEmoji = s.user_profiles?.avatar_emoji  || '👤';
        const priceStr      = formatPrice(s.pricing_type, s.price);

        content.innerHTML = `
            <div class="service-detail-provider">
                <div class="service-detail-avatar">${providerEmoji}</div>
                <div>
                    <div class="service-detail-name">${escapeHtml(providerName)}</div>
                    <div class="service-detail-category">${s.category}</div>
                </div>
            </div>
            <div class="service-detail-title">${escapeHtml(s.title)}</div>
            <div class="service-detail-description">${escapeHtml(s.description)}</div>
            <div class="service-detail-info">
                <div class="service-detail-info-item">
                    <span class="info-label">收費方式</span>
                    <span class="info-value">${priceStr}</span>
                </div>
                ${s.district ? `<div class="service-detail-info-item">
                    <span class="info-label">服務地區</span>
                    <span class="info-value">📍 ${escapeHtml(s.district)}</span>
                </div>` : ''}
                <div class="service-detail-info-item">
                    <span class="info-label">NPS 評分</span>
                    <span class="info-value">${s.review_count > 0 ? `${parseFloat(s.avg_nps).toFixed(1)} / 10（${s.review_count}則）` : '尚無評價'}</span>
                </div>
            </div>
            <div class="reviews-section-title">💬 使用者評價</div>
            <div class="reviews-list" id="modal-reviews-list">
                <div class="no-reviews">載入評價中...</div>
            </div>`;

        // 載入評價
        loadReviewsForService(serviceId);

        // 顯示留評區（僅登入且非服務提供者本人）
        if (currentUser && currentUser.id !== s.provider_id) {
            reviewSection.style.display = 'block';
            renderNpsPicker();
        }
    }

    /** 關閉服務詳情 Modal */
    function closeServiceDetailModal() {
        document.getElementById('service-detail-overlay').style.display = 'none';
        currentServiceId = null;
        selectedNps = null;
    }

    document.getElementById('service-detail-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('service-detail-overlay')) closeServiceDetailModal();
    });

    /** 載入指定服務的評價 */
    async function loadReviewsForService(serviceId) {
        const list = document.getElementById('modal-reviews-list');
        if (!list) return;

        const { data: reviews, error } = await db.from('reviews')
            .select('*, user_profiles!reviews_reviewer_id_fkey (display_name)')
            .eq('service_id', serviceId)
            .eq('ai_flagged', false)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error || !reviews || reviews.length === 0) {
            list.innerHTML = '<div class="no-reviews">😊 尚無評價，成為第一個留評的人吧！</div>';
            return;
        }

        list.innerHTML = reviews.map(r => {
            const npsClass  = r.nps_score >= 9 ? 'promoter' : r.nps_score >= 7 ? 'passive' : 'detractor';
            const npsLabel  = r.nps_score >= 9 ? '推薦 🌟' : r.nps_score >= 7 ? '不錯 👍' : '待改善';
            const reviewer  = r.user_profiles?.display_name || '匿名';
            const dateStr   = formatDate(r.created_at);
            return `
                <div class="review-item">
                    <div class="review-header">
                        <span>
                            <strong style="color:var(--white);font-size:0.85rem;">${escapeHtml(reviewer)}</strong>
                            <span class="review-nps ${npsClass}" style="margin-left:0.5rem;">
                                NPS ${r.nps_score} · ${npsLabel}
                            </span>
                        </span>
                        <span class="review-date">${dateStr}</span>
                    </div>
                    ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
                </div>`;
        }).join('');
    }


    // ============================================================
    // 模組 D：張貼任務（Post Task Section）
    // ============================================================

    document.getElementById('post-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            showToast('請先登入才能發布需求 🔐', 'info');
            showAuthModal(() => {
                // 登入後自動重新提交
                document.getElementById('post-task-form').dispatchEvent(new Event('submit'));
            });
            return;
        }

        const title       = document.getElementById('task-title').value.trim();
        const category    = document.getElementById('task-category').value;
        const description = document.getElementById('task-description').value.trim();
        const budget      = document.getElementById('task-budget').value;
        const district    = document.getElementById('task-district').value.trim();
        const deadline    = document.getElementById('task-deadline').value;

        if (!title || !category || !description) {
            showToast('請填寫任務標題、類別和描述', 'error');
            return;
        }

        const label = document.getElementById('post-task-label');
        label.textContent = '發布中...';

        const { error } = await db.from('task_requests').insert([{
            seeker_id:   currentUser.id,
            title,
            category,
            description,
            budget:      budget ? parseInt(budget) : null,
            district:    district || null,
            deadline:    deadline || null
        }]);

        label.textContent = '發布需求';

        if (error) {
            showToast('發布失敗：' + error.message, 'error');
            return;
        }

        showToast('✅ 需求已發布！服務達人將主動聯絡你', 'success');
        document.getElementById('post-task-form').reset();
        loadOpenTasks();
    });

    /** 載入並渲染 open 任務列表 */
    async function loadOpenTasks() {
        const container = document.getElementById('tasks-container');

        const { data: tasks, error } = await db.from('task_requests')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error || !tasks || tasks.length === 0) {
            container.innerHTML = `
                <div class="no-data-placeholder" style="grid-column:1/-1;">
                    <span class="no-data-icon">📋</span>
                    <p>目前尚無開放任務<br>你可以成為第一個發布需求的人！</p>
                </div>`;
            return;
        }

        container.innerHTML = tasks.map(t => {
            const budgetStr  = t.budget ? `${t.budget.toLocaleString()} 元` : '面議';
            const deadlineStr = t.deadline ? `📅 ${t.deadline}` : '';
            const districtStr = t.district ? `📍 ${t.district}` : '';

            return `
                <div class="task-card">
                    <div class="task-card-header">
                        <span class="task-category-badge skill-tag">${t.category}</span>
                        <span class="task-status-badge open">🟢 徵求中</span>
                    </div>
                    <div class="task-title">${escapeHtml(t.title)}</div>
                    <div class="task-desc">${escapeHtml(t.description)}</div>
                    <div class="task-meta">
                        ${districtStr ? `<span class="task-meta-item">${districtStr}</span>` : ''}
                        ${deadlineStr ? `<span class="task-meta-item">${deadlineStr}</span>` : ''}
                    </div>
                    <div class="task-budget">💰 預算：${budgetStr}</div>
                    <div class="task-applicants">👥 ${t.applicant_count} 位達人接案中</div>
                </div>`;
        }).join('');
    }


    // ============================================================
    // 模組 E：服務上架（Provider Section）
    // ============================================================

    document.getElementById('provider-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            showToast('請先登入才能上架服務 🔐', 'info');
            showAuthModal(() => {
                document.getElementById('provider-form').dispatchEvent(new Event('submit'));
            });
            return;
        }

        const title       = document.getElementById('service-title').value.trim();
        const category    = document.getElementById('service-category').value;
        const description = document.getElementById('service-description').value.trim();
        const pricingType = document.getElementById('service-pricing-type').value;
        const price       = document.getElementById('service-price').value;
        const district    = document.getElementById('service-district').value.trim();
        const displayName = document.getElementById('provider-display-name').value.trim();

        if (!title || !category || !description || !displayName) {
            showToast('請填寫所有必填欄位', 'error');
            return;
        }

        const label = document.getElementById('provider-submit-label');
        label.textContent = '上架中...';

        // 更新顯示名稱
        await db.from('user_profiles').upsert([{
            user_id:      currentUser.id,
            display_name: displayName,
            roles:        ['seeker', 'provider']
        }], { onConflict: 'user_id' });

        // 上架服務
        const { error } = await db.from('services').insert([{
            provider_id:  currentUser.id,
            title,
            category,
            description,
            pricing_type: pricingType,
            price:        (pricingType !== 'negotiable' && price) ? parseInt(price) : null,
            district:     district || null
        }]);

        label.textContent = '上架我的服務';

        if (error) {
            showToast('上架失敗：' + error.message, 'error');
            return;
        }

        showToast('🎉 服務已成功上架！', 'success');
        document.getElementById('provider-form').reset();
        loadServices();
    });


    // ============================================================
    // 模組 F：評價系統（NPS）
    // ============================================================

    /** 渲染 NPS 數字選擇器 0–10 */
    function renderNpsPicker() {
        const picker = document.getElementById('nps-picker');
        selectedNps  = null;

        picker.innerHTML = Array.from({ length: 11 }, (_, i) => `
            <button type="button" class="nps-btn" data-score="${i}"
                    onclick="window.selectNps(${i})">${i}</button>
        `).join('');
    }

    /** 選擇 NPS 分數 */
    function selectNps(score) {
        selectedNps = score;
        document.querySelectorAll('.nps-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.score) === score);
        });
    }

    /** 提交評價 */
    async function submitReview() {
        if (!currentUser) {
            showToast('請先登入才能留評價 🔐', 'info');
            showAuthModal();
            return;
        }
        if (selectedNps === null) {
            showToast('請選擇 NPS 評分（0–10）', 'error');
            return;
        }
        if (!currentServiceId) return;

        // 取得服務的 provider_id
        const { data: svc } = await db.from('services').select('provider_id').eq('id', currentServiceId).single();
        if (!svc) return;

        const comment = document.getElementById('review-comment').value.trim();
        const btn     = document.getElementById('submit-review-btn');
        btn.disabled  = true;
        btn.textContent = '送出中...';

        const { error } = await db.from('reviews').insert([{
            service_id:  currentServiceId,
            reviewer_id: currentUser.id,
            reviewee_id: svc.provider_id,
            nps_score:   selectedNps,
            comment:     comment || null
        }]);

        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">⭐</span>送出評價';

        if (error) {
            if (error.code === '23505') {
                showToast('你已經評價過這個服務了', 'info');
            } else {
                showToast('送出失敗：' + error.message, 'error');
            }
            return;
        }

        showToast('✅ 感謝你的評價！', 'success');
        document.getElementById('review-comment').value = '';
        document.getElementById('review-form-section').style.display = 'none';
        loadReviewsForService(currentServiceId);
        // 觸發服務列表重新整理（avg_nps 已由 DB trigger 更新）
        setTimeout(loadServices, 1000);
    }


    // ============================================================
    // 模組 G：Navbar + 平滑滾動 + ScrollSpy
    // ============================================================

    /** 設定 nav-link 平滑滾動 */
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1);
            const target   = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: 'smooth' });

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    /** ScrollSpy：監聽各 section 進入視口 */
    const sections = ['browse-section', 'post-task-section', 'provider-section'];
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                document.querySelectorAll('.nav-link').forEach(l => {
                    l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { threshold: 0.3 });

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });


    // ============================================================
    // 模組 H：工具函式
    // ============================================================

    /** 顯示 Toast 通知 */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast     = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    /** 格式化價格顯示 */
    function formatPrice(pricingType, price) {
        if (pricingType === 'negotiable' || !price) return '💬 面議';
        if (pricingType === 'hourly')   return `⏱ ${parseInt(price).toLocaleString()} 元/時`;
        if (pricingType === 'per_task') return `🎯 ${parseInt(price).toLocaleString()} 元/次`;
        return `${parseInt(price).toLocaleString()} 元`;
    }

    /** 格式化日期 */
    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    /** NPS 分數轉星號（用於卡片顯示） */
    function npsStars(avgNps, reviewCount) {
        if (!reviewCount || reviewCount === 0) return '☆☆☆☆☆';
        const stars = Math.round((avgNps / 10) * 5);
        return '★'.repeat(stars) + '☆'.repeat(5 - stars);
    }

    /** HTML 跳脫（防 XSS） */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    // ============================================================
    // 模組 I：管理後台（Admin Panel）
    // 身份依據：user_profiles.roles 含 'admin'
    // ============================================================

    function updateNavbarAdminBtn() {
        const btn = document.getElementById('nav-admin-btn');
        if (btn) btn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    function showAdminPanel() {
        if (!isAdmin) return;
        document.getElementById('admin-overlay').style.display = 'flex';
        switchAdminTab('services');
    }

    function closeAdminPanel() {
        document.getElementById('admin-overlay').style.display = 'none';
    }

    document.getElementById('admin-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('admin-overlay')) closeAdminPanel();
    });

    function switchAdminTab(tab) {
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.admin-tab-panel').forEach(panel => {
            panel.style.display = panel.dataset.tab === tab ? 'block' : 'none';
        });
        if (tab === 'services') loadAdminServices();
        else if (tab === 'reviews') loadAdminFlaggedReviews();
        else if (tab === 'tasks') loadAdminTasks();
    }

    // ── 服務管理 ──

    async function loadAdminServices() {
        const panel = document.getElementById('admin-services-panel');
        panel.innerHTML = '<div class="admin-no-data"><div class="loading-spinner"></div></div>';

        const { data, error } = await db.from('services')
            .select('id, title, category, status, created_at, user_profiles!services_provider_id_fkey (display_name)')
            .order('created_at', { ascending: false });

        if (error || !data) {
            panel.innerHTML = `<div class="admin-no-data">載入失敗：${error?.message || ''}</div>`;
            return;
        }
        if (data.length === 0) {
            panel.innerHTML = '<div class="admin-no-data">尚無服務資料</div>';
            return;
        }

        panel.innerHTML = `
            <table class="admin-table">
                <thead><tr>
                    <th>服務名稱</th><th>類別</th><th>服務方</th>
                    <th>狀態</th><th>上架時間</th><th>操作</th>
                </tr></thead>
                <tbody>
                    ${data.map(s => `
                        <tr>
                            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.title)}</td>
                            <td>${escapeHtml(s.category)}</td>
                            <td>${escapeHtml(s.user_profiles?.display_name || '—')}</td>
                            <td><span class="admin-status-badge ${s.status}">${s.status === 'active' ? '上架中' : '已下架'}</span></td>
                            <td>${formatDate(s.created_at)}</td>
                            <td>
                                <button class="admin-action-btn ${s.status === 'active' ? 'toggle-active' : 'toggle-inactive'}"
                                    onclick="window.adminToggleService('${s.id}', '${s.status}')">
                                    ${s.status === 'active' ? '下架' : '重新上架'}
                                </button>
                                <button class="admin-action-btn delete"
                                    onclick="window.adminDeleteService('${s.id}')">刪除</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }

    async function adminToggleService(id, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const { error } = await db.from('services').update({ status: newStatus }).eq('id', id);
        if (error) { showToast('操作失敗：' + error.message, 'error'); return; }
        showToast(newStatus === 'active' ? '✅ 服務已重新上架' : '✅ 服務已下架', 'success');
        loadAdminServices();
        loadServices();
    }

    async function adminDeleteService(id) {
        if (!confirm('確定要刪除此服務嗎？此操作無法復原。')) return;
        const { error } = await db.from('services').delete().eq('id', id);
        if (error) { showToast('刪除失敗：' + error.message, 'error'); return; }
        showToast('✅ 服務已刪除', 'success');
        loadAdminServices();
        loadServices();
    }

    // ── 評價管理（標記異常） ──

    async function loadAdminFlaggedReviews() {
        const panel = document.getElementById('admin-reviews-panel');
        panel.innerHTML = '<div class="admin-no-data"><div class="loading-spinner"></div></div>';

        const { data, error } = await db.from('reviews')
            .select('id, nps_score, comment, created_at, user_profiles!reviews_reviewer_id_fkey (display_name), services (title)')
            .eq('ai_flagged', true)
            .order('created_at', { ascending: false });

        if (error || !data) {
            panel.innerHTML = `<div class="admin-no-data">載入失敗：${error?.message || ''}</div>`;
            return;
        }
        if (data.length === 0) {
            panel.innerHTML = '<div class="admin-no-data">✅ 目前沒有被標記的評價</div>';
            return;
        }

        panel.innerHTML = `
            <table class="admin-table">
                <thead><tr>
                    <th>評價者</th><th>服務</th><th>NPS</th>
                    <th>留言</th><th>時間</th><th>操作</th>
                </tr></thead>
                <tbody>
                    ${data.map(r => `
                        <tr>
                            <td>${escapeHtml(r.user_profiles?.display_name || '匿名')}</td>
                            <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.services?.title || '—')}</td>
                            <td>${r.nps_score}</td>
                            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                ${r.comment ? escapeHtml(r.comment) : '<span style="color:var(--light-slate);">無</span>'}
                            </td>
                            <td>${formatDate(r.created_at)}</td>
                            <td>
                                <button class="admin-action-btn unflag" onclick="window.adminUnflagReview('${r.id}')">恢復顯示</button>
                                <button class="admin-action-btn delete" onclick="window.adminDeleteReview('${r.id}')">刪除</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }

    async function adminUnflagReview(id) {
        const { error } = await db.from('reviews').update({ ai_flagged: false }).eq('id', id);
        if (error) { showToast('操作失敗：' + error.message, 'error'); return; }
        showToast('✅ 評價已恢復顯示', 'success');
        loadAdminFlaggedReviews();
    }

    async function adminDeleteReview(id) {
        if (!confirm('確定要永久刪除這則評價嗎？')) return;
        const { error } = await db.from('reviews').delete().eq('id', id);
        if (error) { showToast('刪除失敗：' + error.message, 'error'); return; }
        showToast('✅ 評價已刪除', 'success');
        loadAdminFlaggedReviews();
    }

    // ── 任務管理 ──

    async function loadAdminTasks() {
        const panel = document.getElementById('admin-tasks-panel');
        panel.innerHTML = '<div class="admin-no-data"><div class="loading-spinner"></div></div>';

        const { data, error } = await db.from('task_requests')
            .select('id, title, category, status, budget, district, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !data) {
            panel.innerHTML = `<div class="admin-no-data">載入失敗：${error?.message || ''}</div>`;
            return;
        }
        if (data.length === 0) {
            panel.innerHTML = '<div class="admin-no-data">尚無任務資料</div>';
            return;
        }

        panel.innerHTML = `
            <table class="admin-table">
                <thead><tr>
                    <th>任務名稱</th><th>類別</th><th>地區</th>
                    <th>預算</th><th>狀態</th><th>時間</th><th>操作</th>
                </tr></thead>
                <tbody>
                    ${data.map(t => `
                        <tr>
                            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.title)}</td>
                            <td>${escapeHtml(t.category)}</td>
                            <td>${t.district ? escapeHtml(t.district) : '—'}</td>
                            <td>${t.budget ? t.budget.toLocaleString() + ' 元' : '面議'}</td>
                            <td><span class="admin-status-badge ${t.status}">${t.status === 'open' ? '徵求中' : '已關閉'}</span></td>
                            <td>${formatDate(t.created_at)}</td>
                            <td>
                                ${t.status === 'open'
                                    ? `<button class="admin-action-btn close-task" onclick="window.adminCloseTask('${t.id}')">關閉任務</button>`
                                    : '<span style="color:var(--light-slate);font-size:0.75rem;">已結束</span>'}
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }

    async function adminCloseTask(id) {
        if (!confirm('確定要關閉這個任務嗎？')) return;
        const { error } = await db.from('task_requests').update({ status: 'closed' }).eq('id', id);
        if (error) { showToast('操作失敗：' + error.message, 'error'); return; }
        showToast('✅ 任務已關閉', 'success');
        loadAdminTasks();
        loadOpenTasks();
    }


    // ============================================================
    // 全域暴露（供 HTML onclick 使用）
    // ============================================================
    window.showAuthModal            = showAuthModal;
    window.closeAuthModal           = closeAuthModal;
    window.filterByCategory         = filterByCategory;
    window.loadServices             = loadServices;
    window.openServiceDetailModal   = openServiceDetailModal;
    window.closeServiceDetailModal  = closeServiceDetailModal;
    window.selectNps                = selectNps;
    window.submitReview             = submitReview;
    // Admin
    window.showAdminPanel           = showAdminPanel;
    window.closeAdminPanel          = closeAdminPanel;
    window.switchAdminTab           = switchAdminTab;
    window.adminToggleService       = adminToggleService;
    window.adminDeleteService       = adminDeleteService;
    window.adminUnflagReview        = adminUnflagReview;
    window.adminDeleteReview        = adminDeleteReview;
    window.adminCloseTask           = adminCloseTask;


    // ============================================================
    // 初始化：頁面載入時自動執行
    // ============================================================
    loadServices();
    loadOpenTasks();
    console.log('🦀 ClawHelper 已啟動！');
});
