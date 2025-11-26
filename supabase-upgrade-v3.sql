-- ═══════════════════════════════════════════════════════
-- Telegram File Manager - Database Upgrade to v3.0
-- إضافة عمود الوصف وتحسينات أخرى
-- ═══════════════════════════════════════════════════════

-- إضافة عمود الوصف
ALTER TABLE files ADD COLUMN IF NOT EXISTS description TEXT;

-- إضافة تعليق توضيحي
COMMENT ON COLUMN files.description IS 'وصف الملف الذي يكتبه المستخدم عند الرفع';

-- إنشاء فهرس للبحث في الوصف (اختياري - للأداء)
CREATE INDEX IF NOT EXISTS idx_files_description ON files USING gin(to_tsvector('arabic', COALESCE(description, '')));

-- تحديث سياسة RLS للسماح بالتحديث
CREATE POLICY IF NOT EXISTS "Allow public update access" ON files
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- إنشاء view محدثة للإحصائيات
CREATE OR REPLACE VIEW files_stats AS
SELECT 
    COUNT(*) as total_files,
    SUM(file_size) as total_size,
    COUNT(DISTINCT file_type) as file_types_count,
    MAX(created_at) as last_upload,
    COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END) as files_with_description
FROM files;

-- رسالة نجاح
DO $$
BEGIN
    RAISE NOTICE '✅ تم ترقية قاعدة البيانات إلى v3.0 بنجاح!';
    RAISE NOTICE '   - تم إضافة عمود description';
    RAISE NOTICE '   - تم إنشاء فهرس البحث';
    RAISE NOTICE '   - تم تحديث الإحصائيات';
END $$;
