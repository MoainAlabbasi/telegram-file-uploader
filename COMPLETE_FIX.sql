-- ═══════════════════════════════════════════════════════
-- 🔧 الإصلاح الكامل لقاعدة بيانات Telegram File Manager v3.0
-- انسخ هذا الكود بالكامل والصقه في Supabase SQL Editor واضغط Run
-- ═══════════════════════════════════════════════════════

-- 1️⃣ إضافة عمود الوصف
ALTER TABLE files ADD COLUMN IF NOT EXISTS description TEXT;

-- 2️⃣ إضافة تعليق توضيحي
COMMENT ON COLUMN files.description IS 'وصف الملف الذي يكتبه المستخدم عند الرفع';

-- 3️⃣ إنشاء فهرس للبحث في الوصف (للأداء)
CREATE INDEX IF NOT EXISTS idx_files_description 
ON files USING gin(to_tsvector('arabic', COALESCE(description, '')));

-- 4️⃣ تحديث سياسات RLS للسماح بجميع العمليات
DROP POLICY IF EXISTS "Allow public insert access" ON files;
DROP POLICY IF EXISTS "Allow public select access" ON files;
DROP POLICY IF EXISTS "Allow public update access" ON files;
DROP POLICY IF EXISTS "Allow public delete access" ON files;

CREATE POLICY "Allow public insert access" ON files
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public select access" ON files
    FOR SELECT
    USING (true);

CREATE POLICY "Allow public update access" ON files
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public delete access" ON files
    FOR DELETE
    USING (true);

-- 5️⃣ تحديث view الإحصائيات
DROP VIEW IF EXISTS files_stats;
CREATE VIEW files_stats AS
SELECT 
    COUNT(*) as total_files,
    COALESCE(SUM(file_size), 0) as total_size,
    COUNT(DISTINCT file_type) as file_types_count,
    MAX(created_at) as last_upload,
    COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END) as files_with_description
FROM files;

-- 6️⃣ إعادة تحميل ذاكرة التخزين المؤقت (Schema Cache Reload)
NOTIFY pgrst, 'reload schema';

-- 7️⃣ رسالة نجاح
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '✅ تم إصلاح قاعدة البيانات بنجاح!';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '✓ تم إضافة عمود description';
    RAISE NOTICE '✓ تم إنشاء فهرس البحث';
    RAISE NOTICE '✓ تم تحديث سياسات RLS';
    RAISE NOTICE '✓ تم تحديث view الإحصائيات';
    RAISE NOTICE '✓ تم إعادة تحميل Schema Cache';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 الآن يمكنك رفع الملفات وستظهر في المعرض!';
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- 8️⃣ التحقق من النجاح
SELECT 
    '✅ عمود description' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'files' 
            AND column_name = 'description'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status
UNION ALL
SELECT 
    '✅ فهرس البحث' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_indexes 
            WHERE tablename = 'files' 
            AND indexname = 'idx_files_description'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status
UNION ALL
SELECT 
    '✅ view الإحصائيات' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.views 
            WHERE table_name = 'files_stats'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status;
